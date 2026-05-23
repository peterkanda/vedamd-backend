import { describe, expect, it, beforeEach } from 'vitest';
import { PoliciesService } from '../src/modules/policies/policies.service';

function makeService(): PoliciesService {
  // No DATABASE_URL in unit tests -> in-memory fallback (the DRIZZLE
  // token is injected as null when the DB is absent, and we let the
  // default `db = null` parameter take effect by passing nothing).
  const svc = new PoliciesService();
  svc.onModuleInit();
  return svc;
}

describe('PoliciesService (in-memory mode)', () => {
  let svc: PoliciesService;
  beforeEach(() => {
    svc = makeService();
  });

  it('creates a per-integrator policy and lists it as a summary', async () => {
    const p = await svc.create('int-1', {
      name: 'JCI Medication Management',
      source: 'JCI',
      version: '2024',
      sections: [
        {
          title: 'Reconciliation',
          body: 'Reconcile medications at every transition of care.',
        },
      ],
    });
    expect(p.id).toBeTruthy();
    expect(p.integratorId).toBe('int-1');
    expect(p.sectionCount).toBe(1);

    const list = await svc.list('int-1');
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('JCI Medication Management');
    expect('sections' in (list[0] as object)).toBe(false);

    expect(await svc.list('int-2')).toHaveLength(0);
  });

  it('finds the most relevant section by keyword overlap', async () => {
    await svc.create('int-1', {
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
    const hits = await svc.findRelevant('int-1', {
      question: 'How should I treat community pneumonia with amoxicillin?',
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].sectionTitle).toBe('Pneumonia');
    expect(hits[0].snippet.toLowerCase()).toContain('amoxicillin');
  });

  it('does not match across integrators (per-integrator scope)', async () => {
    await svc.create('int-1', {
      name: 'A',
      source: 'WHO',
      text: 'aspirin contraindicated in dengue.',
    });
    expect(await svc.findRelevant('int-2', { question: 'aspirin and dengue' })).toHaveLength(0);
  });

  it('removes a policy', async () => {
    const p = await svc.create('int-1', {
      name: 'X',
      source: 'WHO',
      text: 'one section.',
    });
    expect(await svc.remove('int-1', p.id)).toBe(true);
    expect(await svc.list('int-1')).toHaveLength(0);
    expect(await svc.remove('int-1', p.id)).toBe(false);
  });

  it('returns null for an unknown policy id', async () => {
    expect(await svc.get('int-1', 'not-a-real-policy')).toBeNull();
  });

  it('normalises both `sections` and a single `text` body', async () => {
    const a = await svc.create('int-1', { name: 'A', source: 'company', text: 'hello world' });
    expect(a.sections).toEqual([{ body: 'hello world' }]);
    const b = await svc.create('int-1', {
      name: 'B',
      source: 'company',
      sections: [{ title: 'One', body: 'first' }, { title: '', body: '' }, { body: 'third' }],
    });
    // Empty sections are filtered out.
    expect(b.sectionCount).toBe(2);
  });
});
