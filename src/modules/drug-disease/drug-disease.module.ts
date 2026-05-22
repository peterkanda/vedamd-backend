import { Module } from '@nestjs/common';
import { DrugDiseaseController } from './drug-disease.controller';
import { DrugDiseaseService } from './drug-disease.service';
import { DeveloperModule } from '../developer/developer.module';

/**
 * Open drug-disease / drug-condition interaction knowledge. Complements
 * drug-drug interactions: surfaces condition-based contraindications and
 * cautions by drug or by condition, anonymous by design — no patient data.
 */
@Module({
  imports: [DeveloperModule],
  controllers: [DrugDiseaseController],
  providers: [DrugDiseaseService],
  exports: [DrugDiseaseService],
})
export class DrugDiseaseModule {}
