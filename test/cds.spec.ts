import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { CdsService } from '../src/modules/cds/cds.service';
import { DrugsService } from '../src/modules/drugs/drugs.service';
import { CdsStrategyRegistry } from '../src/modules/cds/strategies/registry';
import { DrugDrugInteractionStrategy } from '../src/modules/cds/strategies/ddi.strategy';
import { RenalSafetyStrategy } from '../src/modules/cds/strategies/renal-safety.strategy';
import { PregnancySafetyStrategy } from '../src/modules/cds/strategies/pregnancy-safety.strategy';
import { AwareStewardshipStrategy } from '../src/modules/cds/strategies/aware-stewardship.strategy';
import { MedicationMonitoringStrategy } from '../src/modules/cds/strategies/medication-monitoring.strategy';
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
  const registry = new CdsStrategyRegistry(
    new DrugDrugInteractionStrategy(drugs),
    new RenalSafetyStrategy(drugs),
    new PregnancySafetyStrategy(drugs),
    new AwareStewardshipStrategy(drugs),
    new MedicationMonitoringStrategy(drugs),
  );
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

  it('does not fire the DDI rule on patient-view (hook mismatch)', async () => {
    const res = await makeService().evaluateHook('vedamd-patient-view', {
      hook: 'patient-view',
      hookInstance: 'test-5',
      context: { medications: ['paracetamol', 'warfarin'] },
    });
    const ddi = res.cards.filter(
      (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === 'ddi-check',
    );
    expect(ddi.length).toBe(0);
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

describe('CdsService.evaluateHook — renal-safety rule', () => {
  it('refuses prescribing metformin at CrCl 20 (prohibited renal band)', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'r1',
      context: { medications: ['metformin'], crClMlMin: 20 },
    });
    const renalCards = res.cards.filter(
      (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === 'renal-safety',
    );
    expect(renalCards.length).toBe(1);
    expect(renalCards[0].indicator).toBe('critical');
    expect(renalCards[0].summary.toLowerCase()).toContain('metformin');
    expect(renalCards[0].summary).toContain('20 mL/min');
    expect(renalCards[0].detail).toContain('Contraindicated');
  });

  it('does not fire at CrCl 35 (matches a non-prohibited renal band)', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'r2',
      context: { medications: ['metformin'], crClMlMin: 35 },
    });
    const renalCards = res.cards.filter(
      (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === 'renal-safety',
    );
    expect(renalCards.length).toBe(0);
  });

  it('does not fire when CrCl is not supplied at all', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'r3',
      context: { medications: ['metformin'] },
    });
    const renalCards = res.cards.filter(
      (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === 'renal-safety',
    );
    expect(renalCards.length).toBe(0);
  });

  it('does not fire for drugs without prohibited renal bands at low CrCl', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'r4',
      context: { medications: ['paracetamol'], crClMlMin: 15 },
    });
    const renalCards = res.cards.filter(
      (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === 'renal-safety',
    );
    expect(renalCards.length).toBe(0);
  });
});

describe('CdsService.evaluateHook — pregnancy-safety rule', () => {
  it('fires a critical card on warfarin when pregnant is true', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'p1',
      context: { medications: ['warfarin'], pregnant: true },
    });
    const cards = res.cards.filter(
      (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === 'pregnancy-safety',
    );
    expect(cards.length).toBe(1);
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary.toLowerCase()).toContain('warfarin');
    expect((cards[0].detail ?? '').toLowerCase()).toContain('teratogenic');
  });

  it('does not fire when pregnant is false', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'p2',
      context: { medications: ['warfarin'], pregnant: false },
    });
    const cards = res.cards.filter(
      (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === 'pregnancy-safety',
    );
    expect(cards.length).toBe(0);
  });

  it('does not fire on drugs without the contraindicated flag (e.g. paracetamol)', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'p3',
      context: { medications: ['paracetamol'], pregnant: true },
    });
    const cards = res.cards.filter(
      (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === 'pregnancy-safety',
    );
    expect(cards.length).toBe(0);
  });
});

describe('CdsService.evaluateHook — multi-rule composition', () => {
  it('fires DDI + renal + pregnancy in a single invocation when all apply', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'multi-1',
      context: {
        medications: ['paracetamol', 'warfarin', 'metformin'],
        crClMlMin: 20,
        pregnant: true,
      },
    });
    const byRule = (id: string) =>
      res.cards.filter(
        (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === id,
      );
    expect(byRule('ddi-check').length).toBe(1); // paracetamol + warfarin
    expect(byRule('renal-safety').length).toBe(1); // metformin at CrCl 20
    expect(byRule('pregnancy-safety').length).toBe(1); // warfarin
    expect(res.cards.length).toBe(3);
  });
});

