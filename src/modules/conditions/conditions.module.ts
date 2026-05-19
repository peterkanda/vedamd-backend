import { Module } from '@nestjs/common';
import { ConditionsController } from './conditions.controller';
import { ConditionsService } from './conditions.service';
import { DeveloperModule } from '../developer/developer.module';

/**
 * Content-driven CDS surface (SRS §6.3.18).
 *
 * Returns structured clinical guidance for a named condition —
 * presentation, red flags, diagnostics, ordered management steps,
 * citations — without ever asking for patient identity. This is the
 * primary way integrators consume VedaMD when they don't need a
 * CDS Hooks workflow integration.
 */
@Module({
  imports: [DeveloperModule],
  controllers: [ConditionsController],
  providers: [ConditionsService],
  exports: [ConditionsService],
})
export class ConditionsModule {}
