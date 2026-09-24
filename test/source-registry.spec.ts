import { describe, expect, it } from 'vitest';
import {
  buildHostIndex,
  lanesForCountry,
  licenceAgrees,
  loadSourceRegistry,
  sourceAppliesToCountry,
  sourceForUrl,
} from '../src/modules/localization/source-registry';
import { loadCountryProfiles, statusFor } from '../src/modules/localization/overlays';
import { LocalizationService } from '../src/modules/localization/localization.service';

describe('source registry', () => {
  const registry = loadSourceRegistry();

  it('loads the catalogue', () => {
    expect(registry.sources.length).toBeGreaterThan(10);
    expect(registry.sources.find((s) => s.id === 'dailymed')?.embeddable).toBe('yes');
    // WHO licences vary per document (post-2016 NC-SA, older titles all rights
    // reserved), so WHO is checked item by item rather than embedded wholesale.
    const who = registry.sources.find((s) => s.id === 'who-narrative');
    expect(who?.embeddable).toBe('verify');
    expect(who?.licenceScope).toBe('per-item');
    expect(registry.contentLicence).toBe('CC-BY-NC-SA-4.0');
  });

  it('global sources apply to any country; national sources only to theirs', () => {
    const dailymed = registry.sources.find((s) => s.id === 'dailymed')!;
    const mohUg = registry.sources.find((s) => s.id === 'moh-ug')!;
    expect(sourceAppliesToCountry(dailymed, 'NG')).toBe(true);
    expect(sourceAppliesToCountry(mohUg, 'UG')).toBe(true);
    expect(sourceAppliesToCountry(mohUg, 'NG')).toBe(false);
  });

  it('splits a country into embed (Tier-1) and worklist (verify/cite-only) lanes', () => {
    const { embed, worklist } = lanesForCountry('UG');
    expect(embed.every((s) => s.embeddable === 'yes' && s.tier === 1)).toBe(true);
    expect(worklist.every((s) => s.embeddable !== 'yes')).toBe(true);
    // Uganda's own MoH guidelines land in the (cite-only) worklist, never embed.
    expect(worklist.some((s) => s.id === 'moh-ug')).toBe(true);
    expect(embed.some((s) => s.id === 'moh-ug')).toBe(false);
  });

  it('resolves citation hosts to their source, longest suffix wins', () => {
    const index = buildHostIndex();
    expect(sourceForUrl('https://dailymed.nlm.nih.gov/dailymed/x', index)?.id).toBe('dailymed');
    expect(sourceForUrl('https://bnf.nice.org.uk/drugs/x', index)?.id).toBe('nice');
    expect(sourceForUrl('https://www.who.int/publications/x', index)?.id).toBe('who-narrative');
    expect(sourceForUrl('https://list.essentialmeds.org/medicines/1', index)?.id).toBe('who-eeml');
    expect(sourceForUrl('https://example.invalid/x', index)).toBeNull();
    expect(sourceForUrl('not a url', index)).toBeNull();
  });
});

describe('source registry URL prefixes', () => {
  const index = buildHostIndex();

  it('NCBI URLs resolve to the right source, not all to StatPearls', () => {
    expect(sourceForUrl('https://www.ncbi.nlm.nih.gov/books/NBK501922/', index)?.id).toBe(
      'lactmed',
    );
    expect(sourceForUrl('https://www.ncbi.nlm.nih.gov/books/NBK547852/', index)?.id).toBe(
      'livertox',
    );
    expect(sourceForUrl('https://www.ncbi.nlm.nih.gov/books/NBK430685/', index)?.id).toBe(
      'statpearls',
    );
    expect(sourceForUrl('https://www.ncbi.nlm.nih.gov/books/NBK500991/', index)?.id).toBe(
      'ncbi-bookshelf',
    );
    expect(sourceForUrl('https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1/', index)?.id).toBe(
      'pmc-oa',
    );
    expect(sourceForUrl('https://pmc.ncbi.nlm.nih.gov/articles/PMC1/', index)?.id).toBe('pmc-oa');
    expect(sourceForUrl('https://pubmed.ncbi.nlm.nih.gov/1/', index)?.id).toBe('pubmed');
  });

  it('a path prefix beats the host it lives on', () => {
    expect(sourceForUrl('https://www.ajol.info/index.php/ahs/article/view/1', index)?.id).toBe(
      'african-health-sciences',
    );
    expect(sourceForUrl('https://www.ajol.info/index.php/other/article/view/1', index)?.id).toBe(
      'ajol',
    );
  });

  it('per-item sources accept any listed item licence', () => {
    const pmc = loadSourceRegistry().sources.find((s) => s.id === 'pmc-oa')!;
    expect(licenceAgrees(pmc, 'cc-by-nc-nd')).toBe(true);
    expect(licenceAgrees(pmc, 'moh-restricted')).toBe(false);
    const cpic = loadSourceRegistry().sources.find((s) => s.id === 'cpic')!;
    expect(licenceAgrees(cpic, 'cc0')).toBe(true);
    expect(licenceAgrees(cpic, 'cc-by')).toBe(false);
  });
});

describe('overlay status derivation', () => {
  it('Kenya + countries with authored overlays are localized; unknown is planned', () => {
    expect(statusFor('KE')).toBe('localized');
    // Uganda has authored national overlays → localized (sign-off no longer gates).
    expect(statusFor('UG')).toBe('localized');
    // An entirely unknown country has no overlay → planned.
    expect(statusFor('FR')).toBe('planned');
  });
});

describe('country profiles', () => {
  const registry = loadSourceRegistry();
  const profiles = loadCountryProfiles();
  const EXPANSION = ['UG', 'TZ', 'RW', 'ET', 'NG', 'GH', 'ZA', 'ZM', 'MW'];

  it('every anglophone expansion country has a well-formed profile', () => {
    const bad: string[] = [];
    for (const code of EXPANSION) {
      const p = profiles[code];
      if (!p) {
        bad.push(`${code}: missing`);
        continue;
      }
      if (p.patientFacingLanguages.length === 0) bad.push(`${code}: no patient languages`);
      // Patient-facing + official languages must be ISO 639-1 (2-letter) so the
      // client i18n layer can use them; majorLocalLanguages may be 639-3 where
      // no 2-letter code exists (e.g. Bemba 'bem').
      const strict = [...p.officialLanguages, ...p.patientFacingLanguages];
      if (!strict.every((l) => /^[a-z]{2}$/.test(l))) bad.push(`${code}: bad ISO-639-1 code`);
      if (!p.majorLocalLanguages.every((l) => /^[a-z]{2,3}$/.test(l)))
        bad.push(`${code}: bad language code`);
      // The national formulary must point at a real registry source for that country.
      const src = registry.sources.find((s) => s.id === p.nationalFormularySource);
      if (!src) bad.push(`${code}: formulary source ${p.nationalFormularySource} not in registry`);
      else if (!src.countries.includes(code)) bad.push(`${code}: formulary source wrong country`);
    }
    expect(bad).toEqual([]);
  });

  it('the directory surfaces patient-facing languages for profiled countries', () => {
    const dir = new LocalizationService().directory();
    const ug = dir.countries.find((c) => c.code === 'UG')!;
    expect(ug.languages).toEqual(['en', 'sw']);
    expect(ug.status).toBe('localized');
    expect(ug.localized).toBe(true);
  });
});
