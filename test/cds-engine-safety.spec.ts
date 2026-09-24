import { describe, expect, it } from 'vitest';
import { makeKnowledgeService } from './helpers/knowledge';
import { AllergyService } from '../src/modules/allergy/allergy.service';
import { DrugsService } from '../src/modules/drugs/drugs.service';
import { DrugDrugInteractionStrategy } from '../src/modules/cds/strategies/ddi.strategy';
import { RenalSafetyStrategy } from '../src/modules/cds/strategies/renal-safety.strategy';
import { PregnancySafetyStrategy } from '../src/modules/cds/strategies/pregnancy-safety.strategy';
import { calculateDose } from '../src/modules/drugs/drugs.dosing';
import { ImciMalariaUnder5Strategy } from '../src/modules/cds/strategies/imci-malaria-under5.strategy';
import { AdultMalariaStrategy } from '../src/modules/cds/strategies/adult-malaria.strategy';
import { ImciPneumoniaUnder5Strategy } from '../src/modules/cds/strategies/imci-pneumonia-under5.strategy';
import { DkaRecognitionStrategy } from '../src/modules/cds/strategies/dka-recognition.strategy';
import { ImciDiarrhoeaUnder5Strategy } from '../src/modules/cds/strategies/imci-diarrhoea-under5.strategy';
import { StatusEpilepticusStrategy } from '../src/modules/cds/strategies/status-epilepticus.strategy';
import { AnaphylaxisRecognitionStrategy } from '../src/modules/cds/strategies/anaphylaxis-recognition.strategy';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';
import { CdsService } from '../src/modules/cds/cds.service';
import { CdsNormalizerService } from '../src/modules/cds/normalize/cds-normalizer.service';
import type { CdsStrategyRegistry } from '../src/modules/cds/strategies/registry';
import { PhiFreeLogger } from '../src/common/phi-free-logger';
import type { ConfigService } from '@nestjs/config';

/**
 * Regression tests for clinical-safety defects in the deterministic engine,
 * run against the real signed bundle so a data-shape problem in the content
 * shows up here rather than at the bedside.
 */

const knowledge = makeKnowledgeService();
const allergy = new AllergyService(knowledge);
allergy.onModuleInit();
const drugs = new DrugsService(knowledge, allergy);
drugs.onModuleInit();

const rule = (id: string) => {
  const r = knowledge.getCdsRules().find((x) => x.id === id);
  if (!r) throw new Error(`rule ${id} missing from bundle`);
  return r;
};
const req = (context: Record<string, unknown>, hook = 'medication-prescribe'): CdsHookRequest => ({
  hook,
  hookInstance: 'test',
  context,
});

describe('drug-drug interactions', () => {
  const ddi = new DrugDrugInteractionStrategy(drugs);

  // 14 bundle records use the severity "contraindicated", which had no
  // indicator mapping — the card went out with no indicator at all, so it was
  // never critical and never soft-blocked at order-sign.
  it.each([
    ['sacubitril-valsartan', 'lisinopril'],
    ['apixaban', 'itraconazole'],
    ['rivaroxaban', 'itraconazole'],
  ])('flags contraindicated pair %s + %s as critical', async (a, b) => {
    const cards = await ddi.evaluate(rule('ddi-check'), req({ medications: [a, b] }));
    const card = cards.find((c) => c.summary.startsWith('CONTRAINDICATED'));
    expect(card?.indicator).toBe('critical');
  });

  it('counts contraindicated pairs as major interactions', () => {
    const res = drugs.checkInteractions(['apixaban', 'itraconazole']);
    expect(res.interactions.some((i) => i.severity === 'contraindicated')).toBe(true);
  });

  it('never emits a card without an indicator', async () => {
    const all = knowledge.getInteractions();
    const severities = [...new Set(all.map((i) => i.severity))];
    for (const sev of severities) {
      const pair = all.find((i) => i.severity === sev)!;
      const cards = await ddi.evaluate(
        rule('ddi-check'),
        req({ medications: [pair.slugA, pair.slugB] }),
      );
      for (const c of cards) expect(c.indicator, `${sev}: ${c.summary}`).toBeDefined();
    }
  });
});

