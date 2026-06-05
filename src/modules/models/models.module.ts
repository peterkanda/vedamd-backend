import { Module } from '@nestjs/common';
import { ModelsController } from './models.controller';
import { ModelsService } from './models.service';

/**
 * Model distribution module — serves the manifest the mobile app uses
 * to download + verify the on-device MedGemma 4B build (FR-148).
 */
@Module({
  controllers: [ModelsController],
  providers: [ModelsService],
  exports: [ModelsService],
})
export class ModelsModule {}
