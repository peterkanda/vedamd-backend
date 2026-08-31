import { Injectable } from '@nestjs/common';
import type { AfricasTalkingCreds, DeliveryResult, OutboundMessage } from '../notifications.types';
import type { NotificationProviderAdapter } from './notification-provider.interface';

/**
 * Africa's Talking SMS adapter. Widely deployed across East Africa.
 *
 * Reference: https://developers.africastalking.com/docs/sms/sending
 *
 * Endpoint:  https://api.africastalking.com/version1/messaging
 * Auth:      apiKey via `apiKey` header + username in form-body.
 * Sandbox:   sandbox.africastalking.com (when username === 'sandbox').
 */
@Injectable()
export class AfricasTalkingProvider implements NotificationProviderAdapter {
  readonly name = 'africastalking-sms';

  validateCreds(raw: unknown): void {
    const c = raw as Partial<AfricasTalkingCreds> | undefined;
    if (!c?.apiKey || typeof c.apiKey !== 'string') {
      throw new Error("Africa's Talking credentials must include apiKey.");
    }
    if (!c.username || typeof c.username !== 'string') {
      throw new Error(
        "Africa's Talking credentials must include username (use 'sandbox' for testing).",
      );
    }
  }

  async send(rawCreds: unknown, msg: OutboundMessage): Promise<DeliveryResult> {
    const creds = rawCreds as AfricasTalkingCreds;
    const to = msg.to ?? '';
    if (!to) {
      return { ok: false, error: 'No recipient — channel has no default and message had no `to`.' };
    }
    const baseHost =
      creds.username === 'sandbox'
        ? 'https://api.sandbox.africastalking.com'
        : 'https://api.africastalking.com';
    const url = `${baseHost}/version1/messaging`;
    const body = new URLSearchParams({
      username: creds.username,
      to,
      message: msg.body,
    });
    if (creds.senderId) body.set('from', creds.senderId);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          apiKey: creds.apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });
      const json = (await res.json().catch(() => ({}))) as {
        SMSMessageData?: { Recipients?: Array<{ status: string; messageId: string }> };
      };
      if (!res.ok) {
        return { ok: false, to, status: String(res.status), error: `AT HTTP ${res.status}` };
      }
      const recipients = json.SMSMessageData?.Recipients ?? [];
      const first = recipients[0];
      if (!first) {
        return {
          ok: false,
          to,
          error: "Africa's Talking returned no recipient outcome.",
        };
      }
      // Status values: "Success" | "InvalidPhoneNumber" | "InsufficientBalance" | ...
      const success = /^success$/i.test(first.status);
      return {
        ok: success,
        to,
        providerMessageId: first.messageId || undefined,
        status: first.status,
        error: success ? undefined : first.status,
      };
    } catch (err) {
      return {
        ok: false,
        to,
        error: err instanceof Error ? err.message : "Africa's Talking request failed.",
      };
    }
  }
}
