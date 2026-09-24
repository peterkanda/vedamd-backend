#!/usr/bin/env ts-node
/**
 * Time the agentic retriever and fingerprint what it returns.
 *
 *   npx ts-node --transpile-only scripts/bench-retrieval.ts --out /tmp/before.json
 *   (change the retriever)
 *   npx ts-node --transpile-only scripts/bench-retrieval.ts --out /tmp/after.json --compare /tmp/before.json
 *
 * Runs single questions, structured contexts and conversations of growing
 * length (both a repeated line and varied clinical prose from the bundle)
 * through KnowledgeRetrieverService.retrieve against the real bundle. For each
 * it records the mean time and a SHA-256 of the output and of placedRecords.
 * --compare fails if any fingerprint differs — use it to show a speed change
 * left retrieval byte-identical. No network, no database.
 */
/* eslint-disable no-console */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { KnowledgeRetrieverService } from '../src/modules/agentic/knowledge-retriever.service';
import { makeKnowledgeService } from '../test/helpers/knowledge';

type Ctx = Parameters<KnowledgeRetrieverService['retrieve']>[0];
const qs = [
  'hypertension management in pregnancy',
  'I want to prescribe malaria drugs for a 15 year old 60 kg',
  'Is it safe to co-prescribe clarithromycin with simvastatin?',
  'first line treatment for community acquired pneumonia in adults',
  'amoxicillin dose for a 12 kg child with otitis media',
  'what is the abbreviation for reciprocal dosing',
  'neonatal sepsis antibiotics',
  'warfarin and ibuprofen interaction',
  'management of severe acute malnutrition',
  'metformin in CKD stage 4 eGFR 20',
  'postpartum haemorrhage oxytocin misoprostol',
  'HIV PrEP tenofovir emtricitabine renal',
  'TB treatment rifampicin isoniazid pyrazinamide ethambutol dosing weight bands',
  'diabetic ketoacidosis insulin fluids',
  'asthma exacerbation salbutamol prednisolone child',
  "and if after 3 days they don't get better?",
  '',
  'Augmentin Coartem Panadol',
  'status epilepticus diazepam phenobarbital',
  'urinary tract infection nitrofurantoin pregnancy',
];
const fixtures: Array<{ name: string; ctx: Ctx }> = [];
qs.forEach((q, i) => fixtures.push({ name: `q${i}`, ctx: { question: q } }));
fixtures.push({
  name: 'meds',
  ctx: { medications: ['warfarin', 'naproxen', 'Amoxicillin'], allergies: ['penicillin'] },
});
fixtures.push({ name: 'dx', ctx: { diagnoses: ['eclampsia', 'J18.9'], question: 'what next' } });
fixtures.push({
  name: 'hook',
  ctx: { hook: 'medication-prescribe', medications: ['ciprofloxacin'], question: 'QT risk' },
});
fixtures.push({
  name: 'full',
  ctx: {
    question: 'dose?',
    medications: ['gentamicin'],
    diagnoses: ['neonatal sepsis'],
    allergies: ['sulfa'],
    patient: { ageYears: 0.1, weightKg: 3 },
  } as Ctx,
});
// conversations
const turns = (n: number, size: number) =>
  Array.from({ length: n }, (_, i) => ({
    role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant',
    content: (
      qs[i % qs.length] +
      ' ' +
      'Consider artemether lumefantrine, amoxicillin, ceftriaxone, magnesium sulfate and labetalol. Monitor renal function and blood pressure. '
    )
      .repeat(Math.ceil(size / 180))
      .slice(0, size),
  }));
for (const [n, size] of [
  [2, 400],
  [4, 1000],
  [8, 1500],
  [16, 1500],
  [16, 6000],
  [40, 6000],
] as const) {
  fixtures.push({
    name: `conv${n}x${size}`,
    ctx: { question: 'and for a child?', conversation: turns(n, size) },
  });
}

const knowledge = makeKnowledgeService();
// Realistic threads: varied clinical prose drawn from bundle records, so the
// token mix is as diverse as a real conversation rather than one repeated line.
const prose = knowledge
  .getConditions()
  .filter((_, i) => i % 37 === 0)
  .map((c) => JSON.stringify(c).replace(/[{}"\[\]]/g, ' '));
const realTurns = (n: number, size: number) =>
  Array.from({ length: n }, (_, i) => ({
    role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant',
    content: prose[i % prose.length].slice(0, size),
  }));
for (const [n, size] of [
  [4, 1500],
  [16, 1500],
  [16, 6000],
  [40, 6000],
] as const) {
  fixtures.push({
    name: `real${n}x${size}`,
    ctx: { question: 'what about in pregnancy?', conversation: realTurns(n, size) },
  });
}
const retriever = new KnowledgeRetrieverService(knowledge);
const out: Record<string, string> = {};
const timings: Record<string, number> = {};
for (const f of fixtures) {
  retriever.retrieve(f.ctx); // warm
  const t0 = performance.now();
  const reps = f.name.startsWith('conv40') ? 2 : 5;
  let r;
  for (let i = 0; i < reps; i++) r = retriever.retrieve(f.ctx);
  timings[f.name] = +((performance.now() - t0) / reps).toFixed(1);
  const json = JSON.stringify(r);
  out[f.name] = createHash('sha256').update(json).digest('hex') + ` ${json.length}`;
  out[f.name + ':placed'] = createHash('sha256')
    .update(JSON.stringify(retriever.placedRecords(r!)))
    .digest('hex');
}
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const outPath = arg('--out');
if (outPath) writeFileSync(outPath, JSON.stringify({ out, timings }, null, 1));

const comparePath = arg('--compare');
if (comparePath) {
  const before = JSON.parse(readFileSync(comparePath, 'utf8')) as {
    out: Record<string, string>;
    timings: Record<string, number>;
  };
  const changed = Object.keys(before.out).filter((k) => before.out[k] !== out[k]);
  for (const name of Object.keys(timings)) {
    console.log(
      `${name.padEnd(14)} ${String(before.timings[name] ?? '-').padStart(8)} ms -> ${timings[name]} ms`,
    );
  }
  console.log(changed.length ? `CHANGED OUTPUT: ${changed.join(', ')}` : 'Output identical.');
  if (changed.length) process.exitCode = 1;
} else {
  for (const [name, ms] of Object.entries(timings)) console.log(`${name.padEnd(14)} ${ms} ms`);
}
