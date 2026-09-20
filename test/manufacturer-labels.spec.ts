import { describe, expect, it } from 'vitest';
import type { DrugRecord, ManufacturerLabel } from '../src/modules/drugs/drugs.types';
import {
  buildLabelRecord,
  classifyApplication,
  extractSections,
  filterLabelsByConcentration,
  filterLabelsByRoute,
  formularyFor,
  parseInnComponents,
  selectReferenceLabels,
  truncateAt,
  type OpenFdaLabel,
} from '../scripts/lib/manufacturer-labels';

/**
 * Matching rules for manufacturer (US FDA) label ingestion. A wrong match
 * attaches another product's label to a drug, so these pin the rules that
 * prevent it: combination vs single-ingredient separation, innovator
 * preference, and formulary linkage that never asserts an unverified listing.
 */

function label(p: {
  setId: string;
  app?: string[];
  substances: string[];
  route?: string[];
  date?: string;
  extra?: Record<string, unknown>;
}): OpenFdaLabel {
  return {
    set_id: p.setId,
    version: '1',
    effective_time: p.date ?? '20260101',
    openfda: {
      application_number: p.app,
      substance_name: p.substances,
      route: p.route ?? ['ORAL'],
      manufacturer_name: [`Maker ${p.setId}`],
      brand_name: [`Brand ${p.setId}`],
      product_type: ['HUMAN PRESCRIPTION DRUG'],
    },
    ...p.extra,
  };
}

describe('parseInnComponents', () => {
  it.each([
    ['paracetamol', ['acetaminophen']],
    ['artemether + lumefantrine', ['artemether', 'lumefantrine']],
    ['Lopinavir/ritonavir', ['lopinavir', 'ritonavir']],
    ['metoprolol tartrate / succinate', ['metoprolol tartrate']],
    ['quinine sulphate / dihydrochloride', ['quinine sulfate']],
    ['enoxaparin (low-molecular-weight heparin)', ['enoxaparin']],
    ['co-trimoxazole (PJP prophylaxis dose)', ['sulfamethoxazole', 'trimethoprim']],
    ['amoxicillin + clavulanic acid', ['amoxicillin', 'clavulanate']],
    ['sodium chloride 0.9 %', ['sodium chloride']],
    ['Calcitriol (1,25-dihydroxyvitamin D3)', ['calcitriol']],
    ['chloramphenicol 0.5 % eye drops', ['chloramphenicol']],
    ['Fentanyl transdermal patch', ['fentanyl']],
    ['Etonogestrel subdermal implant', ['etonogestrel']],
  ])('%s → %j', (inn, expected) => {
    expect(parseInnComponents(inn)).toEqual(expected);
  });
});

describe('classifyApplication', () => {
  it('ranks BLA/NDA as innovator, ANDA as generic, monographs as other', () => {
    expect(classifyApplication(['BLA125514'])).toBe('BLA');
    expect(classifyApplication(['NDA050760'])).toBe('NDA');
    expect(classifyApplication(['ANDA061926', 'ANDA065056'])).toBe('ANDA');
    expect(classifyApplication(['M013'])).toBe('other');
    expect(classifyApplication(undefined)).toBe('other');
  });
});

