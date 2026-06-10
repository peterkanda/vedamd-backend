import { Injectable } from '@nestjs/common';
import { isLocalized as overlayIsLocalized, statusFor, type LocalizationStatus } from './overlays';

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
 *
 * `localized`/`status` are NOT hand-maintained flags — they are DERIVED from
 * the authored overlays on disk (see overlays.ts), so a country can never
 * claim to be localized before its overlay is authored and signed off.
 */

export interface CountryOption {
  /** ISO 3166-1 alpha-2 code. */
  code: string;
  name: string;
  /** True when content is tailored to this country's national guidelines. */
  localized: boolean;
  /** Lifecycle: 'localized' | 'in-progress' (overlay scaffolded) | 'planned'. */
  status: LocalizationStatus;
}

export interface LocalizationDirectory {
  /** Country whose content is served when none is selected / un-localized. */
  defaultCountry: string;
  /** Global baseline authority used as the content fallback layer. */
  baseAuthority: 'WHO';
  countries: CountryOption[];
}

// Selectable countries: Kenya (default-authored) plus the anglophone African
// expansion targets. Localization status is derived per request from the
// overlays on disk — these names/codes are the only hand-maintained data.
// Keep names in sync with ISO 3166.
const COUNTRY_NAMES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'KE', name: 'Kenya' },
  { code: 'UG', name: 'Uganda' },
  { code: 'TZ', name: 'Tanzania' },
  { code: 'RW', name: 'Rwanda' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'GH', name: 'Ghana' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'ZM', name: 'Zambia' },
  { code: 'MW', name: 'Malawi' },
];

const DEFAULT_COUNTRY = 'KE';

@Injectable()
export class LocalizationService {
  private readonly byCode = new Map(COUNTRY_NAMES.map((c) => [c.code, c]));

  directory(): LocalizationDirectory {
    return {
      defaultCountry: DEFAULT_COUNTRY,
      baseAuthority: 'WHO',
      countries: COUNTRY_NAMES.map((c) => ({
        code: c.code,
        name: c.name,
        localized: overlayIsLocalized(c.code),
        status: statusFor(c.code),
      })),
    };
  }

  /** A country is selectable if it's in the directory. */
  isSupported(code: string): boolean {
    return this.byCode.has(code.toUpperCase());
  }

  /** Whether content is tailored to this country (vs served as default+label). */
  isLocalized(code: string): boolean {
    return this.isSupported(code) && overlayIsLocalized(code);
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
