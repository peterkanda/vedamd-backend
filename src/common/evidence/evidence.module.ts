import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { EvidenceSummaryInterceptor } from './evidence-summary.interceptor';

/**
 * Registers the global EvidenceSummaryInterceptor, which attaches a computed
 * A–D `evidenceSummary` to every `references[]` array in any response.
 */
@Module({
  providers: [{ provide: APP_INTERCEPTOR, useClass: EvidenceSummaryInterceptor }],
})
export class EvidenceModule {}
