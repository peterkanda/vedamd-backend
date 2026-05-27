import { Module } from '@nestjs/common';
import { ClinicalToolsController } from './clinical-tools.controller';
import { ClinicalToolsService } from './clinical-tools.service';
import { DeveloperModule } from '../developer/developer.module';

/**
 * Reference-data backbone for the /app/tools bedside calculators.
 *
 * Paediatric mg/kg dose tables (paracetamol, ibuprofen, amoxicillin,
 * ceftriaxone, salbutamol, prednisolone, zinc, ORS, cotrimoxazole),
 * the IMCI / APLS paediatric vital-sign reference table, and the
 * normative axes + thresholds for NEWS2 / qSOFA / Wells PE /
 * CHA₂DS₂-VASc. Used to live in the frontend bundle (readable in
 * every browser) — moved server-side behind ApiKeyGuard + content:read
 * so the curated reference set isn't IP leaked.
 *
 * Calculator math (BMI, eGFR CKD-EPI 2021, Parkland fluid, MELD-3.0,
 * sum-of-axes for NEWS2/qSOFA/Wells/CHA₂DS₂-VASc) stays in the
 * frontend — only the constants ship here.
 */
@Module({
  imports: [DeveloperModule],
  controllers: [ClinicalToolsController],
  providers: [ClinicalToolsService],
  exports: [ClinicalToolsService],
})
export class ClinicalToolsModule {}
