import { Module } from '@nestjs/common';
import { HepaticDoseController } from './hepatic-dose.controller';
import { HepaticDoseService } from './hepatic-dose.service';
import { DeveloperModule } from '../developer/developer.module';

/**
 * Hepatic dose adjustment reference (Child-Pugh A/B/C). Structured-
 * axis counterpart to the existing renal dose adjustment. Same content-
 * driven, anonymous-by-design pattern as the other domains.
 */
@Module({
  imports: [DeveloperModule],
  controllers: [HepaticDoseController],
  providers: [HepaticDoseService],
  exports: [HepaticDoseService],
})
export class HepaticDoseModule {}
