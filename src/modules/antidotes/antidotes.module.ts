import { Module } from '@nestjs/common';
import { AntidotesController } from './antidotes.controller';
import { AntidotesService } from './antidotes.service';
import { DeveloperModule } from '../developer/developer.module';

/**
 * Open toxicology antidote reference (poison -> antidote). Same
 * content-driven, anonymous-by-design pattern as the other domains: the
 * integrator asks for the antidote to a poison and gets the mechanism,
 * dosing guidance, antidote drug slug and citations — never patient data.
 */
@Module({
  imports: [DeveloperModule],
  controllers: [AntidotesController],
  providers: [AntidotesService],
  exports: [AntidotesService],
})
export class AntidotesModule {}
