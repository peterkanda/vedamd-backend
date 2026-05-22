import { Module } from '@nestjs/common';
import { PharmacogenomicsController } from './pharmacogenomics.controller';
import { PharmacogenomicsService } from './pharmacogenomics.service';
import { DeveloperModule } from '../developer/developer.module';

/**
 * Open pharmacogenomics layer (CPIC-style gene-drug guidance). Same
 * content-driven, anonymous-by-design pattern as the other domains: the
 * integrator asks what a gene-drug pair implies and gets phenotype-based
 * recommendations and citations — never a patient genotype or identity.
 */
@Module({
  imports: [DeveloperModule],
  controllers: [PharmacogenomicsController],
  providers: [PharmacogenomicsService],
  exports: [PharmacogenomicsService],
})
export class PharmacogenomicsModule {}
