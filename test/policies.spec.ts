import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PoliciesService } from '../src/modules/policies/policies.service';

function makeService(): PoliciesService {
  // Isolate per-test by running in a temp cwd so disk writes go nowhere
  // permanent (the service persists under <cwd>/data/policies/).
  const dir = mkdtempSync(join(tmpdir(), 'vedamd-policies-'));
  const original = process.cwd();
  process.chdir(dir);
  const svc = new PoliciesService();
  svc.onModuleInit();
  (svc as unknown as { _cleanup: () => void })._cleanup = () => {
    process.chdir(original);
    rmSync(dir, { recursive: true, force: true });
  };
  return svc;
}

describe('PoliciesService', () => {
  let svc: PoliciesService;
  beforeEach(() => {
    svc = makeService();
  });

  it('persists a per-integrator policy and lists it as a summary', () => {
    const p = svc.create('int-1', {
      name: 'JCI Medication Management',
      source: 'JCI',
      version: '2024',
      sections: [
        { title: 'Reconciliation', body: 'Reconcile medications at every transition of care.' },
      ],
    });
    expect(p.id).toBeTruthy();
    expect(p.integratorId).toBe('int-1');
    expect(p.sectionCount).toBe(1);

    const list = svc.list('int-1');
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('JCI Medication Management');
    expect('sections' in (list[0] as object)).toBe(false);

    expect(svc.list('int-2')).toHaveLength(0);
  });

  it('finds the most relevant section by keyword overlap', () => {
    svc.create('int-1', {
      name: 'Local antibiotic SOP',
      source: 'company',
      sections: [
        {
          title: 'Pneumonia',
          body: 'First-line community pneumonia: amoxicillin 1 g tds for 5 days.',
        },
        {
          title: 'Sepsis',
          body: 'Empirical sepsis cover: piperacillin-tazobactam plus gentamicin.',
        },
      ],
    });
    const hits = svc.findRelevant('int-1', {
      question: 'How should I treat community pneumonia with amoxicillin?',
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].sectionTitle).toBe('Pneumonia');
    expect(hits[0].snippet.toLowerCase()).toContain('amoxicillin');
  });

  it('does not match across integrators (per-integrator scope)', () => {
    svc.create('int-1', { name: 'A', source: 'WHO', text: 'aspirin contraindicated in dengue.' });
    expect(svc.findRelevant('int-2', { question: 'aspirin and dengue' })).toHaveLength(0);
  });

  it('removes a policy and persists the deletion', () => {
    const p = svc.create('int-1', { name: 'X', source: 'WHO', text: 'one section.' });
    expect(svc.remove('int-1', p.id)).toBe(true);
    expect(svc.list('int-1')).toHaveLength(0);
    expect(svc.remove('int-1', p.id)).toBe(false);
  });

  it('round-trips a policy through disk persistence', () => {
    const p = svc.create('int-1', {
      name: 'Persisted',
      source: 'ISO',
      text: 'isolated test body.',
    });
    // Disk file should exist under <cwd>/data/policies/<integratorId>.json
    expect(existsSync(join(process.cwd(), 'data', 'policies', 'int-1.json'))).toBe(true);
    // A fresh service instance should load the persisted record.
    const fresh = new PoliciesService();
    fresh.onModuleInit();
    expect(fresh.get('int-1', p.id)).toBeTruthy();
  });
});
