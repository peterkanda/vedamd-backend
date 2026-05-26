import { describe, expect, it } from 'vitest';
import { IntegrationsService } from '../src/modules/integrations/integrations.service';

function svc() {
  return new IntegrationsService();
}

describe('IntegrationsService', () => {
  it('exposes the EMR / HMIS integration catalogue', () => {
    const list = svc().list();
    const slugs = list.map((i) => i.slug);
    expect(slugs).toContain('openmrs');
    expect(slugs).toContain('openemr');
    expect(slugs).toContain('bahmni');
    expect(slugs).toContain('erpnext-frappe-healthcare');
    expect(slugs).toContain('dhis2');
    expect(slugs).toContain('cds-hooks');
    expect(slugs).toContain('fhir-r4');
    expect(slugs).toContain('smart-on-fhir');
    expect(list.length).toBeGreaterThanOrEqual(14);
  });

  it('filters by category (open-source / proprietary / standard)', () => {
    const oss = svc().list({ category: 'open-source' });
    expect(oss.every((i) => i.category === 'open-source')).toBe(true);
    expect(oss.map((i) => i.slug)).toContain('openmrs');

    const proprietary = svc().list({ category: 'proprietary' });
    expect(proprietary.every((i) => i.category === 'proprietary')).toBe(true);
    expect(proprietary.map((i) => i.slug)).toContain('epic');

    const standards = svc().list({ category: 'standard' });
    expect(standards.every((i) => i.category === 'standard')).toBe(true);
    expect(standards.map((i) => i.slug)).toContain('fhir-r4');
  });

  it('filters by method', () => {
    const cdsHooks = svc().list({ method: 'cds-hooks' });
    expect(cdsHooks.map((i) => i.slug)).toContain('openemr');
    expect(cdsHooks.every((i) => i.methods.includes('cds-hooks'))).toBe(true);

    const smart = svc().list({ method: 'smart-on-fhir' });
    expect(smart.map((i) => i.slug)).toContain('epic');
    expect(smart.every((i) => i.methods.includes('smart-on-fhir'))).toBe(true);
  });

  it('text search matches name + tags + description', () => {
    const ssa = svc().list({ q: 'ssa' });
    expect(ssa.map((i) => i.slug)).toContain('openmrs');
    expect(ssa.map((i) => i.slug)).toContain('dhis2');

    const kenya = svc().list({ q: 'kenya' });
    expect(kenya.map((i) => i.slug)).toContain('dhis2');
  });

  it('get() returns full integration with snippets + links', () => {
    const openmrs = svc().get('openmrs');
    expect(openmrs).not.toBeNull();
    expect(openmrs!.snippets.length).toBeGreaterThan(0);
    expect(openmrs!.snippets[0].code.length).toBeGreaterThan(0);
    expect(openmrs!.links.length).toBeGreaterThan(0);
    expect(openmrs!.supportedHooks).toContain('patient-view');
  });

  it('returns null for an unknown slug', () => {
    expect(svc().get('not-a-real-emr')).toBeNull();
  });
});
