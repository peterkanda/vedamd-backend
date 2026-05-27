import type { DeliveryResult, OutboundMessage } from '../notifications.types';

/**
 * Pluggable outbound-message provider. Each adapter (Twilio, Africa's
 * Talking, SMTP, WhatsApp Business) implements `send()`. The service
 * picks the adapter by the channel's `provider` field at send time.
 *
 * Adapters MUST:
 *   - never log raw credentials or recipient identifiers
 *   - return a DeliveryResult instead of throwing (catch HTTP errors
 *     and convert them) so the caller can record a single audit row
 *     per send attempt
 *   - implement a `validate()` that checks the credential shape at
 *     channel-creation time and a `testSend()` for the "Send test
 *     message" UI button
 */
export interface NotificationProviderAdapter {
  readonly name: string;
  /**
   * Validate the cred shape (presence + format). Called at channel
   * creation; should NOT make a network call.
   */
  validateCreds(creds: unknown): void;
  /**
   * Send a single message. Returns a structured result; never throws.
   */
  send(creds: unknown, msg: OutboundMessage): Promise<DeliveryResult>;
}
