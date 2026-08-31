import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { DRIZZLE, type MaybeDrizzle } from '../../db/database.module';
import { notificationChannels as channelsTable } from '../../db/schema';
import { decryptJson, encryptJson } from '../../common/secrets-vault';
import type {
  ChannelCreateDto,
  ChannelSummary,
  ChannelUpdateDto,
  DeliveryResult,
  NotificationProvider,
  OutboundMessage,
} from './notifications.types';
import { NotificationProviderRegistry } from './providers/provider-registry';

/**
 * Per-integrator notification-channel store + dispatcher.
 *
 * Storage backend mirrors PoliciesService / CustomRulesService: Postgres
 * via drizzle when DATABASE_URL is configured; in-memory fallback for
 * dev / unit tests. Credentials are AEAD-encrypted (AES-256-GCM) using
 * the secrets vault with the integratorId as additional authenticated
 * data — a row from tenant A cannot be decrypted as tenant B.
 *
 * The service NEVER returns raw credentials over the API. UI receives
 * the channel summary only; rotation requires re-submitting the full
 * credential payload.
 */

interface MemRow {
  id: string;
  integratorId: string;
  name: string;
  provider: NotificationProvider | string;
  defaultRecipient?: string | null;
  senderLabel?: string | null;
  encryptedCreds: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  lastUsedAt?: string | null;
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly nestLogger = new Logger(NotificationsService.name);
  private readonly memByIntegrator = new Map<string, MemRow[]>();

  constructor(
    @Optional() @Inject(DRIZZLE) private readonly db: MaybeDrizzle = null,
    private readonly providers: NotificationProviderRegistry,
  ) {}

  onModuleInit(): void {
    if (this.db) {
      this.nestLogger.log('NotificationsService using Postgres (drizzle) storage.');
    } else {
      this.nestLogger.warn(
        'NotificationsService running with IN-MEMORY store (no DATABASE_URL). Entries are lost on restart.',
      );
    }
  }

  async list(integratorId: string): Promise<ChannelSummary[]> {
    if (this.db) {
      const rows = await this.db
        .select()
        .from(channelsTable)
        .where(eq(channelsTable.integratorId, integratorId))
        .orderBy(desc(channelsTable.createdAt));
      return rows.map(rowToSummary);
    }
    return (this.memByIntegrator.get(integratorId) ?? []).map(memToSummary);
  }

  async get(integratorId: string, id: string): Promise<ChannelSummary | null> {
    if (this.db) {
      const rows = await this.db
        .select()
        .from(channelsTable)
        .where(and(eq(channelsTable.integratorId, integratorId), eq(channelsTable.id, id)))
        .limit(1);
      if (!rows.length) return null;
      return rowToSummary(rows[0]);
    }
    return (this.memByIntegrator.get(integratorId) ?? []).find((r) => r.id === id)
      ? memToSummary((this.memByIntegrator.get(integratorId) ?? []).find((r) => r.id === id)!)
      : null;
  }

  async create(
    integratorId: string,
    dto: ChannelCreateDto,
    createdBy?: string,
  ): Promise<ChannelSummary> {
    // Provider sanity + credential shape validation BEFORE encrypting.
    const { adapter } = this.providers.resolve(dto.provider);
    adapter.validateCreds(dto.credentials);

    const id = randomUUID();
    const now = new Date().toISOString();
    const encryptedCreds = encryptJson(dto.credentials, integratorId);
    const row: MemRow = {
      id,
      integratorId,
      name: dto.name.trim(),
      provider: dto.provider,
      defaultRecipient: dto.defaultRecipient?.trim() || null,
      senderLabel: dto.senderLabel?.trim() || null,
      encryptedCreds,
      enabled: dto.enabled !== false,
      createdAt: now,
      updatedAt: now,
      createdBy,
    };

    if (this.db) {
      await this.db.insert(channelsTable).values({
        id,
        integratorId,
        name: row.name,
        provider: row.provider,
        defaultRecipient: row.defaultRecipient ?? null,
        senderLabel: row.senderLabel ?? null,
        encryptedCreds,
        enabled: row.enabled,
        createdBy,
      });
    } else {
      const arr = this.memByIntegrator.get(integratorId) ?? [];
      arr.unshift(row);
      this.memByIntegrator.set(integratorId, arr);
    }
    return memToSummary(row);
  }

