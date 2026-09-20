/**
 * Shared HTTP + RxNav client for the label tooling (ingest-manufacturer-labels,
 * audit-drug-rxnorm). Throttles per host, retries transient failures, detects
 * the openFDA daily quota, and caches RxNav responses on disk by URL.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
export const CACHE_DIR = resolve(ROOT, '.cache/labels');
const USER_AGENT = 'VedaMD-label-ingest/0.1 (clinical decision support; official APIs only)';

export class QuotaExhausted extends Error {}

const lastCall: Record<string, number> = {};
async function throttle(host: string, minGapMs: number): Promise<void> {
  for (;;) {
    const wait = (lastCall[host] ?? 0) + minGapMs - Date.now();
    if (wait <= 0) break;
    await new Promise((r) => setTimeout(r, wait));
  }
  lastCall[host] = Date.now();
}

export async function getJson(url: string, host: 'openfda' | 'rxnav'): Promise<unknown | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    await throttle(host, host === 'openfda' ? 300 : 80);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (res.status === 404) return null; // openFDA: NOT_FOUND = no matches
    if (res.status === 429) {
      const body = await res.text();
      if (/day|daily|quota/i.test(body) || attempt === 3) {
        throw new QuotaExhausted(`${host} rate limit: ${body.slice(0, 200)}`);
      }
      await new Promise((r) => setTimeout(r, 15_000 * (attempt + 1)));
      continue;
    }
    if (res.status >= 500) {
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      continue;
    }
    if (!res.ok)
      throw new Error(
        `${host} HTTP ${res.status} for ${url.replace(/api_key=[^&]+/, 'api_key=…')}`,
      );
    return res.json();
  }
  throw new Error(`${host} request failed after retries`);
}

/** RxNav responses are small and stable — cache them by URL. */
export async function rxnav(path: string): Promise<any> {
  mkdirSync(resolve(CACHE_DIR, 'rxnav'), { recursive: true });
  const url = `https://rxnav.nlm.nih.gov/REST/${path}`;
  const file = resolve(CACHE_DIR, 'rxnav', createHash('sha1').update(url).digest('hex') + '.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const data = await getJson(url, 'rxnav');
  writeFileSync(file, JSON.stringify(data));
  return data;
}

// ─── RxNorm resolution ─────────────────────────────────────────────────────

export interface Ingredient {
  rxcui: string;
  name: string;
  /** Precise-ingredient (salt) names, e.g. "metformin hydrochloride". */
  saltNames: string[];
}

export async function relatedIngredients(
  rxcui: string,
): Promise<{ rxcui: string; name: string }[]> {
  const data = await rxnav(`rxcui/${encodeURIComponent(rxcui)}/related.json?tty=IN`);
  return (data?.relatedGroup?.conceptGroup ?? []).flatMap((g: any) =>
    (g.conceptProperties ?? []).map((c: any) => ({ rxcui: c.rxcui, name: c.name })),
  );
}

export async function ingredientForName(
  name: string,
): Promise<{ rxcui: string; name: string } | null> {
  const ids = await rxnav(`rxcui.json?name=${encodeURIComponent(name)}&search=2`);
  const rxcui: string | undefined = ids?.idGroup?.rxnormId?.[0];
  if (!rxcui) return null;
  const props = (await rxnav(`rxcui/${rxcui}/properties.json`))?.properties;
  if (props?.tty === 'IN') return { rxcui, name: props.name };
  const ins = await relatedIngredients(rxcui);
  return ins.length === 1 ? ins[0] : null;
}

export async function withSalts(ing: { rxcui: string; name: string }): Promise<Ingredient> {
  const data = await rxnav(`rxcui/${ing.rxcui}/related.json?tty=PIN`);
  const saltNames = (data?.relatedGroup?.conceptGroup ?? []).flatMap((g: any) =>
    (g.conceptProperties ?? []).map((c: any) => c.name as string),
  );
  return { ...ing, saltNames };
}
