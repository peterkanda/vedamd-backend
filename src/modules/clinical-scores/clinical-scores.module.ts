import { Module } from '@nestjs/common';
import { ClinicalScoresController } from './clinical-scores.controller';
import { ClinicalScoresService } from './clinical-scores.service';
import { DeveloperModule } from '../developer/developer.module';

/**
 * Open catalogue of validated clinical scoring tools. Same content-driven,
 * anonymous-by-design pattern as conditions / drugs / procedures: the
 * integrator asks for a score definition by slug and gets the criteria,
 * scoring method, interpretation bands and citations — never patient data.
 */
@Module({
  imports: [DeveloperModule],
  controllers: [ClinicalScoresController],
  providers: [ClinicalScoresService],
  exports: [ClinicalScoresService],
})
export class ClinicalScoresModule {}
