import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { AppConfig } from '../../config/configuration';

/**
 * SRS §6.3.9 — Operator Identity, AuthN, AuthZ.
 *
 * Verifies access tokens issued by an external OIDC provider against
 * a JWKS URL. The provider can be Zitadel, Keycloak, self-hosted
 * Supabase Auth, or any conformant OIDC IdP — VedaMD does not bundle
 * its own user store.
 *
 * Operator identity only. No patient identity ever (FR-165).
 */
@Injectable()
export class IdentityService implements OnModuleInit {
  private readonly logger = new Logger(IdentityService.name);
  private jwks?: ReturnType<typeof createRemoteJWKSet>;
  private issuer = '';
  private audience = '';

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  onModuleInit() {
    const jwksUrl = this.config.get('identity.jwksUrl', { infer: true });
    this.issuer = this.config.get('identity.issuer', { infer: true });
    this.audience = this.config.get('identity.audience', { infer: true });

    if (!jwksUrl || !this.issuer) {
      this.logger.warn(
        'Identity not configured (OIDC_JWKS_URL / OIDC_ISSUER missing); IdentityService is inert.',
      );
      return;
    }
    this.jwks = createRemoteJWKSet(new URL(jwksUrl));
  }

  /**
   * Whether OIDC verification is actually wired (JWKS + issuer present).
   * When true, callers must NOT fall back to accepting unverified tokens —
   * a verification failure means the token is bad, not that identity is
   * unconfigured.
   */
  isConfigured(): boolean {
    return !!this.jwks;
  }

  /**
   * Verify a bearer token. Returns the claims on success, null on failure.
   * Caller is responsible for any role/scope authorization.
   */
  async verifyAccessToken(token: string): Promise<JWTPayload | null> {
    if (!this.jwks) return null;
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
      });
      return payload;
    } catch {
      return null;
    }
  }
}
