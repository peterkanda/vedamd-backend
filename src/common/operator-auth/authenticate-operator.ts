import { Logger, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import type { IdentityService } from '../../modules/identity/identity.service';
import type { AppConfig } from '../../config/configuration';
import type { AuthenticatedOperator } from './types';

export function extractBearer(header: string | string[] | undefined): string | undefined {
  if (!header) return undefined;
  const value = Array.isArray(header) ? header[0] : header;
  const [scheme, token] = value.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return undefined;
  return token.trim();
}

/**
 * Decode a JWT payload WITHOUT verifying its signature. Returns null
 * when the token is not a structurally-valid JWS compact-form token.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const json = Buffer.from(padded + pad, 'base64').toString('utf8');
    const obj = JSON.parse(json);
    return typeof obj === 'object' && obj !== null ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Authenticate an operator from the request and attach `req.operator`.
 * Shared by OperatorAuthGuard and OperatorOrApiKeyGuard.
 *
 * Acceptance paths:
 *  1. Bearer JWT verified against the configured OIDC JWKS.
 *  2. Bearer JWT decoded WITHOUT signature verification — ONLY outside
 *     production, as a fallback before OIDC is wired. In production this
 *     path is refused (hardening: an attacker must not be able to forge
 *     an unsigned JWT and have it accepted).
 *  3. Dev bypass via x-integrator-id — only when devBypass config is on
 *     (already forced false in production).
 */
export async function authenticateOperator(
  req: FastifyRequest,
  identity: IdentityService,
  config: ConfigService<AppConfig, true>,
  logger: Logger,
): Promise<boolean> {
  const claim = config.get('identity.integratorIdClaim', { infer: true });
  const devBypassOn = config.get('identity.devBypass', { infer: true });
  const isProd = config.get('env', { infer: true }) === 'production';

  const token = extractBearer(req.headers.authorization);
  if (token) {
    let claims = await identity.verifyAccessToken(token);

    if (!claims && !isProd && !identity.isConfigured()) {
      // Non-production fallback, ONLY when OIDC is not wired at all: accept a
      // structurally-valid JWT without signature verification so local/staging
      // work before an IdP is chosen. Once OIDC IS configured, a null result
      // means the token failed verification and must be rejected — never
      // silently downgraded to unverified. Production always refuses this path.
      const decoded = decodeJwtPayload(token);
      if (decoded) {
        claims = decoded;
        logger.warn(
          'Accepting bearer token via UNVERIFIED JWT decode (non-production fallback). ' +
            'Configure OIDC_JWKS_URL + OIDC_ISSUER + OIDC_AUDIENCE to enforce verification.',
        );
      }
    }

    if (!claims) {
      throw new UnauthorizedException('Invalid or expired access token.');
    }
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
    req.operator = {
      sub,
      integratorId: integratorIdRaw,
      viaDevBypass: false,
      claims: claims as Record<string, unknown>,
    } satisfies AuthenticatedOperator;
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
    req.operator = {
      sub: `dev-bypass:${integratorId}`,
      integratorId,
      viaDevBypass: true,
      claims: null,
    } satisfies AuthenticatedOperator;
    logger.warn(
      `Operator authenticated via DEV BYPASS (integrator_id=${integratorId}); production must disable this.`,
    );
    return true;
  }

  throw new UnauthorizedException('Operator identity required: Authorization: Bearer <JWT>.');
}
