import { Module } from '@nestjs/common';
import { IvCompatibilityController } from './iv-compatibility.controller';
import { IvCompatibilityService } from './iv-compatibility.service';
import { DeveloperModule } from '../developer/developer.module';

/**
 * Curated IV compatibility reference. Same content-driven,
 * anonymous-by-design pattern as the other domains. Reference protocols
 * only — never patient data.
 */
@Module({
  imports: [DeveloperModule],
  controllers: [IvCompatibilityController],
  providers: [IvCompatibilityService],
  exports: [IvCompatibilityService],
})
export class IvCompatibilityModule {}
