import { Injectable } from '@nestjs/common';
import type {
  CdsHookRequest,
  CdsHookResponse,
  CdsServiceDescriptor,
} from './cds.types';

/**
 * Stub service registry. v0.1 ships the discovery contract and a no-op
 * evaluator; rule binding (CQL/DMN) lands in the Knowledge module.
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
  ];

  listServices(): CdsServiceDescriptor[] {
    return this.services;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async evaluateHook(serviceId: string, _req: CdsHookRequest): Promise<CdsHookResponse> {
    const known = this.services.find((s) => s.id === serviceId);
    if (!known) return { cards: [] };
    return { cards: [] };
  }

  async evaluateGeneric(payload: unknown): Promise<{ recommendations: unknown[] }> {
    void payload;
    return { recommendations: [] };
  }
}