describe('renal safety', () => {
  const renal = new RenalSafetyStrategy(drugs);
  const at = (medications: string[], crClMlMin: number) =>
    renal.evaluate(rule('renal-safety'), req({ medications, crClMlMin }));

  // Bands are authored as inclusive integers (0–29 / 30–59): CrCl 29 used to
  // match nothing because the upper bound was treated as exclusive.
  it.each([29, 29.5, 0])('flags ibuprofen at CrCl %s', async (crCl) => {
    const cards = await at(['ibuprofen'], crCl);
    expect(cards[0]?.indicator).toBe('critical');
  });

  it('does not flag ibuprofen at CrCl 30', async () => {
    expect(await at(['ibuprofen'], 30)).toEqual([]);
  });

  // "CONTRAINDICATED." / "AVOID." bands carried no prohibited flag.
  it.each([
    ['dabigatran', 20],
    ['rivaroxaban', 10],
    ['lithium', 20],
    ['nitrofurantoin', 20],
    ['spironolactone', 20],
  ])('flags %s at CrCl %s as critical', async (drug, crCl) => {
    const cards = await at([drug], crCl);
    expect(cards[0]?.indicator).toBe('critical');
  });

  it('keeps dabigatran 110 mg band at exactly CrCl 30 (half-open bands)', async () => {
    expect(await at(['dabigatran'], 30)).toEqual([]);
    expect(await at(['dabigatran'], 29.5)).toHaveLength(1);
  });

  // 75 bands used creatinineClearanceMin/Max, which were never read, so the
  // first band matched every CrCl.
  it('reads creatinineClearance* band keys (fondaparinux, sotalol)', async () => {
    expect((await at(['fondaparinux'], 20))[0]?.indicator).toBe('critical');
    expect((await at(['sotalol'], 20))[0]?.indicator).toBe('critical');
    const fonda = calculateDose(drugs.get('fondaparinux')!, {
      weightKg: 70,
      ageYears: 40,
      crClMlMin: 120,
    });
    expect(JSON.stringify(fonda)).not.toMatch(/Half dose/);
  });

  it('warns (not critical) on qualified avoidance — morphine "avoid where possible"', async () => {
    const cards = await at(['morphine'], 20);
    expect(cards[0]?.indicator).toBe('warning');
    expect(cards[0]?.summary).toMatch(/Renal caution/);
  });

  // tenofovir-alafenamide stores dosing.renal as a string; the strategy threw
  // and every other renal card in the request was lost with it.
  it('still flags a co-prescribed drug alongside a malformed record', async () => {
    const cards = await at(['tenofovir-alafenamide', 'ibuprofen'], 20);
    expect(cards.map((c) => c.summary).join()).toMatch(/Ibuprofen/i);
  });
});

describe('pregnancy safety', () => {
  const preg = new PregnancySafetyStrategy(drugs);
  const inPregnancy = (medications: string[]) =>
    preg.evaluate(rule('pregnancy-safety'), req({ medications, pregnant: true }));

  // 21 records store pregnancy as a string and were never flagged; one stores
  // null, which threw and dropped every pregnancy card in the request.
  it.each(['tetracycline', 'pravastatin', 'valsartan', 'ethinylestradiol'])(
    'flags %s (pregnancy stored as text) in pregnancy',
    async (drug) => {
      const cards = await inPregnancy([drug]);
      expect(cards).toHaveLength(1);
    },
  );

  it('survives a record whose pregnancy field is null', async () => {
    const cards = await inPregnancy(['grapefruit-juice', 'warfarin']);
    expect(cards.map((c) => c.summary).join()).toMatch(/warfarin/i);
  });
});

describe('a rule that throws', () => {
  // A crashed rule used to vanish with a 200, indistinguishable from a patient
  // with nothing to flag. It must say the check did not run.
  it('produces a visible "could not run" warning instead of silence', async () => {
    const config = {
      get: (k: string) =>
        k === 'stateless.capabilityExtensionUrl' ? 'http://vedamd.io/stateless' : undefined,
    } as unknown as ConfigService<never, true>;
    const log = new PhiFreeLogger({
      service: 'test',
      hashSecret: 's',
      strict: true,
      level: 'fatal',
    });
    const throwing = {
      type: 'renal-safety',
      evaluate: async () => {
        throw new Error('boom');
      },
    };
    const registry = {
      get: (type: string) => (type === 'renal-safety' ? throwing : null),
      outcomeFallback: () => null,
    } as unknown as CdsStrategyRegistry;
    const normalizer = new CdsNormalizerService(knowledge, drugs);
    normalizer.rebuildIndex();
    const cds = new CdsService(config, log, knowledge, registry, normalizer);

    const res = await cds.evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 't',
      context: { medications: ['ibuprofen'], crClMlMin: 20 },
    });
    const failed = res.cards.find((c) => c.summary.startsWith('Safety check could not run'));
    expect(failed?.indicator).toBe('warning');
  });
});