describe('selectReferenceLabels', () => {
  it('never matches a combination label to a single-ingredient drug', () => {
    const picked = selectReferenceLabels(
      [
        label({
          setId: 'combo',
          app: ['NDA1'],
          substances: ['METFORMIN HYDROCHLORIDE', 'SITAGLIPTIN'],
        }),
        label({ setId: 'single', app: ['ANDA2'], substances: ['METFORMIN HYDROCHLORIDE'] }),
      ],
      1,
    );
    expect(picked.map((p) => p.primary.set_id)).toEqual(['single']);
  });

  it('prefers the innovator (NDA/BLA) over a newer generic within a route', () => {
    const picked = selectReferenceLabels(
      [
        label({ setId: 'generic', app: ['ANDA1'], substances: ['X'], date: '20260901' }),
        label({ setId: 'innovator', app: ['NDA1'], substances: ['X'], date: '20240101' }),
        label({ setId: 'otc', app: ['M013'], substances: ['X'], date: '20260915' }),
      ],
      1,
    );
    expect(picked).toHaveLength(1);
    expect(picked[0].primary.set_id).toBe('innovator');
    expect(picked[0].alternates.map((a) => a.set_id)).toEqual(['generic', 'otc']);
  });

  it('picks the most recent label among equal application types', () => {
    const picked = selectReferenceLabels(
      [
        label({ setId: 'old', app: ['ANDA1'], substances: ['X'], date: '20240101' }),
        label({ setId: 'new', app: ['ANDA2'], substances: ['X'], date: '20260101' }),
      ],
      1,
    );
    expect(picked[0].primary.set_id).toBe('new');
  });

  it('keeps one reference label per route and caps alternates', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      label({ setId: `oral${i}`, app: ['ANDA1'], substances: ['X'], date: `2026010${i + 1}` }),
    );
    const picked = selectReferenceLabels(
      [...many, label({ setId: 'iv', app: ['NDA9'], substances: ['X'], route: ['INTRAVENOUS'] })],
      1,
    );
    expect(picked.map((p) => p.primary.set_id)).toEqual(['iv', 'oral5']);
    expect(picked[1].alternates).toHaveLength(3);
  });

  it('dedupes repeated versions of the same set id to the newest', () => {
    const picked = selectReferenceLabels(
      [
        label({ setId: 'same', app: ['NDA1'], substances: ['X'], date: '20240101' }),
        label({ setId: 'same', app: ['NDA1'], substances: ['X'], date: '20260101' }),
      ],
      1,
    );
    expect(picked[0].primary.effective_time).toBe('20260101');
    expect(picked[0].alternates).toHaveLength(0);
  });
});

describe('section extraction', () => {
  it('reads PLR, legacy and OTC field names and strips markup', () => {
    const s = extractSections(
      label({
        setId: 'a',
        substances: ['X'],
        extra: {
          boxed_warning: ['<b>WARNING:</b> lactic   acidosis'],
          warnings: ['Legacy warnings text'],
          do_not_use: ['if allergic'],
          nursing_mothers: ['Excreted in milk'],
        },
      }),
    );
    expect(s.boxedWarning).toEqual({ text: 'WARNING: lactic acidosis', truncated: false });
    expect(s.warningsAndPrecautions?.text).toBe('Legacy warnings text');
    expect(s.doNotUse?.text).toBe('if allergic');
    expect(s.lactation?.text).toBe('Excreted in milk');
    expect(s.indications).toBeUndefined();
  });

  it('truncates at a sentence boundary and flags it', () => {
    const text = 'First sentence here. '.repeat(20);
    const out = truncateAt(text, 100);
    expect(out.truncated).toBe(true);
    expect(out.text.length).toBeLessThanOrEqual(102);
    expect(out.text.endsWith('. …')).toBe(true);
    expect(truncateAt('short', 100)).toEqual({ text: 'short', truncated: false });
  });
});

