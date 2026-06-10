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

  it('only Kenya is localized today; expansion targets are selectable but not', () => {
    expect(svc.isLocalized('KE')).toBe(true);
    expect(svc.isLocalized('UG')).toBe(false);
    expect(svc.isSupported('UG')).toBe(true);
    expect(svc.isSupported('ZZ')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(svc.isLocalized('ke')).toBe(true);
    expect(svc.isSupported('ug')).toBe(true);
  });

  it('resolve(): localized country serves itself; un-localized falls back to default+flag', () => {
    expect(svc.resolve('KE')).toEqual({ requested: 'KE', effective: 'KE', localized: true });
    expect(svc.resolve('UG')).toEqual({ requested: 'UG', effective: 'KE', localized: false });
    expect(svc.resolve()).toEqual({ requested: 'KE', effective: 'KE', localized: true });
    expect(svc.resolve('zz')).toEqual({ requested: 'ZZ', effective: 'KE', localized: false });
  });
});
