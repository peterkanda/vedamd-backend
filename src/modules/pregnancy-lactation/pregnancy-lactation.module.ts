import { Module } from '@nestjs/common';
import { PregnancyLactationController } from './pregnancy-lactation.controller';
import { PregnancyLactationService } from './pregnancy-lactation.service';
import { DeveloperModule } from '../developer/developer.module';

/**
 * Pregnancy & Lactation reference (PLLR-format narrative). Replaces
 * reliance on the FDA-retired A/B/C/D/X letter categories with the
 * structured-narrative format required since 2015. Same content-
 * driven, anonymous-by-design pattern as the other domains — never
 * receives patient data.
 */
@Module({
  imports: [DeveloperModule],
  controllers: [PregnancyLactationController],
  providers: [PregnancyLactationService],
  exports: [PregnancyLactationService],
})
export class PregnancyLactationModule {}
