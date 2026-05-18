import { Module } from '@nestjs/common';
import { DrugsController } from './drugs.controller';
import { DrugsService } from './drugs.service';

/**
 * SRS §6.3.4 — Drug Information Service.
 * Comprehensive pharmacology, DDI/dose/renal/hepatic/pediatric/pregnancy,
 * RxNorm + ATC + AWaRe + KEML tagging.
 */
@Module({
  controllers: [DrugsController],
  providers: [DrugsService],
  exports: [DrugsService],
})
export class DrugsModule {}
