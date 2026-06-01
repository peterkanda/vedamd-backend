import { Module } from '@nestjs/common';
import { RenalDoseController } from './renal-dose.controller';
import { RenalDoseService } from './renal-dose.service';
import { DeveloperModule } from '../developer/developer.module';

/**
 * Renal dose adjustment reference (eGFR bands normal/mild/moderate/
 * severe/esrd). Structured-axis counterpart to hepatic-dose. Same
 * content-driven, anonymous-by-design pattern as the other domains.
 */
@Module({
  imports: [DeveloperModule],
  controllers: [RenalDoseController],
  providers: [RenalDoseService],
  exports: [RenalDoseService],
})
export class RenalDoseModule {}
