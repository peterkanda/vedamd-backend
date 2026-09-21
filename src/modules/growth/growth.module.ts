import { Module } from '@nestjs/common';
import { GrowthService } from './growth.service';
import { GrowthController } from './growth.controller';
import { DeveloperModule } from '../developer/developer.module';

/**
 * WHO/CDC growth standards as arithmetic rather than prose.
 *
 * growth-development.json states its thresholds in z-scores — underweight
 * below -2 SD, SAM below -3 SD, the IMAM classification — and nothing could
 * compute one, because the bundle carries no LMS parameters. This turns
 * those records from a description of a cut-off into something that applies
 * it. Anthropometry only: age, sex and a measurement, never an identity.
 *
 * DeveloperModule supplies what ApiKeyGuard resolves; without it the whole
 * app fails to bootstrap.
 */
@Module({
  imports: [DeveloperModule],
  controllers: [GrowthController],
  providers: [GrowthService],
  exports: [GrowthService],
})
export class GrowthModule {}
