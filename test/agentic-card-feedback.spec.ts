import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { AgenticService } from '../src/modules/agentic/agentic.service';
import { CacheService } from '../src/common/cache/cache.service';
import { CdsService } from '../src/modules/cds/cds.service';
import { CdsFeedbackService } from '../src/modules/cds-feedback/cds-feedback.service';
import type { AppConfig } from '../src/config/configuration';

/**
 * Clinician accept / override on LLM-generated cards must be attributable to
 * the reasoner. Unregistered, that feedback lands as `ruleId: null` and the
 * adoption rate of AI advice can't be separated from the deterministic rules'.
 */
describe('AgenticService — LLM cards are registered for feedback attribution', () => {
  const config = {
    get: (key: string) => (key === 'redis.cdsEvaluateTtlSeconds' ? 0 : undefined),
  } as unknown as ConfigService<AppConfig, true>;
  const log = { info: () => undefined, warn: () => undefined };

  function makeCds(): CdsService {
    const cds = new CdsService(config, log as never, {} as never, {} as never, {} as never);
    vi.spyOn(cds, 'evaluateHook').mockResolvedValue({ cards: [] });
    return cds;
  }

  it('gives each returned LLM card a UUID that feedback resolves to agentic-reasoner', async () => {
    const cds = makeCds();
    const knowledge = {
      drugs: [{ slug: 'warfarin', inn: 'warfarin', summary: 'anticoagulant' }],
      interactions: [],
      conditions: [],
      procedures: [],
      rules: [],
    };
    const retriever = {
      retrieve: () => knowledge,
      totalRecords: () => 1,
      resolveCitationStrength: () => undefined,
    };
    const router = {
      anyConfigured: () => true,
      complete: vi.fn().mockResolvedValue({
        provider: 'fake',
        model: 'fake-medical',
        medical: true,
        text: JSON.stringify({
          cards: [
            {
              summary: 'Check INR before continuing warfarin',
              indicator: 'warning',
              confidence: 0.9,
              citations: [{ kind: 'drug', id: 'warfarin', label: 'Warfarin' }],
            },
          ],
        }),
      }),
    };

    const svc = new AgenticService(
      retriever as never,
      router as never,
      cds,
      new CacheService(null),
      config,
      log as never,
    );
    const res = await svc.evaluate({ mode: 'agentic', medications: ['warfarin'] });

    const card = res.cards.find((c) => c.summary.startsWith('Check INR'));
    expect(card?.uuid).toBeTruthy();
    expect(cds.lookupCard(card!.uuid!)).toMatchObject({
      ruleId: 'agentic-reasoner',
      model: 'fake-medical',
      indicator: 'warning',
    });

    const feedback = new CdsFeedbackService(null, cds);
    await feedback.ingest('tenant-A', 'vedamd-agentic', {
      feedback: [{ card: card!.uuid!, outcome: 'accepted' }],
    });
    const summary = await feedback.summaryByRule('tenant-A');
    expect(summary).toEqual([
      expect.objectContaining({ ruleId: 'agentic-reasoner', accepted: 1, overridden: 0 }),
    ]);
  });
});
