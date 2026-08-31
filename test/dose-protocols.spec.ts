import { describe, expect, it } from 'vitest';
import { DoseProtocolsService } from '../src/modules/dose-protocols/dose-protocols.service';

describe('DoseProtocolsService', () => {
  const svc = new DoseProtocolsService();

  it('exposes the full diagnosis catalogue alphabetically', () => {
    const list = svc.diagnoses();
    expect(list.length).toBeGreaterThan(50);
    const sorted = [...list].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    expect(list).toEqual(sorted);
  });

  it('list() with no filters returns all protocols + grouped diagnoses', () => {
    const out = svc.list();
    expect(out.protocols.length).toBeGreaterThan(100);
    expect(out.diagnoses.length).toBeGreaterThan(50);
    // First protocol shape
    const p = out.protocols[0];
    expect(p).toHaveProperty('diagnosis');
    expect(p).toHaveProperty('medication');
    expect(p).toHaveProperty('minPerKg');
    expect(p).toHaveProperty('maxPerKg');
  });

  it('q filters across diagnosis / medication / preparation / remarks', () => {
    const out = svc.list({ q: 'amoxicillin' });
    expect(out.protocols.length).toBeGreaterThan(0);
    expect(
      out.protocols.every((p) =>
        [p.diagnosis, p.medication, p.preparation, p.remarks ?? '']
          .join(' ')
          .toLowerCase()
          .includes('amoxicillin'),
      ),
    ).toBe(true);
  });

  it('diagnosis filter narrows to a single named diagnosis (substring match)', () => {
    const sample = svc.diagnoses().find((d) => /pneumonia/i.test(d));
    expect(sample).toBeDefined();
    const out = svc.list({ diagnosis: sample! });
    expect(out.protocols.length).toBeGreaterThan(0);
    expect(out.protocols.every((p) => p.diagnosis === sample)).toBe(true);
  });

  it('returns empty arrays when no rows match', () => {
    const out = svc.list({ q: 'this-string-will-not-match-anything-xyz' });
    expect(out.protocols).toEqual([]);
    expect(out.diagnoses).toEqual([]);
  });
});
