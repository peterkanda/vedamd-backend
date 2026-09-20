#!/usr/bin/env ts-node
/**
 * Release-readiness report — the markdown twin of GET /v1/governance/readiness.
 *
 *   npm run readiness:report                 # writes content/safety/release-readiness.md
 *   npm run readiness:report -- --bundle content/bundles/v0.2.0
 *
 * Loads and verifies the signed bundle exactly as the API does (draft content
 * allowed, so the report can describe it), then renders GovernanceService's
 * verdicts. Exit code is 0 either way: this measures, it does not gate.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { PhiFreeLogger } from '../src/common/phi-free-logger';
import type { AppConfig } from '../src/config/configuration';
import { GovernanceService } from '../src/modules/governance/governance.service';
import type { ReadinessStatus } from '../src/modules/governance/governance.types';
import { KnowledgeService } from '../src/modules/knowledge/knowledge.service';

const ROOT = resolve(__dirname, '..');
const OUT = resolve(ROOT, 'content/safety/release-readiness.md');
const bundleArg = process.argv.indexOf('--bundle');
const bundleDir = resolve(
  process.cwd(),
  bundleArg >= 0 ? process.argv[bundleArg + 1] : 'content/bundles/v0.1.0',
);

const config = {
  get: (key: string) => {
    if (key === 'content.bundleDir') return bundleDir;
    if (key === 'content.strictVerification') return true;
    if (key === 'content.requireApproved') return process.env.CONTENT_REQUIRE_APPROVED === 'true';
    return undefined;
  },
} as unknown as ConfigService<AppConfig, true>;
const knowledge = new KnowledgeService(
  config,
  new PhiFreeLogger({ service: 'readiness-report', hashSecret: 'readiness-report', strict: true }),
);
knowledge.loadFromConfig();

const r = new GovernanceService(knowledge).readiness();
const icon: Record<ReadinessStatus, string> = {
  pass: '✅ pass',
  warn: '⚠️ warn',
  block: '⛔ block',
};
const cell = (s: string) => s.replace(/\|/g, '/');

const md = `# Release readiness — bundle ${r.bundleVersion}

Generated ${r.generatedAt} by \`npm run readiness:report\` (same data as
\`GET /v1/governance/readiness\`).

**Release-ready for approved-only serving: ${r.releaseReady ? 'YES' : 'NO'}**
${r.blockers.length ? `\nBlocking:\n${r.blockers.map((b) => `- ${b}`).join('\n')}\n` : ''}
| check | status | measurement | next step |
|---|---|---|---|
${r.checks.map((c) => `| ${cell(c.title)} | ${icon[c.status]} | ${cell(c.summary)} | ${cell(c.action ?? '')} |`).join('\n')}

## Approval by domain (review in this order)

| tier | domain | records | approved | in review | draft | approved % |
|---|---|---|---|---|---|---|
${r.domains.map((d) => `| ${d.tier} | ${d.domain} | ${d.total} | ${d.approved} | ${d.review} | ${d.draft} | ${d.approvedPct}% |`).join('\n')}

Tier 1 = content that directly drives a dose, a drug choice or a safety alert;
tier 2 = clinical guidance and decision aids; tier 3 = reference material.
`;

writeFileSync(OUT, md);
console.log(`Release-ready: ${r.releaseReady ? 'YES' : 'NO'} (${r.blockers.length} blocker(s))`);
for (const c of r.checks) console.log(`  ${c.status.padEnd(5)} ${c.id}: ${c.summary}`);
console.log(`→ ${OUT.replace(ROOT + '/', '')}`);
