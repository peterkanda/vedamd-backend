import { Module } from '@nestjs/common';
import { CdsHooksController } from './cds-hooks.controller';
import { CdsEvaluateController } from './cds-evaluate.controller';
import { CdsCapabilityController } from './cds-capability.controller';
import { CdsService } from './cds.service';

@Module({
  controllers: [CdsHooksController, CdsEvaluateController, CdsCapabilityController],
  providers: [CdsService],
  exports: [CdsService],
})
export class CdsModule {}