describe('CdsService.evaluateHook — AWaRe stewardship rule', () => {
  it('fires a warning card for ciprofloxacin (Watch class)', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'a1',
      context: { medications: ['ciprofloxacin'] },
    });
    const aware = res.cards.filter(
      (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === 'aware-stewardship',
    );
    expect(aware.length).toBe(1);
    expect(aware[0].indicator).toBe('warning');
    expect(aware[0].summary).toContain('Watch');
    expect(aware[0].summary.toLowerCase()).toContain('ciprofloxacin');
    // Fluoroquinolones (J01M) have no Access sibling in the seed; the
    // formulary-specific list line is absent when the formulary holds none.
    expect(aware[0].detail ?? '').not.toContain('alternatives in this formulary');
  });

  it('does not fire for amoxicillin (Access)', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'a2',
      context: { medications: ['amoxicillin'] },
    });
    const aware = res.cards.filter(
      (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === 'aware-stewardship',
    );
    expect(aware.length).toBe(0);
  });

  it('does not fire for drugs without an AWaRe classification (e.g. paracetamol)', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'a3',
      context: { medications: ['paracetamol'] },
    });
    const aware = res.cards.filter(
      (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === 'aware-stewardship',
    );
    expect(aware.length).toBe(0);
  });

  it('lifts the AWaRe stewardship warnings from the drug record into the card detail', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'a4',
      context: { medications: ['ciprofloxacin'] },
    });
    const aware = res.cards.find(
      (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === 'aware-stewardship',
    );
    expect(aware?.detail).toContain('Stewardship warnings');
    expect((aware?.detail ?? '').toLowerCase()).toContain('tendinopathy');
  });
});

describe('CdsService.evaluateHook — medication-monitoring rule (patient-view)', () => {
  it('fires one info card per current medication with monitoring (e.g. warfarin)', async () => {
    const res = await makeService().evaluateHook('vedamd-patient-view', {
      hook: 'patient-view',
      hookInstance: 'm1',
      context: { currentMedications: ['warfarin'] },
    });
    const cards = res.cards.filter(
      (c) =>
        c.extension?.['http://vedamd.io/Card/recommendation'].ruleId ===
        'medication-monitoring-reminder',
    );
    expect(cards.length).toBe(1);
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary.toLowerCase()).toContain('warfarin');
    expect((cards[0].detail ?? '').toLowerCase()).toContain('inr');
  });

  it('fires one card per drug for multiple current medications', async () => {
    const res = await makeService().evaluateHook('vedamd-patient-view', {
      hook: 'patient-view',
      hookInstance: 'm2',
      context: { currentMedications: ['warfarin', 'metformin', 'amlodipine'] },
    });
    const cards = res.cards.filter(
      (c) =>
        c.extension?.['http://vedamd.io/Card/recommendation'].ruleId ===
        'medication-monitoring-reminder',
    );
    // warfarin and metformin have monitoring; amlodipine has monitoring too (BP at 4-week intervals).
    expect(cards.length).toBeGreaterThanOrEqual(2);
    const summaries = cards.map((c) => c.summary.toLowerCase()).join(' ');
    expect(summaries).toContain('warfarin');
    expect(summaries).toContain('metformin');
  });

  it('does not fire for drugs without a monitoring list (e.g. amoxicillin)', async () => {
    const res = await makeService().evaluateHook('vedamd-patient-view', {
      hook: 'patient-view',
      hookInstance: 'm3',
      context: { currentMedications: ['amoxicillin'] },
    });
    const cards = res.cards.filter(
      (c) =>
        c.extension?.['http://vedamd.io/Card/recommendation'].ruleId ===
        'medication-monitoring-reminder',
    );
    expect(cards.length).toBe(0);
  });

  it('does not fire when no current medications are supplied', async () => {
    const res = await makeService().evaluateHook('vedamd-patient-view', {
      hook: 'patient-view',
      hookInstance: 'm4',
      context: {},
    });
    expect(res.cards.length).toBe(0);
  });

  it('does not fire on medication-prescribe (hook mismatch)', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'm5',
      context: { currentMedications: ['warfarin'] },
    });
    const cards = res.cards.filter(
      (c) =>
        c.extension?.['http://vedamd.io/Card/recommendation'].ruleId ===
        'medication-monitoring-reminder',
    );
    expect(cards.length).toBe(0);
  });

  it('deduplicates when the same drug appears twice', async () => {
    const res = await makeService().evaluateHook('vedamd-patient-view', {
      hook: 'patient-view',
      hookInstance: 'm6',
      context: { currentMedications: ['warfarin'], medications: ['warfarin'] },
    });
    const cards = res.cards.filter(
      (c) =>
        c.extension?.['http://vedamd.io/Card/recommendation'].ruleId ===
        'medication-monitoring-reminder',
    );
    expect(cards.length).toBe(1);
  });
});
