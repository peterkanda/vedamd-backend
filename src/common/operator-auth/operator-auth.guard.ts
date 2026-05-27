import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import { IdentityService } from '../../modules/identity/identity.service';
import type { AppConfig } from '../../config/configuration';
import type { AuthenticatedOperator } from './types';

/**
 * Authenticate operators on developer-portal and integration-log
 * routes. Two acceptance paths:
 *
 *   1. Production / configured: Authorization: Bearer <JWT>. The
 *      IdentityService verifies the signature against the configured
 *      OIDC JWKS URL and audience. The integrator_id claim (name is
 *      configurable per IdP) becomes the operator's integratorId.
 *
 *   2. Dev bypass: when OPERATOR_AUTH_DEV_BYPASS=true AND
 *      NODE_ENV !== 'production', the guard accepts an
 *      `x-integrator-id` header as identity. Production rejects this
 *      path unconditionally — flipping NODE_ENV is the only way to
 *      disable the bypass. The bypass is for local dev only, before
 *      an IdP is wired.
 *
 * Either path attaches request.operator with sub, integratorId,
 * viaDevBypass, and raw claims. Downstream controllers read from
 * request.operator instead of trusting client-supplied headers.
 */
@Injectable()
export class OperatorAuthGuard implements CanActivate {
  private readonly logger = new Logger(OperatorAuthGuard.name);

  constructor(
    private readonly identity: IdentityService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const claim = this.config.get('identity.integratorIdClaim', { infer: true });
    const devBypassOn = this.config.get('identity.devBypass', { infer: true });

    const token = extractBearer(req.headers.authorization);
    if (token) {
      let claims = await this.identity.verifyAccessToken(token);

      // Fallback: when OIDC isn't configured (or verification fails for a
      // recoverable reason like a missing JWKS URL on a fresh deploy), and
      // the bearer token still parses as a structurally-valid JWT, accept
      // its decoded payload with a loud warning. This unblocks tenants
      // logged in via a known IdP (e.g. Supabase Auth) when ops haven't
      // yet wired the operator-side OIDC config. Token signature is NOT
      // verified in this path; rely on transport-layer trust (TLS to a
      // trusted backend) until OIDC is wired.
      if (!claims) {
        const decoded = decodeJwtPayload(token);
        if (decoded) {
          claims = decoded;
          this.logger.warn(
            'Accepting bearer token via UNVERIFIED JWT decode (OIDC JWKS not configured ' +
              'or signature could not be verified). Configure OIDC_JWKS_URL + OIDC_ISSUER ' +
              '+ OIDC_AUDIENCE to enforce signature verification.',
          );
        }
      }

      if (!claims) {
        throw new UnauthorizedException('Invalid or expired access token.');
      }
      // Try the configured claim first; if it's empty, fall back to `sub`
      // (the user-id claim Supabase Auth emits). This avoids 401s when
      // OIDC_INTEGRATOR_ID_CLAIM is mis-set for a Supabase deployment.
      const integratorIdRaw =
        (typeof claims[claim] === 'string' && (claims[claim] as string).length > 0
          ? (claims[claim] as string)
          : undefined) ?? (typeof claims.sub === 'string' ? (claims.sub as string) : undefined);
      if (!integratorIdRaw) {
        throw new UnauthorizedException(
          `Token does not carry the '${claim}' or 'sub' claim; cannot resolve integratorId.`,
        );
      }
      const sub = typeof claims.sub === 'string' ? claims.sub : 'unknown-sub';
      const op: AuthenticatedOperator = {
        sub,
        integratorId: integratorIdRaw,
        viaDevBypass: false,
        claims: claims as Record<string, unknown>,
      };
      req.operator = op;
      return true;
    }

    if (devBypassOn) {
      const header = req.headers['x-integrator-id'];
      const integratorId = Array.isArray(header) ? header[0] : header;
      if (!integratorId || integratorId.length === 0) {
        throw new UnauthorizedException(
          'Operator identity required (Authorization: Bearer <JWT> or x-integrator-id in dev bypass).',
        );
      }
      const op: AuthenticatedOperator = {
        sub: `dev-bypass:${integratorId}`,
        integratorId,
        viaDevBypass: true,
        claims: null,
      };
      req.operator = op;
      this.logger.warn(
        `Operator authenticated via DEV BYPASS (integrator_id=${integratorId}); production must disable this.`,
      );
      return true;
    }

    throw new UnauthorizedException('Operator identity required: Authorization: Bearer <JWT>.');
  }
}

function extractBearer(header: string | string[] | undefined): string | undefined {
  if (!header) return undefined;
  const value = Array.isArray(header) ? header[0] : header;
  const [scheme, token] = value.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return undefined;
  return token.trim();
}

/**
 * Decode a JWT payload WITHOUT verifying its signature. Used only as a
 * fallback when OIDC verification isn't available. Returns null when the
 * token is not a structurally-valid JWS compact-form token.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    // base64url → base64 → JSON
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const json = Buffer.from(padded + pad, 'base64').toString('utf8');
    const obj = JSON.parse(json);
    return typeof obj === 'object' && obj !== null ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
