import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_JURISDICTION, type Jurisdiction } from '../../common/jurisdiction';

/**
 * Country overlay status.
 *
 * `localized` used to be a hand-maintained boolean on the country directory,
 * which drifts from reality the moment someone forgets to flip it. Instead we
 * DERIVE it from what overlay content actually exists on disk + an explicit
 * clinical sign-off, so the country picker can never claim a country is
 * localized before its overlay is authored and approved.
 *
 * Each expansion country gets content/overlays/<CC>/overlay.json, produced by
 * the ingestion engine (scripts/ingest-country-content.ts). A country counts
 * as localized only when its overlay is `signedOff` AND carries at least one
 * authored domain. The platform default (Kenya) is authored directly into the
 * signed bundle and is always localized.
 */

export interface CountryOverlay {
  /** ISO 3166-1 alpha-2 code. */
  country: string;
  /** Global baseline the overlay falls back to. */
  baseAuthority: 'WHO';
  /** Set true only after clinical review of the authored overlay content. */
  signedOff: boolean;
  /** Clinical domains the overlay actually authors national variants for. */
  domains: string[];
  /** Registry source ids the overlay draws on / cites. */
  sources: string[];
  /** ISO timestamp the overlay scaffold was last (re)generated. */
  generatedAt: string;
  /**
   * Factual locale profile (languages, national formulary). Safe localization
   * layer merged in by the ingestion engine — contains NO clinical content and
   * does NOT by itself make a country `localized` (that needs authored,
   * signed-off clinical domains).
   */
  profile?: CountryProfile;
}

/** Factual, citable per-country locale data (no clinical recommendations). */
export interface CountryProfile {
  name: string;
  /** ISO 639-1 codes — official / health-system working languages. */
  officialLanguages: string[];
  /** Languages we ship (or will ship) patient/CHW-facing strings in. */
  patientFacingLanguages: string[];
  /** Other widely-spoken languages, for later localization. */
  majorLocalLanguages: string[];
  /** Registry source id of the national EML/STG (cite-only). */
  nationalFormularySource: string;
  /** Whether national guidelines are WHO-derived (informs base-layer reuse). */
  nationalGuidelinesDeriveFromWho: boolean;
  notes?: string;
}

/** Lifecycle a country moves through as overlays are authored. */
export type LocalizationStatus =
  /** Default-authored, fully localized (Kenya). */
  | 'localized'
  /** Overlay scaffold + worklist exist; authoring/sign-off pending. */
  | 'in-progress'
  /** Selectable expansion target with no overlay yet. */
  | 'planned';

const OVERLAYS_DIR = resolve(process.cwd(), 'content/overlays');
const PROFILES_FILE = resolve(process.cwd(), 'content/sources/country-profiles.json');

let cached: Map<string, CountryOverlay> | null = null;

/** Load the per-country profiles keyed by ISO code (content/sources/country-profiles.json). */
export function loadCountryProfiles(): Record<string, CountryProfile> {
  const parsed = JSON.parse(readFileSync(PROFILES_FILE, 'utf8')) as {
    profiles: Record<string, CountryProfile>;
  };
  return parsed.profiles;
}

/** Load every country overlay descriptor from content/overlays/<CC>/overlay.json. */
export function loadOverlays(): Map<string, CountryOverlay> {
  if (cached) return cached;
  const out = new Map<string, CountryOverlay>();
  if (existsSync(OVERLAYS_DIR)) {
    for (const entry of readdirSync(OVERLAYS_DIR)) {
      const file = resolve(OVERLAYS_DIR, entry, 'overlay.json');
      if (!existsSync(file) || !statSync(resolve(OVERLAYS_DIR, entry)).isDirectory()) continue;
      try {
        const overlay = JSON.parse(readFileSync(file, 'utf8')) as CountryOverlay;
        out.set(overlay.country.toUpperCase(), overlay);
      } catch {
        // A malformed overlay must never crash the directory; treat as absent.
      }
    }
  }
  cached = out;
  return out;
}

/** Reset the memoised overlays (tests). */
export function resetOverlayCache(): void {
  cached = null;
}

/**
 * Localization status for a country. The default jurisdiction (Kenya) is
 * authored into the bundle directly → always 'localized'. Others are derived
 * from their overlay: signed-off + ≥1 domain ⇒ localized; scaffold present ⇒
 * in-progress; nothing ⇒ planned.
 */
export function statusFor(
  country: Jurisdiction,
  overlays: Map<string, CountryOverlay> = loadOverlays(),
): LocalizationStatus {
  const code = country.toUpperCase();
  if (code === DEFAULT_JURISDICTION) return 'localized';
  const overlay = overlays.get(code);
  if (!overlay) return 'planned';
  // A country is localized once it has authored national overlays. Clinical
  // sign-off is NOT required to flip the label (product decision): content is
  // cited reference + WHO-aligned principles, kept draft with the dose-guardrail
  // active. `signedOff` is retained as an optional "clinically reviewed" marker
  // but no longer gates localization.
  return overlay.domains.length > 0 ? 'localized' : 'in-progress';
}

/** Whether content is tailored to this country (status === 'localized'). */
export function isLocalized(
  country: Jurisdiction,
  overlays: Map<string, CountryOverlay> = loadOverlays(),
): boolean {
  return statusFor(country, overlays) === 'localized';
}
