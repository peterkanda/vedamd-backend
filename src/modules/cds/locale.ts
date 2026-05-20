import type { CdsRule } from '../conditions/conditions.types';
import type { CdsHookRequest } from './cds.types';

/**
 * Pick the locale-appropriate card frame for a rule, with safe fallback.
 *
 *   - Reads `context.lang` from the request (BCP-47 short code: 'en', 'sw').
 *   - If `rule.localeMessages[lang]` exists, substitutes any `{{key}}`
 *     placeholders from the supplied `vars` map.
 *   - Otherwise returns the supplied English defaults unchanged.
 *
 * Strategies stay readable: the English path is "just write the string."
 * Localisation becomes a content-side change (drop `localeMessages` into
 * the rule declaration in the signed bundle) — no code change needed.
 */

export type StringVars = Record<string, string | number | boolean | null | undefined>;

export interface ResolvedMessage {
  summary: string;
  detail: string;
  lang: string;
}

export function resolveLang(req: CdsHookRequest): string {
  const ctx = (req.context ?? {}) as { lang?: unknown };
  if (typeof ctx.lang === 'string' && ctx.lang.length > 0 && ctx.lang.length < 16) {
    return ctx.lang.toLowerCase();
  }
  return 'en';
}

export function resolveCardCopy(
  rule: CdsRule,
  req: CdsHookRequest,
  defaults: { summary: string; detail: string },
  vars: StringVars = {},
): ResolvedMessage {
  const lang = resolveLang(req);
  const localized = rule.localeMessages?.[lang];
  const summary = interpolate(localized?.summary ?? defaults.summary, vars);
  const detail = interpolate(localized?.detail ?? defaults.detail, vars);
  return { summary, detail, lang };
}

function interpolate(template: string, vars: StringVars): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? '' : String(v);
  });
}
