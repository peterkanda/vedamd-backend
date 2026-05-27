/**
 * Per-integrator outbound notification channels.
 *
 * A channel is the integrator's binding of a *provider* (Twilio, Africa's
 * Talking, SMTP, WhatsApp Business) to the credentials needed to send
 * through it. Credentials are AEAD-encrypted server-side; the API never
 * returns them to the client.
 *
 * Used by clinical-audit alert dispatch and any future "on-rule-fire"
 * notification. Integrator-scoped only; never global; never carries
 * patient data — payloads carry rule IDs and counts, not identifiers.
 */

export type NotificationProvider =
  | 'twilio-sms'
  | 'twilio-whatsapp'
  | 'africastalking-sms'
  | 'smtp'
  | 'whatsapp-business';

export interface ChannelSummary {
  id: string;
  name: string;
  provider: NotificationProvider | string;
  defaultRecipient?: string | null;
  senderLabel?: string | null;
  enabled: boolean;
  createdAt: string;
  lastUsedAt?: string | null;
}

/**
 * Provider-specific credential shapes. The vault stores the JSON-
 * serialised shape; only the provider adapter ever decrypts it.
 */
export interface TwilioCreds {
  accountSid: string;
  authToken: string;
  /** Required: a Twilio-purchased "From" number (SMS or WhatsApp). */
  fromNumber: string;
}

export interface AfricasTalkingCreds {
  apiKey: string;
  username: string;
  /** Optional sender ID (must be approved by Africa's Talking). */
  senderId?: string;
}

export interface SmtpCreds {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromAddress: string;
  fromName?: string;
}

export interface WhatsAppBusinessCreds {
  /** Meta Cloud API phone-number ID. */
  phoneNumberId: string;
  /** Long-lived system-user access token. */
  accessToken: string;
  /** Optional WhatsApp Business Account ID for template lookups. */
  wabaId?: string;
}

export type AnyProviderCreds =
  | { provider: 'twilio-sms'; creds: TwilioCreds }
  | { provider: 'twilio-whatsapp'; creds: TwilioCreds }
  | { provider: 'africastalking-sms'; creds: AfricasTalkingCreds }
  | { provider: 'smtp'; creds: SmtpCreds }
  | { provider: 'whatsapp-business'; creds: WhatsAppBusinessCreds };

export interface ChannelCreateDto {
  name: string;
  provider: NotificationProvider;
  defaultRecipient?: string;
  senderLabel?: string;
  /** Provider-specific credentials (Twilio sid+token, SMTP host+user+pass, etc.). */
  credentials: TwilioCreds | AfricasTalkingCreds | SmtpCreds | WhatsAppBusinessCreds;
  enabled?: boolean;
}

export interface ChannelUpdateDto {
  name?: string;
  defaultRecipient?: string | null;
  senderLabel?: string | null;
  /** Provide only when rotating credentials. Omitted = unchanged. */
  credentials?: TwilioCreds | AfricasTalkingCreds | SmtpCreds | WhatsAppBusinessCreds;
  enabled?: boolean;
}

export interface OutboundMessage {
  /** Channel record id. */
  channelId: string;
  /** Overrides the channel's defaultRecipient when provided. */
  to?: string;
  /** Plain-text body. For SMTP the subject is taken from the first line if
   *  it begins with "Subject: ". */
  body: string;
  /** Optional structured metadata for adapters that support it (Twilio
   *  status callback URLs, WhatsApp template variables, etc.). Not part
   *  of the visible message body. */
  metadata?: Record<string, unknown>;
}

export interface DeliveryResult {
  ok: boolean;
  /** Provider's returned message id, where available. */
  providerMessageId?: string;
  /** Provider's reported delivery status (queued, sent, delivered, failed). */
  status?: string;
  /** Recipient finally addressed (after default-fallback). */
  to?: string;
  /** When the adapter raised an error, the human-readable explanation. */
  error?: string;
}

export interface ChannelTestDto {
  /** Optional override; channel's defaultRecipient is used if omitted. */
  to?: string;
  /** Optional override; a canned test message is used if omitted. */
  body?: string;
}
