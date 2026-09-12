import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditService } from './audit.service';
import { ClinicalAuditInterceptor } from './clinical-audit.interceptor';
import { IntegrationLogModule } from '../integration-log/integration-log.module';

/**
 * SRS §6.3.7 — Audit and Traceability.
 * Append-only, cryptographically chained logs of every API call, every
 * recommendation, every override. Retention per Kenya DPA 2019.
 *
 * The interceptor registered here is what actually writes the trail. Before
 * it, `AuditService` was injectable everywhere and called nowhere.
 */
@Global()
@Module({
  imports: [IntegrationLogModule],
  providers: [AuditService, { provide: APP_INTERCEPTOR, useClass: ClinicalAuditInterceptor }],
  exports: [AuditService],
})
export class AuditModule {}
