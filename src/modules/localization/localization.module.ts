import { Module } from '@nestjs/common';
import { LocalizationController } from './localization.controller';
import { LocalizationService } from './localization.service';

/**
 * Country/jurisdiction directory powering user country selection and the
 * multi-country roadmap. See localization.service.ts.
 */
@Module({
  controllers: [LocalizationController],
  providers: [LocalizationService],
  exports: [LocalizationService],
})
export class LocalizationModule {}