describe('formulary linkage and record assembly', () => {
  const drug = {
    slug: 'amoxicillin',
    inn: 'amoxicillin',
    atc: ['J01CA04'],
    kemlLevel: 1,
    whoEml: true,
    awareCategory: 'Access',
  } as unknown as DrugRecord;
  const profiles = { profiles: { UG: { nationalFormularySource: 'moh-ug' }, XX: {} } };

  it('links KEML/WHO/AWaRe from the drug record and lists where to verify national listing', () => {
    expect(formularyFor(drug, profiles)).toEqual({
      atc: ['J01CA04'],
      kemlLevel: 1,
      whoEml: true,
      awareCategory: 'Access',
      nationalFormularySources: [
        { country: 'KE', sourceId: 'moh-ke' },
        { country: 'UG', sourceId: 'moh-ug' },
      ],
    });
  });

  it('builds a draft, US-jurisdiction record with a public-domain DailyMed citation', () => {
    const rec = buildLabelRecord({
      drug,
      rxcuiIngredients: ['723'],
      selected: {
        primary: label({
          setId: 'abc',
          app: ['NDA050760'],
          substances: ['AMOXICILLIN'],
          date: '20260707',
        }),
        alternates: [label({ setId: 'alt', app: ['ANDA1'], substances: ['AMOXICILLIN'] })],
      },
      profiles,
      retrievedAt: '2026-09-17T10:00:00.000Z',
    });
    expect(rec).toMatchObject({
      slug: 'amoxicillin',
      jurisdiction: 'US',
      source: 'openfda',
      reviewStatus: 'draft',
      effectiveDate: '2026-07-07',
      applicationType: 'NDA',
      alternateSetIds: ['alt'],
      citation: {
        url: 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=abc',
        sourceType: 'drug-label',
        licence: 'public-domain',
        accessedDate: '2026-09-17',
      },
    });
  });
});

describe('filterLabelsByRoute', () => {
  const rec = (slug: string, routes: string[]) =>
    ({
      slug,
      dosing: { adult: routes.map((route) => ({ route, regimen: '' })) },
    }) as unknown as DrugRecord;
  const lab = (routes: string[]) => ({ routes }) as unknown as ManufacturerLabel;

  it('drops labels for a route the drug is never given by', () => {
    const kept = filterLabelsByRoute(rec('glycopyrronium-inhaled', ['inhaled']), [
      lab(['INTRAMUSCULAR', 'INTRAVENOUS']),
      lab(['RESPIRATORY (INHALATION)']),
    ]);
    expect(kept.map((l) => l.routes[0])).toEqual(['RESPIRATORY (INHALATION)']);
  });

  it('uses route words in the slug (e.g. -iv variants)', () => {
    const kept = filterLabelsByRoute(rec('paracetamol-iv', []), [
      lab(['ORAL']),
      lab(['INTRAVENOUS']),
    ]);
    expect(kept.map((l) => l.routes[0])).toEqual(['INTRAVENOUS']);
  });

  it('keeps everything when the drug has no recognisable route, or the label has none', () => {
    expect(
      filterLabelsByRoute(rec('mystery', []), [lab(['ORAL']), lab(['OPHTHALMIC'])]),
    ).toHaveLength(2);
    expect(filterLabelsByRoute(rec('x', ['oral']), [lab([])])).toHaveLength(1);
  });

  it('drops labels with only unrecognised routes when the drug route is known', () => {
    expect(
      filterLabelsByRoute(rec('hypertonic-saline-3', ['nebulised']), [lab(['EXTRACORPOREAL'])]),
    ).toEqual([]);
  });
});

describe('filterLabelsByConcentration', () => {
  const lab = (text: string) =>
    ({
      brandNames: [],
      sections: { dosageFormsAndStrengths: { text, truncated: false } },
    }) as unknown as ManufacturerLabel;
  const drug = (inn: string) => ({ inn }) as unknown as DrugRecord;

  it('keeps only labels naming the INN concentration', () => {
    const kept = filterLabelsByConcentration(drug('Sodium chloride 3% (hypertonic)'), [
      lab('0.9% Sodium Chloride Injection'),
      lab('3% Sodium Chloride Injection'),
      lab('23.4% concentrate'),
    ]);
    expect(kept.map((l) => l.sections.dosageFormsAndStrengths?.text)).toEqual([
      '3% Sodium Chloride Injection',
    ]);
  });

  it('is a no-op when the INN names no concentration', () => {
    expect(filterLabelsByConcentration(drug('amoxicillin'), [lab('500 mg')])).toHaveLength(1);
  });
});
