import { Injectable } from '@nestjs/common';

/**
 * Localization / jurisdiction directory.
 *
 * VedaMD is Kenya-first and scaling across Africa. A user picks the country
 * they practise in; this directory tells the client which countries are
 * selectable and which are fully localized to national guidelines. For a
 * country that is NOT yet localized, the platform still serves the default
 * (Kenya) reference content, and the client shows a clear "not yet localized
 * for <country> — general reference" banner (product decision). Strict
 * per-country content resolution activates automatically once national
 * overlays are authored (see src/common/jurisdiction.ts).
 */

export interface CountryOption {
  /** ISO 3166-1 alpha-2 code. */
  code: string;
  name: string;
  /** True when content is tailored to this country's national guidelines. */
  localized: boolean;
}

export interface LocalizationDirectory {
  /** Country whose content is served when none is selected / un-localized. */
  defaultCountry: string;
  /** Global baseline authority used as the content fallback layer. */
  baseAuthority: 'WHO';
  countries: CountryOption[];
}

// Kenya is fully localized today; the rest are near-term African expansion
// targets, selectable now and served default+labelled content until their
// national overlays land. Keep names in sync with ISO 3166.
const COUNTRIES: CountryOption[] = [
  { code: 'KE', name: 'Kenya', localized: true },
  { code: 'UG', name: 'Uganda', localized: false },
  { code: 'TZ', name: 'Tanzania', localized: false },
  { code: 'RW', name: 'Rwanda', localized: false },
  { code: 'ET', name: 'Ethiopia', localized: false },
  { code: 'NG', name: 'Nigeria', localized: false },
  { code: 'GH', name: 'Ghana', localized: false },
  { code: 'ZA', name: 'South Africa', localized: false },
  { code: 'ZM', name: 'Zambia', localized: false },
  { code: 'MW', name: 'Malawi', localized: false },
];

const DEFAULT_COUNTRY = 'KE';

@Injectable()
export class LocalizationService {
  private readonly byCode = new Map(COUNTRIES.map((c) => [c.code, c]));

  directory(): LocalizationDirectory {
    return {
      defaultCountry: DEFAULT_COUNTRY,
      baseAuthority: 'WHO',
      countries: COUNTRIES,
    };
  }

  /** A country is selectable if it's in the directory. */
  isSupported(code: string): boolean {
    return this.byCode.has(code.toUpperCase());
  }

  /** Whether content is tailored to this country (vs served as default+label). */
  isLocalized(code: string): boolean {
    return this.byCode.get(code.toUpperCase())?.localized ?? false;
  }

  /**
   * Resolve a requested country code to how content should be served:
   * the effective country whose content to serve, and whether the request
   * was for a localized jurisdiction. Unknown/un-localized → default + flag.
   */
  resolve(requested?: string): { requested: string; effective: string; localized: boolean } {
    const code = (requested ?? DEFAULT_COUNTRY).toUpperCase();
    const localized = this.isLocalized(code);
    return { requested: code, effective: localized ? code : DEFAULT_COUNTRY, localized };
  }
}
