import { Injectable, Logger } from '@nestjs/common';

export interface AuditEvent {
  type: string;
  tenantId?: string;
  actorId?: string;
  payload: Record<string, unknown>;
  occurredAt?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  async record(event: AuditEvent): Promise<void> {
    this.logger.log(JSON.stringify({ ...event, occurredAt: event.occurredAt ?? new Date().toISOString() }));
  }
}
