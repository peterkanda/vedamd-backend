import { Module } from '@nestjs/common';
import { ReferenceRangesController } from './reference-ranges.controller';
import { ReferenceRangesService } from './reference-ranges.service';
import { DeveloperModule } from '../developer/developer.module';

/**
 * Open catalogue of typical adult laboratory and vital-sign reference
 * intervals. Same content-driven, anonymous-by-design pattern as the other
 * domains: the integrator asks for the normal range of an analyte and gets
 * bounds, UCUM units and a source caveat — never patient data or results.
 * Pairs with the LOINC code system to support interpretation of FHIR
 * Observations.
 */
@Module({
  imports: [DeveloperModule],
  controllers: [ReferenceRangesController],
  providers: [ReferenceRangesService],
  exports: [ReferenceRangesService],
})
export class ReferenceRangesModule {}