  async update(integratorId: string, id: string, dto: ChannelUpdateDto): Promise<ChannelSummary> {
    const existing = await this.getInternal(integratorId, id);
    if (!existing) throw new NotFoundException(`Channel not found: ${id}`);

    let encryptedCreds = existing.encryptedCreds;
    if (dto.credentials) {
      const { adapter } = this.providers.resolve(existing.provider);
      adapter.validateCreds(dto.credentials);
      encryptedCreds = encryptJson(dto.credentials, integratorId);
    }
    const now = new Date().toISOString();
    const merged: MemRow = {
      ...existing,
      name: dto.name?.trim() ?? existing.name,
      defaultRecipient:
        dto.defaultRecipient === null
          ? null
          : (dto.defaultRecipient?.trim() ?? existing.defaultRecipient),
      senderLabel:
        dto.senderLabel === null ? null : (dto.senderLabel?.trim() ?? existing.senderLabel),
      enabled: dto.enabled ?? existing.enabled,
      encryptedCreds,
      updatedAt: now,
    };

    if (this.db) {
      await this.db
        .update(channelsTable)
        .set({
          name: merged.name,
          defaultRecipient: merged.defaultRecipient ?? null,
          senderLabel: merged.senderLabel ?? null,
          encryptedCreds: merged.encryptedCreds,
          enabled: merged.enabled,
          updatedAt: new Date(),
        })
        .where(and(eq(channelsTable.integratorId, integratorId), eq(channelsTable.id, id)));
    } else {
      const arr = this.memByIntegrator.get(integratorId) ?? [];
      const idx = arr.findIndex((r) => r.id === id);
      if (idx >= 0) arr[idx] = merged;
    }
    return memToSummary(merged);
  }

  async remove(integratorId: string, id: string): Promise<boolean> {
    if (this.db) {
      const res = await this.db
        .delete(channelsTable)
        .where(and(eq(channelsTable.integratorId, integratorId), eq(channelsTable.id, id)));
      // drizzle returns differently per dialect; treat absence-of-throw as success.
      void res;
      return true;
    }
    const arr = this.memByIntegrator.get(integratorId) ?? [];
    const idx = arr.findIndex((r) => r.id === id);
    if (idx < 0) return false;
    arr.splice(idx, 1);
    return true;
  }

  /** Send a single outbound message via the named channel. */
  async send(integratorId: string, msg: OutboundMessage): Promise<DeliveryResult> {
    const row = await this.getInternal(integratorId, msg.channelId);
    if (!row) return { ok: false, error: `Channel not found: ${msg.channelId}` };
    if (!row.enabled) return { ok: false, error: 'Channel is disabled.' };
    const recipient = msg.to ?? row.defaultRecipient ?? '';
    if (!recipient) {
      return { ok: false, error: 'No recipient — channel has no default and message had no `to`.' };
    }
    const { adapter, variant } = this.providers.resolve(row.provider);
    const creds = decryptJson(row.encryptedCreds, integratorId);
    const finalMsg: OutboundMessage = {
      ...msg,
      to: recipient,
      metadata: {
        ...(msg.metadata ?? {}),
        ...(variant === 'whatsapp' ? { providerVariant: 'whatsapp' } : {}),
      },
    };
    const result = await adapter.send(creds, finalMsg);
    // Touch lastUsedAt for the channel (best-effort; ignore failures).
    void this.touchLastUsed(integratorId, msg.channelId).catch(() => {});
    return result;
  }

  /** Resolve a channel for internal use (still scoped to the integrator). */
  private async getInternal(integratorId: string, id: string): Promise<MemRow | null> {
    if (this.db) {
      const rows = await this.db
        .select()
        .from(channelsTable)
        .where(and(eq(channelsTable.integratorId, integratorId), eq(channelsTable.id, id)))
        .limit(1);
      if (!rows.length) return null;
      const r = rows[0];
      return {
        id: r.id,
        integratorId: r.integratorId,
        name: r.name,
        provider: r.provider,
        defaultRecipient: r.defaultRecipient,
        senderLabel: r.senderLabel,
        encryptedCreds: r.encryptedCreds,
        enabled: r.enabled,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        createdBy: r.createdBy ?? undefined,
        lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
      };
    }
    return (this.memByIntegrator.get(integratorId) ?? []).find((r) => r.id === id) ?? null;
  }

  private async touchLastUsed(integratorId: string, id: string): Promise<void> {
    if (this.db) {
      await this.db
        .update(channelsTable)
        .set({ lastUsedAt: new Date() })
        .where(and(eq(channelsTable.integratorId, integratorId), eq(channelsTable.id, id)));
      return;
    }
    const arr = this.memByIntegrator.get(integratorId) ?? [];
    const row = arr.find((r) => r.id === id);
    if (row) row.lastUsedAt = new Date().toISOString();
  }

  /** List the supported provider identifiers (for the UI's create form). */
  listProviders(): NotificationProvider[] {
    return this.providers.list();
  }
}

function rowToSummary(r: typeof channelsTable.$inferSelect): ChannelSummary {
  return {
    id: r.id,
    name: r.name,
    provider: r.provider,
    defaultRecipient: r.defaultRecipient,
    senderLabel: r.senderLabel,
    enabled: r.enabled,
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
  };
}
function memToSummary(r: MemRow): ChannelSummary {
  return {
    id: r.id,
    name: r.name,
    provider: r.provider,
    defaultRecipient: r.defaultRecipient ?? null,
    senderLabel: r.senderLabel ?? null,
    enabled: r.enabled,
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt ?? null,
  };
}
