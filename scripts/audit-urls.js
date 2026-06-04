#!/usr/bin/env node
/**
 * Bundle URL liveness audit.
 *
 * Walks every JSON file in content/bundles/v0.1.0/, extracts every
 * https?:// URL, then probes each one in parallel:
 *   - First a HEAD request (cheap).
 *   - On 405/501 (HEAD not allowed) or 403 (some bot guards refuse HEAD
 *     specifically), fall back to GET.
 *   - 2xx and 3xx are alive; we follow up to 5 redirects.
 *   - 4xx other than 401/403 (auth/bot) and 5xx persistent are DEAD.
 *
 * Bot-guard noise: many publisher CDNs (Wiley, Springer, Elsevier, OUP)
 * gate scraper traffic with 403. We retry with a browser-like UA and
 * mark 403 as "blocked" rather than "dead". A human in a browser can
 * still reach those pages.
 *
 * Writes /tmp/url-audit.json with per-URL status.
 * Prints a summary to stdout.
 */
const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve(__dirname, '../content/bundles/v0.1.0');

const urlToRecords = new Map(); // url → [{file, slug, fieldPath}]

function walk(obj, file, slug, trail) {
  if (typeof obj === 'string') {
    if (/^https?:\/\//.test(obj)) {
      const arr = urlToRecords.get(obj) ?? [];
      arr.push({ file, slug, fieldPath: trail.join('.') });
      urlToRecords.set(obj, arr);
    }
    return;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i += 1) walk(obj[i], file, slug, [...trail, i]);
    return;
  }
  if (obj && typeof obj === 'object') {
    const localSlug = obj.slug ?? obj.id ?? slug;
    for (const k of Object.keys(obj)) walk(obj[k], file, localSlug, [...trail, k]);
  }
}

for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.json') || f === 'manifest.json') continue;
  const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  walk(data, f, null, []);
}

const urls = [...urlToRecords.keys()];
console.error(`Auditing ${urls.length} unique URLs across ${urlToRecords.size} records …`);

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 VedaMDLinkAudit/1.0';

async function probe(url, attempt = 0) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, {
      method: attempt === 0 ? 'HEAD' : 'GET',
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/json,*/*',
        'accept-language': 'en',
      },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const status = res.status;
    // 405 = method not allowed; 501 = HEAD not implemented; some sites
    // 403 only on HEAD. Retry once with GET.
    if (attempt === 0 && (status === 405 || status === 501 || status === 403)) {
      return probe(url, 1);
    }
    return { status, finalUrl: res.url };
  } catch (e) {
    clearTimeout(timer);
    const reason = e?.cause?.code ?? e?.code ?? e?.name ?? 'fetch-error';
    return { status: 0, error: String(reason) };
  }
}

const CONCURRENCY = 24;
const results = {};
let done = 0;

(async function main() {
  const queue = urls.slice();
  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      const r = await probe(url);
      results[url] = r;
      done += 1;
      if (done % 100 === 0) console.error(`  ${done}/${urls.length} …`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  // Classify.
  const buckets = { ok: [], redirected: [], blocked: [], dead: [], net: [] };
  for (const [url, r] of Object.entries(results)) {
    if (r.status >= 200 && r.status < 300) buckets.ok.push(url);
    else if (r.status >= 300 && r.status < 400) buckets.redirected.push(url);
    else if (r.status === 401 || r.status === 403 || r.status === 429) buckets.blocked.push(url);
    else if (r.status === 0) buckets.net.push(url);
    else buckets.dead.push(url);
  }

  const out = path.resolve(__dirname, '../docs/url-audit.json');
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        scannedAt: new Date().toISOString(),
        totalUrls: urls.length,
        summary: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
        dead: buckets.dead.map((u) => ({
          url: u,
          status: results[u].status,
          records: urlToRecords.get(u),
        })),
        net: buckets.net.map((u) => ({
          url: u,
          error: results[u].error,
          records: urlToRecords.get(u),
        })),
        blocked: buckets.blocked.map((u) => ({
          url: u,
          status: results[u].status,
          records: urlToRecords.get(u),
        })),
      },
      null,
      2,
    ),
  );

  console.error(`\nWrote ${out}`);
  console.error(JSON.stringify({
    ok: buckets.ok.length,
    redirected: buckets.redirected.length,
    blocked_403_429: buckets.blocked.length,
    dead_404: buckets.dead.length,
    network_error: buckets.net.length,
  }, null, 2));
})();
