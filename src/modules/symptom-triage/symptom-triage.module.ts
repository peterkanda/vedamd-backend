import { Module } from '@nestjs/common';
import { SymptomTriageController } from './symptom-triage.controller';
import { SymptomTriageService } from './symptom-triage.service';
import { DeveloperModule } from '../developer/developer.module';

/**
 * Symptom-triage / differential-diagnosis reference. Backward-chaining
 * (chief complaint → ranked DDx + red flags). Same content-driven,
 * anonymous-by-design pattern as the other domains.
 */
@Module({
  imports: [DeveloperModule],
  controllers: [SymptomTriageController],
  providers: [SymptomTriageService],
  exports: [SymptomTriageService],
})
export class SymptomTriageModule {}
