import { describe, expect, it } from 'vitest';
import { LocalizationService } from '../src/modules/localization/localization.service';

describe('LocalizationService', () => {
  const svc = new LocalizationService();

  it('exposes a directory with Kenya default + WHO base', () => {
    const d = svc.directory();
    expect(d.defaultCountry).toBe('KE');
    expect(d.baseAuthority).toBe('WHO');
    expect(d.countries.find((c) => c.code === 'KE')?.localized).toBe(true);
    expect(d.countries.length).toBeGreaterThan(1);
  });

  it('countries with authored overlays are localized; unsupported codes are not', () => {
    // Kenya is default-authored; Uganda has authored national overlays, so with
    // the sign-off gate removed it is localized. An unknown code is unsupported.
    expect(svc.isLocalized('KE')).toBe(true);
    expect(svc.isLocalized('UG')).toBe(true);
    expect(svc.isSupported('UG')).toBe(true);
    expect(svc.isSupported('ZZ')).toBe(false);
    expect(svc.isLocalized('ZZ')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(svc.isLocalized('ke')).toBe(true);
    expect(svc.isSupported('ug')).toBe(true);
  });

  it('resolve(): a localized country serves its own content; unknown falls back to default', () => {
    expect(svc.resolve('KE')).toEqual({ requested: 'KE', effective: 'KE', localized: true });
    expect(svc.resolve('UG')).toEqual({ requested: 'UG', effective: 'UG', localized: true });
    expect(svc.resolve()).toEqual({ requested: 'KE', effective: 'KE', localized: true });
    expect(svc.resolve('zz')).toEqual({ requested: 'ZZ', effective: 'KE', localized: false });
  });
});
