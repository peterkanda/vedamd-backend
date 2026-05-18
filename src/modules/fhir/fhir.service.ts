import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MedplumClient } from '@medplum/core';
import type { AppConfig } from '../../config/configuration';

@Injectable()
export class FhirService implements OnModuleInit {
  private readonly logger = new Logger(FhirService.name);
  private client?: MedplumClient;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  onModuleInit() {
    const baseUrl = this.config.get('medplum.baseUrl', { infer: true });
    if (!baseUrl) {
      this.logger.warn('Medplum baseUrl not configured; FhirService is inert.');
      return;
    }
    this.client = new MedplumClient({ baseUrl, fetch: globalThis.fetch });
  }

  getClient(): MedplumClient {
    if (!this.client) throw new Error('FhirService not initialized.');
    return this.client;
  }
}
