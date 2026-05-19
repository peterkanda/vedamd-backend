import { Module } from '@nestjs/common';
import { CdsHooksController } from './cds-hooks.controller';
import { CdsEvaluateController } from './cds-evaluate.controller';
import { CdsCapabilityController } from './cds-capability.controller';
import { CdsService } from './cds.service';
import { CdsStrategyRegistry } from './strategies/registry';
import { DrugDrugInteractionStrategy } from './strategies/ddi.strategy';
import { RenalSafetyStrategy } from './strategies/renal-safety.strategy';
import { PregnancySafetyStrategy } from './strategies/pregnancy-safety.strategy';
import { AwareStewardshipStrategy } from './strategies/aware-stewardship.strategy';
import { DeveloperModule } from '../developer/developer.module';
import { DrugsModule } from '../drugs/drugs.module';

@Module({
  imports: [DeveloperModule, DrugsModule],
  controllers: [CdsHooksController, CdsEvaluateController, CdsCapabilityController],
  providers: [
    CdsService,
    CdsStrategyRegistry,
    DrugDrugInteractionStrategy,
    RenalSafetyStrategy,
    PregnancySafetyStrategy,
    AwareStewardshipStrategy,
  ],
  exports: [CdsService],
})
export class CdsModule {}
