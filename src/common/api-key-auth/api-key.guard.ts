import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { ApiKeysService, type ApiKeyScope } from '../../modules/developer/api-keys.service';
import { REQUIRED_SCOPES_KEY } from './require-scope.decorator';
import type { AuthenticatedApiKey } from './types';

/**
 * Authenticate the caller by `Authorization: Bearer <vmd_...>` and
 * enforce any scopes declared via `@RequireScope(...)`.
 *
 * Discovery, capability, health, and developer-portal routes are
 * intentionally NOT guarded by this; only the evaluate paths need
 * an integrator's API key.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly keys: ApiKeysService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();

    const token = extractBearer(req.headers.authorization);
    const record = await this.keys.validateBearer(token);
    if (!record) {
      throw new UnauthorizedException('Invalid or missing API key.');
    }

    const required = this.reflector.getAllAndMerge<ApiKeyScope[]>(REQUIRED_SCOPES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (required.length > 0) {
      const missing = required.filter((s) => !record.scopes.includes(s));
      if (missing.length > 0) {
        throw new ForbiddenException(`API key missing required scope(s): ${missing.join(', ')}.`);
      }
    }

    const authenticated: AuthenticatedApiKey = {
      keyId: record.id,
      integratorId: record.integratorId,
      fingerprint: record.fingerprint,
      scopes: record.scopes,
      environment: record.environment,
    };
    req.apiKey = authenticated;
    // Fire-and-forget; failure is logged inside the service.
    void this.keys.recordUsage(record.id);

    return true;
  }
}

function extractBearer(header: string | string[] | undefined): string | undefined {
  if (!header) return undefined;
  const value = Array.isArray(header) ? header[0] : header;
  const [scheme, token] = value.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return undefined;
  return token.trim();
}
