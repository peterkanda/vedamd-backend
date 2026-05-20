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
      const claims = await this.identity.verifyAccessToken(token);
      if (!claims) {
        throw new UnauthorizedException('Invalid or expired access token.');
      }
      const integratorId = claims[claim];
      if (typeof integratorId !== 'string' || integratorId.length === 0) {
        throw new UnauthorizedException(
          `Token does not carry the '${claim}' claim; cannot resolve integratorId.`,
        );
      }
      const sub = typeof claims.sub === 'string' ? claims.sub : 'unknown-sub';
      const op: AuthenticatedOperator = {
        sub,
        integratorId,
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
