import { Module } from '@nestjs/common';
import { DoseProtocolsController } from './dose-protocols.controller';
import { DoseProtocolsService } from './dose-protocols.service';
import { DeveloperModule } from '../developer/developer.module';

/**
 * Dose-by-diagnosis protocol catalogue.
 *
 * Curated, structured mg/kg dosing for ~104 common diagnoses. Lives
 * here (server-side, behind ApiKeyGuard) rather than in the frontend
 * bundle so the curation work isn't readable in the browser's main
 * JS file. Anonymous-by-design — no patient identity is processed at
 * this endpoint; calling code applies the protocol to a weight in the
 * frontend.
 */
@Module({
  imports: [DeveloperModule],
  controllers: [DoseProtocolsController],
  providers: [DoseProtocolsService],
  exports: [DoseProtocolsService],
})
export class DoseProtocolsModule {}
