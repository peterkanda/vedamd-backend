import { Module } from '@nestjs/common';
import { DrugsController } from './drugs.controller';
import { DrugsService } from './drugs.service';
import { DeveloperModule } from '../developer/developer.module';

/**
 * SRS §6.3.4 — Drug Information Service.
 *
 * Content-driven, anonymous-by-design. Integrators ask "what's the
 * dose / interactions / pregnancy guidance for drug X?" and get
 * structured citation-bearing content back. No patient identity is
 * required or accepted at any endpoint in this module.
 */
@Module({
  imports: [DeveloperModule],
  controllers: [DrugsController],
  providers: [DrugsService],
  exports: [DrugsService],
})
export class DrugsModule {}
