import { Module } from '@nestjs/common';
import { TenancyService } from './tenancy.service';

/**
 * SRS §6.3.10 — Multi-Tenancy.
 * Logical isolation via Postgres row-level security, per-tenant content
 * overlays, per-tenant data-residency selection.
 */
@Module({
  providers: [TenancyService],
  exports: [TenancyService],
})
export class TenancyModule {}
