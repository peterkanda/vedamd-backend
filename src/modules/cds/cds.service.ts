import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CdsHookRequest,
  CdsHookResponse,
  CdsServiceDescriptor,
  StatelessCapability,
} from './cds.types';
import { PHI_FREE_LOGGER, type PhiFreeLogger } from '../../common/phi-free-logger';
import type { AppConfig } from '../../config/configuration';

/**
 * Stateless evaluation service. Patient context arrives in the request,
 * is evaluated in memory, and is released when the response is sent.
 * No part of the inbound bundle is logged, cached, queued, or persisted
 * (FR-088, NFR-028).
 */
@Injectable()
export class CdsService {
  private readonly services: CdsServiceDescriptor[] = [
    {
      id: 'vedamd-patient-view',
      hook: 'patient-view',
      title: 'VedaMD patient overview alerts',
      description:
        'Surface overdue screening, abnormal labs, and chronic-disease gaps on chart open.',
    },
    {
      id: 'vedamd-medication-prescribe',
      hook: 'medication-prescribe',
      title: 'VedaMD prescribing safety',
      description:
        'Drug-drug interactions, dose checking, pediatric/renal/hepatic adjustments, AWaRe stewardship.',
    },
    {
      id: 'vedamd-imci-fever-under5',
      hook: 'patient-view',
      title: 'IMCI fever in children under 5',
      description:
        'WHO IMCI 2014 — flags suspected febrile illness in children under 5 for full IMCI assessment.',
    },
  ];

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(PHI_FREE_LOGGER) private readonly log: PhiFreeLogger,
  ) {}

  listServices(): CdsServiceDescriptor[] {
    return this.services;
  }

  capabilityStatement(): StatelessCapability {
    const extUrl = this.config.get('stateless.capabilityExtensionUrl', { infer: true });
    return {
      resourceType: 'CapabilityStatement',
      status: 'active',
      date: new Date().toISOString(),
      publisher: 'VedaMD',
      kind: 'instance',
      software: { name: 'vedamd-api', version: '0.1.0' },
      description:
        'VedaMD is a stateless Clinical Decision Support API. It accepts patient context per request, evaluates clinical rules in memory, and persists no PHI.',
      extension: [{ url: extUrl, valueBoolean: true }],
    };
  }

  async evaluateHook(serviceId: string, req: CdsHookRequest): Promise<CdsHookResponse> {
    const start = process.hrtime.bigint();
    const known = this.services.find((s) => s.id === serviceId);

    const response: CdsHookResponse = known ? { cards: [] } : { cards: [] };

    const latencyMs = Number((process.hrtime.bigint() - start) / 1_000_000n);
    this.log.info('cds_hook_evaluated', {
      endpoint: `POST /cds-services/${serviceId}`,
      hook: req.hook,
      rule_id: serviceId,
      rule_version: '0.0.0',
      cards_returned_count: response.cards.length,
      latency_ms: latencyMs,
      status_code: known ? 200 : 404,
    });
    return response;
  }

  async evaluateGeneric(_payload: unknown): Promise<{ recommendations: unknown[] }> {
    return { recommendations: [] };
  }
}
