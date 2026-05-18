import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * SRS §6.3.7 — Audit and Traceability.
 * Append-only, cryptographically chained logs of every API call, every
 * recommendation, every override. Retention per Kenya DPA 2019.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
