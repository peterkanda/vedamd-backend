import { Module } from '@nestjs/common';
import { ToxidromesController } from './toxidromes.controller';
import { ToxidromesService } from './toxidromes.service';
import { DeveloperModule } from '../developer/developer.module';

/**
 * Toxidrome pattern-recognition reference. Same content-driven,
 * anonymous-by-design pattern as the other domains: the integrator
 * matches a presentation to a syndrome and receives the management
 * steps + linked antidote. Never receives patient data.
 */
@Module({
  imports: [DeveloperModule],
  controllers: [ToxidromesController],
  providers: [ToxidromesService],
  exports: [ToxidromesService],
})
export class ToxidromesModule {}
