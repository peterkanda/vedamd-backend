import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { CdsService } from '../src/modules/cds/cds.service';
import { DrugsService } from '../src/modules/drugs/drugs.service';
import { CdsStrategyRegistry } from '../src/modules/cds/strategies/registry';
import { DrugDrugInteractionStrategy } from '../src/modules/cds/strategies/ddi.strategy';
import { PhiFreeLogger } from '../src/common/phi-free-logger';
import type { AppConfig } from '../src/config/configuration';
import { makeKnowledgeService } from './helpers/knowledge';

function makeService(): CdsService {
  const config = {
    get: (key: string) => {
      if (key === 'stateless.capabilityExtensionUrl') {
        return 'http://vedamd.io/CapabilityStatement/stateless';
      }
      if (key === 'audit.hashSecret') return 'test-secret';
      return undefined;
    },
  } as unknown as ConfigService<AppConfig, true>;
  const log = new PhiFreeLogger({ service: 'test', hashSecret: 'test-secret', strict: true });
  const knowledge = makeKnowledgeService();
  const drugs = new DrugsService(knowledge);
  drugs.onModuleInit();
  const registry = new CdsStrategyRegistry(new DrugDrugInteractionStrategy(drugs));
  return new CdsService(config, log, knowledge, registry);
}

describe('CdsService', () => {
  it('exposes a CDS Hooks service descriptor list', () => {
    const services = makeService().listServices();
    expect(services.length).toBeGreaterThan(0);
    for (const s of services) {
      expect(s.id).toBeTruthy();
      expect(s.hook).toBeTruthy();
      expect(s.title).toBeTruthy();
    }
  });

  it('returns an empty card set for unknown service ids', async () => {
    const res = await makeService().evaluateHook('does-not-exist', {
      hook: 'patient-view',
      hookInstance: 'x',
      context: {},
    });
    expect(res.cards).toEqual([]);
  });

  it('declares stateless: true in its CapabilityStatement (FR-093)', () => {
    const cap = makeService().capabilityStatement();
    expect(cap.resourceType).toBe('CapabilityStatement');
    expect(cap.extension).toContainEqual({
      url: 'http://vedamd.io/CapabilityStatement/stateless',
      valueBoolean: true,
    });
  });
});

describe('CdsService.evaluateHook — drug-drug interaction rule (end-to-end)', () => {
  it('fires a moderate-severity card for paracetamol + warfarin on medication-prescribe', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'test-1',
      context: { medications: ['paracetamol', 'warfarin'] },
    });
    expect(res.cards.length).toBe(1);
    const card = res.cards[0];
    expect(card.indicator).toBe('warning');
    expect(card.summary).toMatch(/MODERATE/);
    expect(card.summary.toLowerCase()).toContain('paracetamol');
    expect(card.summary.toLowerCase()).toContain('warfarin');
    expect(card.detail).toContain('Mechanism');
    expect(card.detail).toContain('Management');
    expect(card.extension?.['http://vedamd.io/Card/recommendation'].ruleId).toBe('ddi-check');
  });

  it('returns zero cards when only one drug is supplied', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'test-2',
      context: { medications: ['paracetamol'] },
    });
    expect(res.cards.length).toBe(0);
  });

  it('returns zero cards when no known interaction exists', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'test-3',
      context: { medications: ['paracetamol', 'amlodipine'] },
    });
    expect(res.cards.length).toBe(0);
  });

  it('reads proposed + current medications from separate fields', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'test-4',
      context: { proposed: ['paracetamol'], current: ['warfarin'] },
    });
    expect(res.cards.length).toBe(1);
  });

  it('does not fire the rule on patient-view (hook mismatch)', async () => {
    const res = await makeService().evaluateHook('vedamd-patient-view', {
      hook: 'patient-view',
      hookInstance: 'test-5',
      context: { medications: ['paracetamol', 'warfarin'] },
    });
    expect(res.cards.length).toBe(0);
  });

  it('silently ignores unknown drug slugs', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'test-6',
      context: { medications: ['unobtanium', 'warfarin'] },
    });
    expect(res.cards.length).toBe(0);
  });

  it('emits a card carrying VedaMD traceability metadata (rule id, version, evidence)', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'test-7',
      context: { medications: ['paracetamol', 'warfarin'] },
    });
    const meta = res.cards[0].extension?.['http://vedamd.io/Card/recommendation'];
    expect(meta).toBeTruthy();
    expect(meta!.ruleId).toBe('ddi-check');
    expect(meta!.ruleVersion).toBe('0.1.0-placeholder');
    expect(meta!.evidenceLevel).toBe('expert-consensus');
    expect(Date.parse(meta!.generatedAt)).not.toBeNaN();
  });
});
