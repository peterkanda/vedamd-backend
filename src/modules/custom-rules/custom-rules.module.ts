import { Module } from '@nestjs/common';
import { CustomRulesController } from './custom-rules.controller';
import { CustomRulesService } from './custom-rules.service';
import { IdentityModule } from '../identity/identity.module';
import { OperatorAuthGuard } from '../../common/operator-auth';

@Module({
  imports: [IdentityModule],
  controllers: [CustomRulesController],
  providers: [CustomRulesService, OperatorAuthGuard],
  exports: [CustomRulesService],
})
export class CustomRulesModule {}
