import { Module } from '@nestjs/common';
import { AllergyController } from './allergy.controller';
import { AllergyService } from './allergy.service';
import { DeveloperModule } from '../developer/developer.module';

/**
 * Open drug allergy cross-reactivity knowledge. Same content-driven,
 * anonymous-by-design pattern as the other domains: the integrator asks
 * what a drug allergy may cross-react with and gets a risk level,
 * mechanism, recommendation and citations — never patient data.
 */
@Module({
  imports: [DeveloperModule],
  controllers: [AllergyController],
  providers: [AllergyService],
  exports: [AllergyService],
})
export class AllergyModule {}
