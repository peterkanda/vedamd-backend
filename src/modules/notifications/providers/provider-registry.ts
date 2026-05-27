import { Injectable } from '@nestjs/common';
import type { NotificationProvider } from '../notifications.types';
import type { NotificationProviderAdapter } from './notification-provider.interface';
import { TwilioProvider } from './twilio.provider';
import { AfricasTalkingProvider } from './africastalking.provider';
import { SmtpProvider } from './smtp.provider';
import { WhatsAppBusinessProvider } from './whatsapp-business.provider';

/**
 * Maps a channel's `provider` string to its adapter. Twilio is shared
 * between SMS and WhatsApp — the channel type determines whether the
 * `whatsapp:` prefix is applied (passed via `metadata.providerVariant`).
 */
@Injectable()
export class NotificationProviderRegistry {
  constructor(
    private readonly twilio: TwilioProvider,
    private readonly africastalking: AfricasTalkingProvider,
    private readonly smtp: SmtpProvider,
    private readonly whatsapp: WhatsAppBusinessProvider,
  ) {}

  resolve(provider: NotificationProvider | string): {
    adapter: NotificationProviderAdapter;
    variant?: 'sms' | 'whatsapp';
  } {
    switch (provider) {
      case 'twilio-sms':
        return { adapter: this.twilio, variant: 'sms' };
      case 'twilio-whatsapp':
        return { adapter: this.twilio, variant: 'whatsapp' };
      case 'africastalking-sms':
        return { adapter: this.africastalking };
      case 'smtp':
        return { adapter: this.smtp };
      case 'whatsapp-business':
        return { adapter: this.whatsapp };
      default:
        throw new Error(`Unsupported notification provider: ${provider}`);
    }
  }

  /** All provider identifiers the platform supports — for the UI picker. */
  list(): NotificationProvider[] {
    return [
      'twilio-sms',
      'twilio-whatsapp',
      'africastalking-sms',
      'smtp',
      'whatsapp-business',
    ];
  }
}
