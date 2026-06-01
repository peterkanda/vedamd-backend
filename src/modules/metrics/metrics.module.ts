import { Module } from '@nestjs/common';
import { PublicMetricsController } from './public-metrics.controller';
import { UsageModule } from '../usage/usage.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';

/**
 * Public-facing metrics endpoint. Mounted unauthenticated; feeds the
 * marketing landing page and external trust signals.
 */
@Module({
  imports: [UsageModule, KnowledgeModule],
  controllers: [PublicMetricsController],
})
export class MetricsModule {}
