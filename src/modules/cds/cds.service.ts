import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CdsCard,
  CdsHookRequest,
  CdsHookResponse,
  CdsServiceDescriptor,
  StatelessCapability,
} from './cds.types';
import { CdsStrategyRegistry } from './strategies/registry';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { PHI_FREE_LOGGER, type PhiFreeLogger } from '../../common/phi-free-logger';
import type { AppConfig } from '../../config/configuration';

/**
 * Stateless evaluation service. Patient context arrives in the request,
 * is evaluated in memory, and is released when the response is sent.
 * No part of the inbound bundle is logged, cached, queued, or persisted
 * (FR-088, NFR-028).
 *
 * Rule logic is split into two halves:
 *   - DECLARATION lives in content/bundles/v.../cds-rules.json (signed,
 *     governed, versioned). Loaded via KnowledgeService.
 *   - IMPLEMENTATION lives as a CdsRuleStrategy class per rule type,
 *     wired into the CdsStrategyRegistry. The registry resolves
 *     strategies by `type`.
 */
@Injectable()
export class CdsService {
  private readonly services: CdsServiceDescriptor[] = [
    {
      id: 'vedamd-medication-prescribe',
      hook: 'medication-prescribe',
      title: 'VedaMD prescribing safety',
      description:
        'Drug-drug interactions, dose checking, pediatric/renal/hepatic adjustments, AWaRe stewardship.',
    },
    {
      id: 'vedamd-patient-view',
      hook: 'patient-view',
      title: 'VedaMD patient overview alerts',
      description:
        'Surface overdue screening, abnormal labs, and chronic-disease gaps on chart open.',
    },
  ];

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(PHI_FREE_LOGGER) private readonly log: PhiFreeLogger,
    private readonly knowledge: KnowledgeService,
    private readonly registry: CdsStrategyRegistry,
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

    const cards: CdsCard[] = [];
    let rulesEvaluated = 0;
    let rulesFired = 0;

    if (known) {
      const applicableRules = this.knowledge
        .getCdsRules()
        .filter((rule) => rule.hook === known.hook);

      for (const rule of applicableRules) {
        const strategy = this.registry.get(rule.type);
        if (!strategy) continue;
        rulesEvaluated += 1;
        try {
          const ruleCards = await strategy.evaluate(rule, req);
          if (ruleCards.length > 0) rulesFired += 1;
          cards.push(...ruleCards);
        } catch (e) {
          // A failing rule must never bring down the whole evaluation.
          // Log PHI-free and continue.
          this.log.info('cds_hook_evaluated', {
            endpoint: `POST /cds-services/${serviceId}`,
            hook: req.hook,
            rule_id: rule.id,
            rule_version: rule.ruleVersion,
            error_category: 'internal',
            cards_returned_count: 0,
            latency_ms: 0,
            status_code: 500,
            message: (e as Error).message,
          });
        }
      }
    }

    const latencyMs = Number((process.hrtime.bigint() - start) / 1_000_000n);
    this.log.info('cds_hook_evaluated', {
      endpoint: `POST /cds-services/${serviceId}`,
      hook: req.hook,
      rule_id: serviceId,
      rule_version: '0.0.0',
      rules_evaluated: rulesEvaluated,
      fired: rulesFired,
      cards_returned_count: cards.length,
      latency_ms: latencyMs,
      status_code: known ? 200 : 404,
    });
    return { cards };
  }

  async evaluateGeneric(_payload: unknown): Promise<{ recommendations: unknown[] }> {
    return { recommendations: [] };
  }
}
