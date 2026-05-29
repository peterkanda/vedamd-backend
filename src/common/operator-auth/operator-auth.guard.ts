import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import { IdentityService } from '../../modules/identity/identity.service';
import type { AppConfig } from '../../config/configuration';
import { authenticateOperator } from './authenticate-operator';

/**
 * Authenticate operators on developer-portal and integration-log routes.
 * Delegates to the shared `authenticateOperator` helper, which attaches
 * `request.operator` (verified OIDC JWT, a non-production unverified-JWT
 * fallback, or dev bypass). See that helper for the acceptance paths and
 * the production hardening.
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
    return authenticateOperator(req, this.identity, this.config, this.logger);
  }
}