describe('malaria — missing test result is not a negative test', () => {
  const imci = new ImciMalariaUnder5Strategy();
  const adult = new AdultMalariaStrategy();
  const pv = (context: Record<string, unknown>) => req(context, 'patient-view');

  it.each([
    [
      'IMCI under-5',
      () =>
        imci.evaluate(
          rule('imci-malaria-under5'),
          pv({ ageMonths: 24, malariaContextProvided: true }),
        ),
    ],
    [
      'adult',
      () =>
        adult.evaluate(rule('adult-malaria'), pv({ ageYears: 30, malariaContextProvided: true })),
    ],
  ])(
    '%s: no RDT result → "test before treating", never "do NOT give antimalarial"',
    async (_n, run) => {
      const cards = await run();
      expect(cards[0].indicator).toBe('warning');
      expect(cards[0].summary).toMatch(/not recorded/);
      expect(JSON.stringify(cards)).not.toMatch(/Do NOT give empirical antimalarial/);
    },
  );

  it('still gives the negative-RDT advice for an explicit negative', async () => {
    const cards = await adult.evaluate(
      rule('adult-malaria'),
      pv({ ageYears: 30, malariaContextProvided: true, rdtPositive: false }),
    );
    expect(cards[0].summary).toMatch(/RDT negative/);
  });

  // AL is dosed by weight band; "4 tablets" was given to everyone aged 12+.
  it.each([
    [28, '3 tablets'],
    [20, '2 tablets'],
    [60, '4 tablets'],
  ])('adult AL at %s kg → %s', async (weightKg, expected) => {
    const cards = await adult.evaluate(
      rule('adult-malaria'),
      pv({ ageYears: 12, weightKg, malariaContextProvided: true, rdtPositive: true }),
    );
    expect(cards[0].detail).toContain(expected);
  });
});

