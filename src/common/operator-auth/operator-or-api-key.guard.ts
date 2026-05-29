import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { IdentityService } from '../../modules/identity/identity.service';
import { ApiKeysService, type ApiKeyScope } from '../../modules/developer/api-keys.service';
import type { AppConfig } from '../../config/configuration';
import type { AuthenticatedApiKey } from '../api-key-auth/types';
import { REQUIRED_SCOPES_KEY } from '../api-key-auth/require-scope.decorator';
import { authenticateOperator, extractBearer } from './authenticate-operator';

/**
 * Accept EITHER an operator JWT (interactive console use) OR a scoped
 * API key (headless integrations). When the bearer token is a `vmd_`
 * API key, the scopes declared via `@RequireScope(...)` are enforced and
 * `req.operator` is synthesised from the key's integratorId so existing
 * controllers (which read `req.operator!.integratorId`) work unchanged.
 *
 * This is what lets a developer mint a key with `clinical-audit:run` and
 * trigger audits from their own systems, without an interactive login.
 */
@Injectable()
export class OperatorOrApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(OperatorOrApiKeyGuard.name);

  constructor(
    private readonly identity: IdentityService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly apiKeys: ApiKeysService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const token = extractBearer(req.headers.authorization);

    // API-key path: only when the bearer looks like one of our keys.
    if (token && token.startsWith('vmd_')) {
      const record = await this.apiKeys.validateBearer(token);
      if (!record) throw new UnauthorizedException('Invalid or missing API key.');

      const required = this.reflector.getAllAndMerge<ApiKeyScope[]>(REQUIRED_SCOPES_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]);
      const missing = required.filter((s) => !record.scopes.includes(s));
      if (missing.length > 0) {
        throw new ForbiddenException(`API key missing required scope(s): ${missing.join(', ')}.`);
      }

      const authenticated: AuthenticatedApiKey = {
        keyId: record.id,
        integratorId: record.integratorId,
        fingerprint: record.fingerprint,
        scopes: record.scopes,
        environment: record.environment,
      };
      req.apiKey = authenticated;
      // Synthesise an operator so downstream controllers resolve the
      // tenant the same way regardless of auth method.
      req.operator = {
        sub: `api-key:${record.id}`,
        integratorId: record.integratorId,
        viaDevBypass: false,
        claims: null,
      };
      void this.apiKeys.recordUsage(record.id);
      return true;
    }

    // Otherwise fall back to operator JWT / dev-bypass.
    return authenticateOperator(req, this.identity, this.config, this.logger);
  }
}
