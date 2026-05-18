import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../../config/configuration';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private adminClient!: SupabaseClient;
  private anonClient!: SupabaseClient;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  onModuleInit() {
    const url = this.config.get('supabase.url', { infer: true });
    const anonKey = this.config.get('supabase.anonKey', { infer: true });
    const serviceRoleKey = this.config.get('supabase.serviceRoleKey', { infer: true });

    if (!url || !anonKey) {
      this.logger.warn('Supabase URL/anon key not configured; SupabaseService is inert.');
      return;
    }

    this.anonClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (serviceRoleKey) {
      this.adminClient = createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
  }

  /** Service-role client. Bypasses RLS — use only for trusted server operations. */
  admin(): SupabaseClient {
    if (!this.adminClient) {
      throw new Error('Supabase admin client not configured (SUPABASE_SERVICE_ROLE_KEY missing).');
    }
    return this.adminClient;
  }

  /** Anon client. Respects RLS; suitable for user-scoped reads. */
  anon(): SupabaseClient {
    if (!this.anonClient) {
      throw new Error('Supabase anon client not configured.');
    }
    return this.anonClient;
  }
}
