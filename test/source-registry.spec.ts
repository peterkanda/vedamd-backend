import { describe, expect, it } from 'vitest';
import {
  buildHostIndex,
  lanesForCountry,
  loadSourceRegistry,
  sourceAppliesToCountry,
  sourceForUrl,
} from '../src/modules/localization/source-registry';
import { statusFor } from '../src/modules/localization/overlays';

describe('source registry', () => {
  const registry = loadSourceRegistry();

  it('loads the catalogue', () => {
    expect(registry.sources.length).toBeGreaterThan(10);
    expect(registry.sources.find((s) => s.id === 'dailymed')?.embeddable).toBe('yes');
    expect(registry.sources.find((s) => s.id === 'who-narrative')?.embeddable).toBe('cite-only');
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
    expect(sourceForUrl('https://example.invalid/x', index)).toBeNull();
    expect(sourceForUrl('not a url', index)).toBeNull();
  });
});

describe('overlay status derivation', () => {
  it('Kenya is always localized; scaffolded expansion countries are in-progress', () => {
    expect(statusFor('KE')).toBe('localized');
    // The ingestion engine has scaffolded these (overlay present, not signed
    // off) → in-progress, never localized until authored + signed off.
    expect(statusFor('UG')).toBe('in-progress');
    // An entirely unknown country has no overlay → planned.
    expect(statusFor('FR')).toBe('planned');
  });
});
