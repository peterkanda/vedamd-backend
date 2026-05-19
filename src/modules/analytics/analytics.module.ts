import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

/**
 * SRS §6.3.15 — Analytics and Feedback Loop.
 * Anonymized rule invocation / fire / override metrics, per-rule dashboards,
 * structured clinician feedback aggregation.
 */
@Module({
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
