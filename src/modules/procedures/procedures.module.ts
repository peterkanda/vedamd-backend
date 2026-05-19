import { Module } from '@nestjs/common';
import { ProceduresController } from './procedures.controller';
import { ProceduresService } from './procedures.service';
import { DeveloperModule } from '../developer/developer.module';

/**
 * Content-driven procedural guidance (SRS §6.3.19).
 *
 * Same pattern as conditions and drugs: integrators ask for structured
 * guidance by slug — indications, contraindications, equipment, ordered
 * steps with safety checks, red flags, post-procedure care, complications
 * and citations — without ever sending patient identity.
 */
@Module({
  imports: [DeveloperModule],
  controllers: [ProceduresController],
  providers: [ProceduresService],
  exports: [ProceduresService],
})
export class ProceduresModule {}
