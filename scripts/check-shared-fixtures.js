#!/usr/bin/env node
/**
 * The clinical-claim phrasing fixture is shared with vedamd-mobile by copy
 * (the repos cannot import from each other). When the mobile repo is checked
 * out next to this one, fail if the two copies differ so the cloud and
 * on-device refusal gates cannot drift apart unnoticed.
 *
 *   npm run check:shared-fixtures
 */
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const pairs = [
  [
    'test/fixtures/clinical-claim-phrasings.json',
    '../vedamd-mobile/src/llm/__tests__/fixtures/clinical-claim-phrasings.json',
  ],
];

let failed = false;
for (const [ours, theirs] of pairs) {
  const a = resolve(__dirname, '..', ours);
  const b = resolve(__dirname, '..', theirs);
  if (!existsSync(b)) {
    console.log(`skip: ${theirs} not checked out`);
    continue;
  }
  const same = readFileSync(a, 'utf8') === readFileSync(b, 'utf8');
  console.log(`${same ? 'ok  ' : 'DIFF'} ${ours} ↔ ${theirs}`);
  if (!same) failed = true;
}
process.exit(failed ? 1 : 0);
