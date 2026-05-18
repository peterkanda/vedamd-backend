import { Inject, Injectable } from '@nestjs/common';
import { PHI_FREE_LOGGER, type PhiFreeLogger } from '../../common/phi-free-logger';

export type AuditEventType =
  | 'cds.evaluated'
  | 'cds.override_reported'
  | 'auth.login'
  | 'auth.token_issued'
  | 'auth.token_revoked'
  | 'api_key.created'
  | 'api_key.rotated'
  | 'api_key.revoked'
  | 'bundle.published'
  | 'bundle.signed';

/**
 * Compliance-grade audit event. All identifier-bearing fields must be
 * passed through `actorId` / `subjectId`; the wrapper hashes them
 * (NFR-029, FR-123). Anything else must come from the allow-list.
 */
export interface AuditEvent {
  type: AuditEventType;
  tenantId?: string;
  /** Operator/integrator identifier (hashed before write). */
  actorId?: string;
  /** Optional secondary identifier (hashed before write). Patient IDs MUST never be passed in plaintext. */
  subjectId?: string;
  ruleId?: string;
  ruleVersion?: string;
  endpoint?: string;
  statusCode?: number;
  latencyMs?: number;
  overrideReasonCode?: string;
  /** Hashed correlation id (already hashed by caller). */
  requestId?: string;
  occurredAt?: string;
}

@Injectable()
export class AuditService {
  constructor(@Inject(PHI_FREE_LOGGER) private readonly log: PhiFreeLogger) {}

  async record(event: AuditEvent): Promise<void> {
    const occurredAt = event.occurredAt ?? new Date().toISOString();

    this.log.info('audit', {
      event: event.type,
      tenant_id: event.tenantId,
      ...(event.actorId ? { actor_id: event.actorId } : {}),
      ...(event.subjectId ? { subject_id: event.subjectId } : {}),
      ...(event.ruleId ? { rule_id: event.ruleId } : {}),
      ...(event.ruleVersion ? { rule_version: event.ruleVersion } : {}),
      ...(event.endpoint ? { endpoint: event.endpoint } : {}),
      ...(event.statusCode !== undefined ? { status_code: event.statusCode } : {}),
      ...(event.latencyMs !== undefined ? { latency_ms: event.latencyMs } : {}),
      ...(event.overrideReasonCode
        ? { override_reported: true, override_reason_code: event.overrideReasonCode }
        : {}),
      ...(event.requestId ? { request_id: event.requestId } : {}),
      timestamp: occurredAt,
    });
  }
}
