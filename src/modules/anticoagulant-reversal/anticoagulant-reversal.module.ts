import { Module } from '@nestjs/common';
import { AnticoagulantReversalController } from './anticoagulant-reversal.controller';
import { AnticoagulantReversalService } from './anticoagulant-reversal.service';
import { DeveloperModule } from '../developer/developer.module';

/**
 * Anticoagulant reversal reference. Same content-driven,
 * anonymous-by-design pattern as the other domains. Never receives
 * patient data — returns reference protocols only.
 */
@Module({
  imports: [DeveloperModule],
  controllers: [AnticoagulantReversalController],
  providers: [AnticoagulantReversalService],
  exports: [AnticoagulantReversalService],
})
export class AnticoagulantReversalModule {}
