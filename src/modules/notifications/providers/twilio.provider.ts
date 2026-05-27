import { Injectable } from '@nestjs/common';
import type {
  DeliveryResult,
  OutboundMessage,
  TwilioCreds,
} from '../notifications.types';
import type { NotificationProviderAdapter } from './notification-provider.interface';

/**
 * Twilio SMS + WhatsApp adapter.
 *
 * Uses the Programmable Messaging REST API directly (no SDK dependency)
 * via fetch. The WhatsApp variant requires the From + To numbers to
 * carry the `whatsapp:` prefix; this adapter is reused for both
 * `twilio-sms` and `twilio-whatsapp` providers — the channel's
 * provider type just determines whether we prefix.
 *
 * Reference: https://www.twilio.com/docs/messaging/api/message-resource
 *            https://www.twilio.com/docs/whatsapp/api
 */
@Injectable()
export class TwilioProvider implements NotificationProviderAdapter {
  /** Set per-channel ('twilio-sms' or 'twilio-whatsapp') at send time. */
  readonly name = 'twilio';

  validateCreds(raw: unknown): void {
    const c = raw as Partial<TwilioCreds> | undefined;
    if (!c?.accountSid || typeof c.accountSid !== 'string') {
      throw new Error('Twilio credentials must include accountSid.');
    }
    if (!c.accountSid.startsWith('AC')) {
      throw new Error('Twilio accountSid must start with "AC".');
    }
    if (!c.authToken || typeof c.authToken !== 'string' || c.authToken.length < 16) {
      throw new Error('Twilio credentials must include a non-empty authToken.');
    }
    if (!c.fromNumber || typeof c.fromNumber !== 'string') {
      throw new Error(
        'Twilio credentials must include fromNumber (E.164, e.g. +14155551234).',
      );
    }
    if (!c.fromNumber.startsWith('+')) {
      throw new Error('Twilio fromNumber must be in E.164 format (start with "+").');
    }
  }

  async send(rawCreds: unknown, msg: OutboundMessage): Promise<DeliveryResult> {
    const creds = rawCreds as TwilioCreds;
    const isWhatsApp = (msg.metadata?.providerVariant as string | undefined) === 'whatsapp';
    const to = msg.to ?? '';
    if (!to) {
      return { ok: false, error: 'No recipient — channel has no default and message had no `to`.' };
    }
    const finalTo = isWhatsApp ? `whatsapp:${to}` : to;
    const finalFrom = isWhatsApp ? `whatsapp:${creds.fromNumber}` : creds.fromNumber;

    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(creds.accountSid)}/Messages.json`;
    const body = new URLSearchParams({
      To: finalTo,
      From: finalFrom,
      Body: msg.body,
    });
    const authHeader =
      'Basic ' + Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64');

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        return {
          ok: false,
          to: finalTo,
          status: String(res.status),
          error:
            typeof json.message === 'string'
              ? json.message
              : `Twilio HTTP ${res.status}`,
        };
      }
      return {
        ok: true,
        to: finalTo,
        providerMessageId: typeof json.sid === 'string' ? json.sid : undefined,
        status: typeof json.status === 'string' ? json.status : undefined,
      };
    } catch (err) {
      return {
        ok: false,
        to: finalTo,
        error: err instanceof Error ? err.message : 'Twilio request failed.',
      };
    }
  }
}
