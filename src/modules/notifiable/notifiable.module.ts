import { Module } from '@nestjs/common';
import { NotifiableController } from './notifiable.controller';
import { NotifiableService } from './notifiable.service';
import { DeveloperModule } from '../developer/developer.module';

/**
 * Open public-health reporting reference (WHO IHR + commonly
 * nationally-notifiable diseases). Same content-driven, anonymous-by-design
 * pattern as the other domains: the integrator asks whether a disease is
 * notifiable and how urgently, and gets guidance plus citations — never
 * patient data. National statutory lists vary.
 */
@Module({
  imports: [DeveloperModule],
  controllers: [NotifiableController],
  providers: [NotifiableService],
  exports: [NotifiableService],
})
export class NotifiableModule {}
