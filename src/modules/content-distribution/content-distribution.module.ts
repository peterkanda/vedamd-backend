import { Module } from '@nestjs/common';
import { ContentDistributionController } from './content-distribution.controller';
import { ContentDistributionService } from './content-distribution.service';

/**
 * Offline content sync module — streams the signed JSON bundles to the
 * mobile app so it can refresh its baked-in clinical content (FR-150).
 */
@Module({
  controllers: [ContentDistributionController],
  providers: [ContentDistributionService],
  exports: [ContentDistributionService],
})
export class ContentDistributionModule {}
