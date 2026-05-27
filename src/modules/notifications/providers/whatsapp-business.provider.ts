import { Injectable } from '@nestjs/common';
import type {
  DeliveryResult,
  OutboundMessage,
  WhatsAppBusinessCreds,
} from '../notifications.types';
import type { NotificationProviderAdapter } from './notification-provider.interface';

/**
 * WhatsApp Business Cloud API (Meta) direct adapter.
 *
 * Sends free-form text messages — useful within a 24-hour customer-
 * service window. Template messages (outside the window) require a
 * pre-approved Meta template; this minimal adapter accepts a template
 * name + variables in `msg.metadata` to support that case.
 *
 * Reference:
 *   https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */
@Injectable()
export class WhatsAppBusinessProvider implements NotificationProviderAdapter {
  readonly name = 'whatsapp-business';

  validateCreds(raw: unknown): void {
    const c = raw as Partial<WhatsAppBusinessCreds> | undefined;
    if (!c?.phoneNumberId || typeof c.phoneNumberId !== 'string') {
      throw new Error('WhatsApp Business creds require phoneNumberId (Meta Cloud API).');
    }
    if (!c.accessToken || typeof c.accessToken !== 'string') {
      throw new Error('WhatsApp Business creds require accessToken.');
    }
  }

  async send(rawCreds: unknown, msg: OutboundMessage): Promise<DeliveryResult> {
    const creds = rawCreds as WhatsAppBusinessCreds;
    const to = msg.to ?? '';
    if (!to) {
      return { ok: false, error: 'No recipient — channel has no default and message had no `to`.' };
    }
    const normalised = to.startsWith('+') ? to.slice(1) : to;

    // Use a Meta-approved template when metadata declares one — outside
    // the 24 h conversation window, free-form text is rejected.
    const template = msg.metadata?.template as
      | { name: string; languageCode?: string; variables?: string[] }
      | undefined;

    let payload: Record<string, unknown>;
    if (template) {
      payload = {
        messaging_product: 'whatsapp',
        to: normalised,
        type: 'template',
        template: {
          name: template.name,
          language: { code: template.languageCode ?? 'en_US' },
          components: template.variables?.length
            ? [
                {
                  type: 'body',
                  parameters: template.variables.map((v) => ({ type: 'text', text: v })),
                },
              ]
            : undefined,
        },
      };
    } else {
      payload = {
        messaging_product: 'whatsapp',
        to: normalised,
        type: 'text',
        text: { body: msg.body },
      };
    }

    const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(creds.phoneNumberId)}/messages`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        messages?: Array<{ id: string }>;
        error?: { message?: string };
      };
      if (!res.ok) {
        return {
          ok: false,
          to: normalised,
          status: String(res.status),
          error: json.error?.message ?? `WhatsApp HTTP ${res.status}`,
        };
      }
      return {
        ok: true,
        to: normalised,
        providerMessageId: json.messages?.[0]?.id,
        status: 'sent',
      };
    } catch (err) {
      return {
        ok: false,
        to: normalised,
        error: err instanceof Error ? err.message : 'WhatsApp request failed.',
      };
    }
  }
}
