import { Module } from '@nestjs/common';
import { ImmunizationController } from './immunization.controller';
import { ImmunizationService } from './immunization.service';
import { DeveloperModule } from '../developer/developer.module';

/**
 * Open WHO EPI routine immunization schedule. Same content-driven,
 * anonymous-by-design pattern as the other domains: the integrator asks
 * for the schedule by vaccine or target disease and gets dose timings,
 * routes and citations — never patient data.
 */
@Module({
  imports: [DeveloperModule],
  controllers: [ImmunizationController],
  providers: [ImmunizationService],
  exports: [ImmunizationService],
})
export class ImmunizationModule {}
