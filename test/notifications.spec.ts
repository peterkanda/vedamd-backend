import { describe, expect, it, beforeEach } from 'vitest';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { NotificationProviderRegistry } from '../src/modules/notifications/providers/provider-registry';
import { TwilioProvider } from '../src/modules/notifications/providers/twilio.provider';
import { AfricasTalkingProvider } from '../src/modules/notifications/providers/africastalking.provider';
import { SmtpProvider } from '../src/modules/notifications/providers/smtp.provider';
import { WhatsAppBusinessProvider } from '../src/modules/notifications/providers/whatsapp-business.provider';

function makeRegistry(): NotificationProviderRegistry {
  return new NotificationProviderRegistry(
    new TwilioProvider(),
    new AfricasTalkingProvider(),
    new SmtpProvider(),
    new WhatsAppBusinessProvider(),
  );
}

function makeService(): NotificationsService {
  process.env.SECRETS_VAULT_MASTER_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const svc = new NotificationsService(null, makeRegistry());
  svc.onModuleInit();
  return svc;
}

describe('NotificationsService — channel CRUD', () => {
  let svc: NotificationsService;
  beforeEach(() => {
    svc = makeService();
  });

  it('creates a Twilio SMS channel and never returns raw credentials', async () => {
    const created = await svc.create('tenant-A', {
      name: 'On-call SMS',
      provider: 'twilio-sms',
      defaultRecipient: '+14155550001',
      credentials: {
        accountSid: 'AC0123456789abcdef0123456789abcdef',
        authToken: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        fromNumber: '+14155550000',
      },
    });
    expect(created.name).toBe('On-call SMS');
    expect(created.provider).toBe('twilio-sms');
    // Critical: the API summary must not carry credentials.
    expect((created as unknown as Record<string, unknown>).credentials).toBeUndefined();
    expect((created as unknown as Record<string, unknown>).encryptedCreds).toBeUndefined();
  });

  it('rejects invalid Twilio credential shape at create time', async () => {
    await expect(
      svc.create('tenant-A', {
        name: 'Bad twilio',
        provider: 'twilio-sms',
        credentials: { accountSid: 'not-an-AC-sid', authToken: 'tok', fromNumber: '+1234567890' },
      }),
    ).rejects.toThrow(/AC/);
  });

  it('rejects an SMTP channel missing the fromAddress', async () => {
    await expect(
      svc.create('tenant-A', {
        name: 'SMTP without sender',
        provider: 'smtp',
        credentials: {
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          username: 'me',
          password: 'pw',
          fromAddress: 'not-an-email',
        },
      }),
    ).rejects.toThrow(/fromAddress/);
  });

  it("rejects an Africa's Talking channel without username", async () => {
    await expect(
      svc.create('tenant-A', {
        name: 'AT missing user',
        provider: 'africastalking-sms',
        credentials: { apiKey: 'k' } as unknown as never,
      }),
    ).rejects.toThrow(/username/);
  });

  it('rejects a WhatsApp Business channel missing phoneNumberId', async () => {
    await expect(
      svc.create('tenant-A', {
        name: 'WA missing phone',
        provider: 'whatsapp-business',
        credentials: { accessToken: 'tok' } as unknown as never,
      }),
    ).rejects.toThrow(/phoneNumberId/);
  });

  it('is integrator-scoped — tenant B cannot see tenant A channels', async () => {
    await svc.create('tenant-A', {
      name: 'A only',
      provider: 'smtp',
      credentials: {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        username: 'me',
        password: 'pw',
        fromAddress: 'me@example.com',
      },
    });
    expect((await svc.list('tenant-B')).length).toBe(0);
  });

  it('lists all supported provider identifiers for the UI picker', () => {
    expect(svc.listProviders()).toEqual([
      'twilio-sms',
      'twilio-whatsapp',
      'africastalking-sms',
      'smtp',
      'whatsapp-business',
    ]);
  });
});
