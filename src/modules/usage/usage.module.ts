import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';
import { UsageInterceptor } from './usage.interceptor';
import { OperatorAuthGuard } from '../../common/operator-auth';
import { IdentityModule } from '../identity/identity.module';

/**
 * Product-usage analytics. Registers a GLOBAL interceptor that records
 * one PHI-free usage event per HTTP request (fire-and-forget), plus an
 * operator-guarded read API for the usage dashboard.
 */
@Global()
@Module({
  imports: [IdentityModule],
  controllers: [UsageController],
  providers: [
    UsageService,
    OperatorAuthGuard,
    { provide: APP_INTERCEPTOR, useClass: UsageInterceptor },
  ],
  exports: [UsageService],
})
export class UsageModule {}