describe('missing inputs are not reassurance', () => {
  const pv = (context: Record<string, unknown>) => req(context, 'patient-view');
  const ruleOfType = (type: string) => {
    const r = knowledge.getCdsRules().find((x) => x.type === type);
    if (!r) throw new Error(`no rule of type ${type}`);
    return r;
  };

  it('IMCI pneumonia: no respiratory rate → count it, not "no pneumonia"', async () => {
    const cards = await new ImciPneumoniaUnder5Strategy().evaluate(
      ruleOfType('imci-pneumonia-under5'),
      pv({ ageMonths: 18 }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/not recorded/);
  });

  it('DKA: bedside glucose counts toward hyperglycaemia', async () => {
    const cards = await new DkaRecognitionStrategy().evaluate(
      ruleOfType('dka-recognition'),
      pv({ suspectedDka: true, bloodGlucoseMmolL: 28, venousPh: 7.1, bloodKetonesMmolL: 4 }),
    );
    expect(cards[0].indicator).toBe('critical');
  });

  it('DKA: nothing measured → measure, not "no DKA features"', async () => {
    const cards = await new DkaRecognitionStrategy().evaluate(
      ruleOfType('dka-recognition'),
      pv({ suspectedDka: true }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).not.toMatch(/No DKA/);
  });

  it('IMCI diarrhoea: severe signs classify even without a recorded duration', async () => {
    const cards = await new ImciDiarrhoeaUnder5Strategy().evaluate(
      ruleOfType('imci-diarrhoea-under5'),
      pv({ ageMonths: 14, dehydrationSigns: ['lethargic-or-unconscious', 'skin-pinch-very-slow'] }),
    );
    expect(cards[0].indicator).toBe('critical');
  });

  it('IMCI diarrhoea: one severe + one some sign is at least Plan B, not "no signs"', async () => {
    const cards = await new ImciDiarrhoeaUnder5Strategy().evaluate(
      ruleOfType('imci-diarrhoea-under5'),
      pv({
        ageMonths: 14,
        daysOfDiarrhoea: 2,
        dehydrationSigns: ['unable-to-drink-or-drinks-poorly', 'skin-pinch-slow'],
      }),
    );
    expect(cards[0].summary).toMatch(/Plan B/);
  });

  it('IMCI diarrhoea: stays silent with no diarrhoea information at all', async () => {
    const cards = await new ImciDiarrhoeaUnder5Strategy().evaluate(
      ruleOfType('imci-diarrhoea-under5'),
      pv({ ageMonths: 14 }),
    );
    expect(cards).toEqual([]);
  });
});

describe('allergy matching ignores salt and form words', () => {
  it('a morphine sulphate allergy does not flag magnesium sulphate', () => {
    const review = drugs.safetyReview(['magnesium-sulphate'], undefined, undefined, undefined, [
      'Morphine sulphate',
    ]);
    expect(review.allergyFlags).toEqual([]);
  });

  it('a morphine sulphate allergy still flags morphine', () => {
    const review = drugs.safetyReview(['morphine'], undefined, undefined, undefined, [
      'Morphine sulphate',
    ]);
    expect(review.allergyFlags.length).toBeGreaterThan(0);
  });
});

describe('paediatric emergency doses', () => {
  const pv = (context: Record<string, unknown>) => req(context, 'patient-view');
  const se = new StatusEpilepticusStrategy();
  const ana = new AnaphylaxisRecognitionStrategy();
  const seizing = (extra: Record<string, unknown>) =>
    se.evaluate(
      rule('status-epilepticus'),
      pv({
        suspectedSeizure: true,
        activeConvulsion: true,
        seizureDurationMinutes: 10,
        ...extra,
      }),
    );

  it('an 8 kg infant gets a per-kg midazolam dose, not "10 mg or 5 mg"', async () => {
    const [card] = await seizing({ ageYears: 1, weightKg: 8 });
    expect(card.detail).toContain('IM midazolam 1.6 mg');
    expect(card.detail).not.toMatch(/midazolam 10 mg/);
  });

  it('a child gets 10 % dextrose by weight, never 50 mL of 50 %', async () => {
    const [card] = await seizing({ ageYears: 3, weightKg: 14 });
    expect(card.detail).toContain('70 mL of 10 % dextrose');
    expect(card.detail).not.toContain('50 mL of 50 %');
  });

  it('with age missing, weight alone picks the midazolam band', async () => {
    const [card] = await seizing({ weightKg: 20 });
    expect(card.detail).toContain('midazolam 5 mg');
  });

  it('anaphylaxis in a 1-year-old with no weight is not given the adult 0.5 mg', async () => {
    const [card] = await ana.evaluate(
      rule('anaphylaxis-recognition'),
      pv({
        suspectedAllergicReaction: true,
        ageYears: 1,
        skinOrMucosalInvolvement: true,
        respiratoryInvolvement: true,
      }),
    );
    expect(card.detail).toContain('0.15 mg');
    expect(card.detail).not.toMatch(/adrenaline 0\.5 mg/);
  });

  it('skin involvement plus shock meets the anaphylaxis criterion', async () => {
    const cards = await ana.evaluate(
      rule('anaphylaxis-recognition'),
      pv({
        suspectedAllergicReaction: true,
        skinOrMucosalInvolvement: true,
        hypotensionOrShock: true,
      }),
    );
    expect(cards[0]?.indicator).toBe('critical');
  });
});

describe('drug resolution', () => {
  // The bundle files interactions under one of several records for the same
  // molecule; warfarin + "co-trimoxazole" found nothing (they sit under
  // "cotrimoxazole").
  it('finds an interaction filed under another record for the same molecule', () => {
    const res = drugs.checkInteractions(['warfarin', 'co-trimoxazole']);
    expect(res.interactions.map((i) => i.severity)).toContain('severe');
  });

  it('never reports a molecule interacting with itself', () => {
    expect(drugs.checkInteractions(['co-trimoxazole', 'cotrimoxazole']).interactions).toEqual([]);
  });

  const normalizer = new CdsNormalizerService(knowledge, drugs);
  normalizer.rebuildIndex();
  const medsOf = (texts: string[]) =>
    normalizer.normalize({
      hook: 'medication-prescribe',
      hookInstance: 't',
      context: {},
      prefetch: {
        meds: {
          resourceType: 'Bundle',
          entry: texts.map((text) => ({
            resource: {
              resourceType: 'MedicationRequest',
              status: 'active',
              intent: 'order',
              medicationCodeableConcept: { text },
            },
          })),
        },
      },
    } as CdsHookRequest).request.context;

  it.each([
    ['Frusemide 40 mg tablet', 'furosemide'],
    ['Rifampin 600 mg', 'rifampicin'],
    ['Magnesium sulfate 50% injection', 'magnesium-sulphate'],
  ])('resolves the synonym "%s"', (text, slug) => {
    expect(JSON.stringify(medsOf([text]))).toContain(`"${slug}"`);
  });

  it('files every component of a combination product', () => {
    const ctx = JSON.stringify(medsOf(['Tenofovir/Lamivudine/Dolutegravir 300/300/50 mg']));
    expect(ctx).toContain('"dolutegravir"');
    expect(ctx).toContain('"lamivudine"');
  });
});
