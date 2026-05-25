import { describe, expect, it, beforeEach } from 'vitest';
import { CustomRulesService } from '../src/modules/custom-rules/custom-rules.service';

describe('CustomRulesService (in-memory)', () => {
  let svc: CustomRulesService;

  beforeEach(() => {
    svc = new CustomRulesService(null);
    svc.onModuleInit();
  });

  it('creates, lists, fetches, updates, and deletes a rule', async () => {
    const created = await svc.create('acme', {
      name: 'Hold metformin in CKD 4/5',
      indicator: 'critical',
      match: { medications: ['metformin'], eGFRBelow: 30 },
      card: { summary: 'Hold metformin — eGFR < 30.' },
    });
    expect(created.id).toBeTruthy();
    expect(created.enabled).toBe(true);

    const list = await svc.list('acme');
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Hold metformin in CKD 4/5');

    const fetched = await svc.get('acme', created.id);
    expect(fetched?.match.eGFRBelow).toBe(30);

    const updated = await svc.update('acme', created.id, {
      enabled: false,
      card: { summary: 'updated summary' },
    });
    expect(updated?.enabled).toBe(false);
    expect(updated?.card.summary).toBe('updated summary');

    expect(await svc.remove('acme', created.id)).toBe(true);
    expect(await svc.list('acme')).toHaveLength(0);
  });

  it('isolates rules across integrators', async () => {
    await svc.create('acme', {
      name: 'r1',
      indicator: 'warning',
      match: { medications: ['warfarin'] },
      card: { summary: 'warfarin alert' },
    });
    expect(await svc.list('acme')).toHaveLength(1);
    expect(await svc.list('other-tenant')).toHaveLength(0);
    expect(await svc.get('other-tenant', (await svc.list('acme'))[0].id)).toBeNull();
  });

  it('rejects malformed payloads', async () => {
    await expect(
      svc.create('acme', {
        name: '',
        indicator: 'warning',
        match: { medications: ['x'] },
        card: { summary: 's' },
      }),
    ).rejects.toThrow('name is required');

    await expect(
      svc.create('acme', {
        name: 'n',
        indicator: 'warning',
        match: {},
        card: { summary: 's' },
      }),
    ).rejects.toThrow('match must contain at least one clause');

    await expect(
      svc.create('acme', {
        name: 'n',
        indicator: 'warning',
        match: { medications: ['x'] },
        card: { summary: '' },
      }),
    ).rejects.toThrow('card.summary is required');

    await expect(
      svc.create('acme', {
        name: 'n',
        indicator: 'warning',
        match: {
          medications: ['x'],
          labs: [{ operator: '>', value: 10 }],
        },
        card: { summary: 's' },
      }),
    ).rejects.toThrow('lab clause needs code or nameContains');
  });

  it('evaluates: medication + eGFR combo fires for matching patient', async () => {
    await svc.create('acme', {
      name: 'CKD metformin hold',
      indicator: 'critical',
      match: { medications: ['metformin'], eGFRBelow: 30 },
      card: { summary: 'Hold metformin — eGFR < 30.' },
    });

    const hits = await svc.evaluate('acme', {
      medications: ['Metformin 500 mg PO BD'],
      patient: { ageYears: 70, eGFR: 22 },
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].card.summary).toContain('Hold metformin');
    expect(hits[0].card.indicator).toBe('critical');
  });

  it('evaluates: does not fire if eGFR above threshold', async () => {
    await svc.create('acme', {
      name: 'CKD metformin hold',
      indicator: 'critical',
      match: { medications: ['metformin'], eGFRBelow: 30 },
      card: { summary: 'Hold metformin — eGFR < 30.' },
    });
    const hits = await svc.evaluate('acme', {
      medications: ['metformin'],
      patient: { ageYears: 60, eGFR: 65 },
    });
    expect(hits).toHaveLength(0);
  });

  it('evaluates: hooks restriction blocks non-matching hook', async () => {
    await svc.create('acme', {
      name: 'Pregnancy lisinopril',
      indicator: 'critical',
      match: { medications: ['lisinopril'], pregnant: true, hooks: ['medication-prescribe'] },
      card: { summary: 'ACEi contraindicated in pregnancy.' },
    });
    const hit = await svc.evaluate('acme', {
      hook: 'patient-view',
      medications: ['lisinopril'],
      patient: { pregnant: true },
    });
    expect(hit).toHaveLength(0);

    const fired = await svc.evaluate('acme', {
      hook: 'medication-prescribe',
      medications: ['lisinopril'],
      patient: { pregnant: true },
    });
    expect(fired).toHaveLength(1);
  });

  it('evaluates: lab clause matches by nameContains + operator', async () => {
    await svc.create('acme', {
      name: 'Hyperkalaemia',
      indicator: 'warning',
      match: {
        diagnoses: ['heart failure'],
        labs: [{ nameContains: 'potassium', operator: '>', value: 5.5 }],
      },
      card: { summary: 'K > 5.5 — review RAAS blockade + diuretics.' },
    });
    const hits = await svc.evaluate('acme', {
      diagnoses: ['heart failure'],
      labs: [{ name: 'Serum potassium', value: 6.1, unit: 'mmol/L' }],
    });
    expect(hits).toHaveLength(1);

    const miss = await svc.evaluate('acme', {
      diagnoses: ['heart failure'],
      labs: [{ name: 'Serum potassium', value: 4.8 }],
    });
    expect(miss).toHaveLength(0);
  });

  it('evaluates: disabled rules are skipped', async () => {
    const r = await svc.create('acme', {
      name: 'r',
      indicator: 'warning',
      match: { medications: ['ibuprofen'] },
      card: { summary: 's' },
    });
    await svc.update('acme', r.id, { enabled: false });
    const hits = await svc.evaluate('acme', { medications: ['ibuprofen'] });
    expect(hits).toHaveLength(0);
  });

  it('evaluates: empty integratorId returns no hits', async () => {
    expect(await svc.evaluate('', { medications: ['anything'] })).toEqual([]);
  });
});
