import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';
import { UsageInterceptor } from './usage.interceptor';
import { OperatorAuthGuard, OperatorOrApiKeyGuard } from '../../common/operator-auth';
import { IdentityModule } from '../identity/identity.module';
import { DeveloperModule } from '../developer/developer.module';

/**
 * Product-usage analytics. Registers a GLOBAL interceptor that records
 * one PHI-free usage event per HTTP request (fire-and-forget), plus an
 * operator-guarded read API for the usage dashboard.
 *
 * DeveloperModule is imported so OperatorOrApiKeyGuard can resolve
 * ApiKeysService — the client-events POST endpoint accepts either an
 * operator JWT or an API key.
 */
@Global()
@Module({
  imports: [IdentityModule, DeveloperModule],
  controllers: [UsageController],
  providers: [
    UsageService,
    OperatorAuthGuard,
    OperatorOrApiKeyGuard,
    { provide: APP_INTERCEPTOR, useClass: UsageInterceptor },
  ],
  exports: [UsageService],
})
export class UsageModule {}
