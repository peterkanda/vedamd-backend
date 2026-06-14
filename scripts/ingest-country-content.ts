#!/usr/bin/env ts-node
/**
 * Country content ingestion engine.
 *
 *   npm run content:ingest -- UG TZ RW            # specific countries
 *   npm run content:ingest -- --all                # every expansion target
 *
 * Replicates, per country, the work done for Kenya — but LICENCE-GATED. For a
 * target country it splits every applicable registry source into two lanes:
 *
 *   EMBED lane    (embeddable: 'yes' — public-domain / permissive)
 *                 → these back the WHO/global base layer the country falls
 *                   back to; safe to transform into content directly.
 *   WORKLIST lane (embeddable: 'verify' | 'cite-only' — WHO narrative, MoH
 *                  guidelines, NICE, proprietary, SNOMED, …)
 *                 → NEVER reproduced. Emitted as an authoring worklist so a
 *                   clinician writes ORIGINAL logic from the underlying facts
 *                   and merely cites the source.
 *
 * Outputs per country under content/overlays/<CC>/:
 *   overlay.json    machine-readable status the localization directory reads
 *                   to DERIVE `localized` (signedOff:false, domains:[] until
 *                   real overlays are authored → stays "in-progress").
 *   provenance.json per-source lane + licence + last-checked audit log.
 *   worklist.md     human authoring checklist (cite-only sources + the
 *                   report's whitespace domains).
 *
 * It deliberately does NOT invent national clinical content: dosing/protocols
 * per country require authored sources and MoH sign-off. The engine produces
 * the scaffold, provenance, and worklist; authoring + sign-off flip a country
 * to localized. Re-running is idempotent.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lanesForCountry, loadSourceRegistry, type ContentSource } from '../src/modules/localization/source-registry';
import { loadCountryProfiles, type CountryProfile } from '../src/modules/localization/overlays';

// Expansion targets (kept in sync with localization.service.ts COUNTRY_NAMES,
// minus the default-authored Kenya). Anglophone first; francophone later.
const EXPANSION_TARGETS: Record<string, string> = {
  UG: 'Uganda',
  TZ: 'Tanzania',
  RW: 'Rwanda',
  ET: 'Ethiopia',
  NG: 'Nigeria',
  GH: 'Ghana',
  ZA: 'South Africa',
  ZM: 'Zambia',
  MW: 'Malawi',
};

// Highest-opportunity "whitespace" domains from the content-sourcing analysis:
// underserved by existing tools and best authored as ORIGINAL logic citing
// public-domain facts (never reproducing protected guideline text).
const WHITESPACE_DOMAINS = [
  'Drug–drug interactions (assemble from DailyMed/RxNorm/ONC DDI)',
  'Weight-based paediatric dosing (locally available formulations)',
  'Renal & hepatic dose adjustment',
  'Antimicrobial stewardship / WHO AWaRe at point of care',
  'NCD algorithms — hypertension, diabetes, asthma/COPD',
  'ETAT+ triage & structured referral criteria',
  'Mental health — mhGAP intervention logic',
  'Patient/CHW-facing explanations in English + local language',
];

const OVERLAYS_ROOT = resolve(process.cwd(), 'content/overlays');

function targetsFromArgs(argv: string[]): string[] {
  const args = argv.slice(2).filter((a) => !a.startsWith('-'));
  if (argv.includes('--all') || args.length === 0) return Object.keys(EXPANSION_TARGETS);
  const unknown = args.map((a) => a.toUpperCase()).filter((c) => !EXPANSION_TARGETS[c]);
  if (unknown.length) {
    console.error(`Unknown / non-expansion country code(s): ${unknown.join(', ')}`);
    console.error(`Valid: ${Object.keys(EXPANSION_TARGETS).join(', ')}`);
    process.exit(1);
  }
  return args.map((a) => a.toUpperCase());
}

function sourceLine(s: ContentSource): string {
  return `- **${s.title}** (${s.publisher}) — \`${s.embeddable}\`, ${s.spdxOrName}\n  ${s.url}${
    s.notes ? `\n  _${s.notes}_` : ''
  }`;
}

function writeWorklist(
  code: string,
  name: string,
  embed: ContentSource[],
  worklist: ContentSource[],
  profile?: CountryProfile,
) {
  const generated = new Date().toISOString().slice(0, 10);
  const langLine = profile
    ? `\n## Locale (authored)\n- Patient-facing languages: ${profile.patientFacingLanguages.join(', ')}\n- Official languages: ${profile.officialLanguages.join(', ')}\n- National formulary source: \`${profile.nationalFormularySource}\` (cite-only)\n- National guidelines WHO-derived: ${profile.nationalGuidelinesDeriveFromWho ? 'yes' : 'no'}\n`
    : '';
  const md = `# ${name} (${code}) — content authoring worklist

_Generated ${generated} by scripts/ingest-country-content.ts. Licence-gated:
nothing below is reproduced; cite-only sources require ORIGINAL authoring._

## Status
\`in-progress\` — locale profile authored; clinical overlay not yet signed off.
${name} currently serves WHO/Kenya-default reference content with a "not yet
localized" label. Authoring the clinical domains below + clinical sign-off
(overlay.json \`signedOff:true\`) flips ${name} to **localized**.
${langLine}

## EMBED lane — permissive base layer (safe to transform directly)
${embed.length ? embed.map(sourceLine).join('\n') : '- (none country-specific; relies on global Tier-1 sources)'}

## WORKLIST lane — cite, do NOT reproduce (author original logic)
${worklist.map(sourceLine).join('\n')}

## Whitespace domains to author (highest marginal value)
${WHITESPACE_DOMAINS.map((d) => `- [ ] ${d}`).join('\n')}

## Sign-off checklist
- [ ] National overlay records authored & jurisdiction-tagged \`${code}\`
- [ ] Every record cites a graded, dated source (citation-strength gate)
- [ ] No reproduced text from cite-only sources (licence-compliance gate)
- [ ] MoH / programme permission secured where logic derives from national guidelines
- [ ] Clinical review complete → set overlay.json \`signedOff: true\`
`;
  writeFileSync(resolve(OVERLAYS_ROOT, code, 'worklist.md'), md);
}

function run() {
  const targets = targetsFromArgs(process.argv);
  const registry = loadSourceRegistry();
  const profiles = loadCountryProfiles();
  const generatedAt = new Date().toISOString();
  const summary: Array<{ country: string; embed: number; worklist: number; profiled: boolean }> = [];

  for (const code of targets) {
    const name = EXPANSION_TARGETS[code];
    const profile = profiles[code];
    const { embed, worklist } = lanesForCountry(code, registry);
    const dir = resolve(OVERLAYS_ROOT, code);
    mkdirSync(dir, { recursive: true });

    // Authored overlay records (content/overlays/<CC>/records/*.json) are the
    // source of truth for which clinical domains this country has localized.
    // Derive `domains` from them so re-running this generator never wipes
    // authoring progress, and preserve a human-set `signedOff` flag.
    const recordsDir = resolve(dir, 'records');
    const authoredDomains =
      existsSync(recordsDir) && statSync(recordsDir).isDirectory()
        ? readdirSync(recordsDir)
            .filter((f) => f.endsWith('.json'))
            .map((f) => f.replace(/\.json$/, ''))
            .sort()
        : [];
    const overlayFile = resolve(dir, 'overlay.json');
    const prevSignedOff =
      existsSync(overlayFile) &&
      Boolean((JSON.parse(readFileSync(overlayFile, 'utf8')) as { signedOff?: boolean }).signedOff);

    // overlay.json — derived-localization source of truth. `domains` reflects the
    // authored records; a country only becomes "localized" once signedOff is set
    // (after clinical review) AND it has ≥1 authored domain.
    const overlay = {
      country: code,
      baseAuthority: 'WHO' as const,
      signedOff: prevSignedOff,
      domains: authoredDomains,
      sources: [...embed, ...worklist].map((s) => s.id),
      generatedAt,
      ...(profile ? { profile } : {}),
    };
    writeFileSync(overlayFile, `${JSON.stringify(overlay, null, 2)}\n`);

    // provenance.json — per-source audit trail (lane + licence + last checked).
    const provenance = {
      country: code,
      generatedAt,
      registryUpdated: registry.updated,
      sources: [...embed, ...worklist].map((s) => ({
        id: s.id,
        lane: s.embeddable === 'yes' ? 'embed' : 'worklist',
        tier: s.tier,
        licence: s.citationLicence,
        spdxOrName: s.spdxOrName,
        lastChecked: s.lastChecked,
        url: s.url,
      })),
    };
    writeFileSync(resolve(dir, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);

    writeWorklist(code, name, embed, worklist, profile);
    summary.push({
      country: code,
      embed: embed.length,
      worklist: worklist.length,
      profiled: Boolean(profile),
    });
    console.log(
      `✓ ${code} (${name}): ${embed.length} embed / ${worklist.length} worklist sources` +
        `${profile ? ` · langs ${profile.patientFacingLanguages.join('/')}` : ' · NO PROFILE'}`,
    );
  }

  const profiled = summary.filter((s) => s.profiled).length;
  console.log(`\nIngested ${summary.length} country overlay(s) → content/overlays/ (${profiled} profiled)`);
  console.log('Countries stay "in-progress" until clinical overlays are authored + signed off.');
}

run();
