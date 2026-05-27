import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationProviderRegistry } from './providers/provider-registry';
import { TwilioProvider } from './providers/twilio.provider';
import { AfricasTalkingProvider } from './providers/africastalking.provider';
import { SmtpProvider } from './providers/smtp.provider';
import { WhatsAppBusinessProvider } from './providers/whatsapp-business.provider';
import { IdentityModule } from '../identity/identity.module';
import { OperatorAuthGuard } from '../../common/operator-auth';

/**
 * Per-integrator outbound notification channels (SMS, WhatsApp, SMTP).
 * Used by clinical-audit alert dispatch and (later) on-rule-fire
 * notifications. AEAD-encrypted credentials; never returned over API.
 */
@Module({
  imports: [IdentityModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationProviderRegistry,
    TwilioProvider,
    AfricasTalkingProvider,
    SmtpProvider,
    WhatsAppBusinessProvider,
    OperatorAuthGuard,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
