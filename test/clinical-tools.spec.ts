import { describe, expect, it } from 'vitest';
import { ClinicalToolsService } from '../src/modules/clinical-tools/clinical-tools.service';

describe('ClinicalToolsService', () => {
  const svc = new ClinicalToolsService();

  it('exposes the full reference payload (doseDrugs + vitals + scoringSystems)', () => {
    const out = svc.all();
    expect(out).toHaveProperty('doseDrugs');
    expect(out).toHaveProperty('vitals');
    expect(out).toHaveProperty('scoringSystems');
    expect(out.doseDrugs.length).toBeGreaterThanOrEqual(9);
    expect(out.vitals.length).toBeGreaterThanOrEqual(7);
    expect(out.scoringSystems.length).toBe(4);
  });

  it('paediatric dose drugs include WHO IMCI staples', () => {
    const ids = svc.all().doseDrugs.map((d) => d.id);
    expect(ids).toContain('paracetamol');
    expect(ids).toContain('amoxicillin');
    expect(ids).toContain('ceftriaxone');
    expect(ids).toContain('salbutamol');
    expect(ids).toContain('zinc');
    expect(ids).toContain('ors');
  });

  it('vitals reference table covers neonate → adult bands', () => {
    const bands = svc.all().vitals.map((v) => v.band);
    expect(bands).toContain('Neonate (0–28 d)');
    expect(bands).toContain('Adult');
  });

  it('scoring systems include NEWS2, qSOFA, Wells PE and CHA2DS2-VASc', () => {
    const ids = svc.all().scoringSystems.map((s) => s.id);
    expect(ids).toContain('news2');
    expect(ids).toContain('qsofa');
    expect(ids).toContain('wells-pe');
    expect(ids).toContain('cha2ds2-vasc');
  });

  it('NEWS2 axes are band-type with options', () => {
    const news2 = svc.scoringSystem('news2');
    expect(news2).not.toBeNull();
    expect(news2!.type).toBe('band');
    expect(news2!.axes.length).toBe(7);
    expect(news2!.axes[0].options).toBeDefined();
  });

  it('Wells PE axes are toggle-type with per-item points', () => {
    const wells = svc.scoringSystem('wells-pe');
    expect(wells).not.toBeNull();
    expect(wells!.type).toBe('toggle');
    expect(wells!.axes.every((a) => typeof a.points === 'number')).toBe(true);
  });

  it('returns null for an unknown scoring id', () => {
    expect(svc.scoringSystem('not-a-real-score')).toBeNull();
  });
});
