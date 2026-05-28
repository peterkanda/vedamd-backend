import { Module } from '@nestjs/common';
import { ClinicalReferenceController } from './clinical-reference.controller';
import { ClinicalReferenceService } from './clinical-reference.service';
import { DeveloperModule } from '../developer/developer.module';

/**
 * Four unified clinical-reference domains (nursing/procedures/IPC/fluids,
 * bedside interpretation, preventive & supportive care, growth &
 * development) served from the signed bundle through one
 * /v1/clinical-reference/:domain surface. Content-driven, anonymous by
 * design — never patient data.
 */
@Module({
  imports: [DeveloperModule],
  controllers: [ClinicalReferenceController],
  providers: [ClinicalReferenceService],
  exports: [ClinicalReferenceService],
})
export class ClinicalReferenceModule {}
