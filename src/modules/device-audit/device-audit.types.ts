/**
 * One on-device answer, as reported by the app.
 *
 * Strict allow-list, like the integration log: anything not on this type is
 * rejected at the boundary rather than stored. There is intentionally no field
 * that can carry the clinician's question, the model's answer or any patient
 * detail — the app hashes the question client-side and sends only that.
 */
export interface DeviceAnswerReport {
  /** Client-generated id so a retried sync is idempotent. */
  clientEventId: string;
  /** ISO 8601 timestamp from the device. */
  occurredAt: string;
  /** HMAC of the question, computed on the device. Never the text. */
  questionHash: string;
  /** 'ondevice' | a cloud provider name | 'refused'. */
  engine: string;
  modelVersion?: string;
  contentVersion?: string;
  grounded: boolean;
  refused: boolean;
  complete: boolean;
  /** Bundle records cited, as `domain/slug`. */
  sourceIds?: string[];
  latencyMs?: number;
  appVersion?: string;
}

export const DEVICE_ANSWER_ALLOWED_KEYS = [
  'clientEventId',
  'occurredAt',
  'questionHash',
  'engine',
  'modelVersion',
  'contentVersion',
  'grounded',
  'refused',
  'complete',
  'sourceIds',
  'latencyMs',
  'appVersion',
] as const satisfies ReadonlyArray<keyof DeviceAnswerReport>;

// Compile-time assertion that the runtime allow-list covers every key.
type _ExhaustiveKeys =
  Exclude<keyof DeviceAnswerReport, (typeof DEVICE_ANSWER_ALLOWED_KEYS)[number]> extends never
    ? true
    : ['DEVICE_ANSWER_ALLOWED_KEYS is missing keys from DeviceAnswerReport'];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _exhaustive: _ExhaustiveKeys = true;

/** Most reports accepted in one sync, so a long offline spell can't flood. */
export const MAX_REPORTS_PER_SYNC = 200;
