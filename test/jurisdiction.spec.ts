import { describe, expect, it } from 'vitest';
import {
  BASE_JURISDICTION,
  DEFAULT_JURISDICTION,
  jurisdictionOf,
  resolveForCountry,
  resolveListForCountry,
} from '../src/common/jurisdiction';

interface Rec {
  slug: string;
  jurisdiction?: string;
  note?: string;
}

describe('jurisdiction model', () => {
  it('defaults unlabelled records to Kenya', () => {
    expect(jurisdictionOf({})).toBe('KE');
    expect(DEFAULT_JURISDICTION).toBe('KE');
    expect(jurisdictionOf({ jurisdiction: 'UG' })).toBe('UG');
  });

  describe('resolveForCountry', () => {
    const ke: Rec = { slug: 'x', jurisdiction: 'KE', note: 'kenya' };
    const who: Rec = { slug: 'x', jurisdiction: BASE_JURISDICTION, note: 'who-base' };
    const unlabelled: Rec = { slug: 'x', note: 'legacy' };

    it('prefers an exact country match', () => {
      expect(resolveForCountry([who, ke], 'KE')?.note).toBe('kenya');
    });

    it('treats unlabelled content as the default jurisdiction', () => {
      expect(resolveForCountry([unlabelled], 'KE')?.note).toBe('legacy');
    });

    it('falls back to the WHO base layer when no country variant exists', () => {
      expect(resolveForCountry([who, ke], 'UG')?.note).toBe('who-base');
    });

    it('NEVER substitutes another country’s national content', () => {
      // Only a Kenyan variant exists; a Uganda request must NOT get it.
      expect(resolveForCountry([ke], 'UG')).toBeNull();
    });

    it('returns null when nothing applies', () => {
      expect(resolveForCountry([], 'KE')).toBeNull();
    });
  });

  describe('resolveListForCountry', () => {
    const records: Rec[] = [
      { slug: 'malaria', jurisdiction: 'KE', note: 'ke-malaria' },
      { slug: 'malaria', jurisdiction: 'WHO', note: 'who-malaria' },
      { slug: 'sepsis', jurisdiction: 'WHO', note: 'who-sepsis' },
      { slug: 'fgm', jurisdiction: 'KE', note: 'ke-only' },
    ];

    it('resolves one record per topic for the requested country', () => {
      const ke = resolveListForCountry(records, 'KE');
      expect(ke.map((r) => r.note).sort()).toEqual(['ke-malaria', 'ke-only', 'who-sepsis']);
    });

    it('for another country: country-specific topics fall back to WHO; KE-only topics drop', () => {
      const ug = resolveListForCountry(records, 'UG');
      // malaria + sepsis fall back to WHO base; the KE-only topic (no WHO base) is dropped.
      expect(ug.map((r) => r.note).sort()).toEqual(['who-malaria', 'who-sepsis']);
    });
  });
});
