import { describe, expect, it } from 'vitest';
import { PostmanCollectionService } from '../src/modules/integrations/postman-collection.service';
import type { CdsServiceDescriptor } from '../src/modules/cds/cds.types';

const fakeServices: CdsServiceDescriptor[] = [
  {
    id: 'vedamd-patient-view',
    hook: 'patient-view',
    title: 'VedaMD safety checks',
    description: 'Runs the safety floor on the loaded patient context.',
  },
  {
    id: 'vedamd-medication-prescribe',
    hook: 'medication-prescribe',
    title: 'Medication prescribe',
    description: 'Drug interaction + dosing + allergy guard-rails.',
  },
];

interface CollectionFolder {
  name: string;
  item?: Array<{ name: string; request?: { method?: string; body?: { raw?: string } } }>;
}

interface PostmanCollection {
  info: { name: string; schema: string };
  auth: { type: string; bearer: Array<{ value: string }> };
  variable: Array<{ key: string; value: string }>;
  item: CollectionFolder[];
}

describe('PostmanCollectionService', () => {
  const svc = new PostmanCollectionService();

  it('builds a valid Postman v2.1 collection envelope', () => {
    const collection = svc.build({
      baseUrl: 'https://api.example.com',
      services: fakeServices,
    }) as PostmanCollection;
    expect(collection.info.name).toContain('VedaMD');
    expect(collection.info.schema).toContain('v2.1.0');
    expect(collection.auth.type).toBe('bearer');
    expect(collection.auth.bearer[0].value).toBe('{{apiKey}}');
    expect(collection.variable.find((v) => v.key === 'baseUrl')?.value).toBe(
      'https://api.example.com',
    );
    expect(collection.variable.find((v) => v.key === 'apiKey')).toBeDefined();
  });

  it('includes a CDS Hooks folder with discovery + one item per service', () => {
    const collection = svc.build({
      baseUrl: 'https://api.example.com',
      services: fakeServices,
    }) as PostmanCollection;
    const cdsFolder = collection.item.find((f) => f.name === 'CDS Hooks');
    expect(cdsFolder).toBeDefined();
    expect(cdsFolder!.item).toHaveLength(1 + fakeServices.length);
    expect(cdsFolder!.item![0].name).toBe('Discover services');
    expect(cdsFolder!.item![1].name).toContain('vedamd-patient-view');
    expect(cdsFolder!.item![1].request?.method).toBe('POST');
  });

  it('embeds a FHIR Bundle sample body for medication-prescribe hooks', () => {
    const collection = svc.build({
      baseUrl: 'https://api.example.com',
      services: fakeServices,
    }) as PostmanCollection;
    const cdsFolder = collection.item.find((f) => f.name === 'CDS Hooks');
    const prescribe = cdsFolder!.item!.find((i) => i.name.includes('medication-prescribe'));
    expect(prescribe).toBeDefined();
    const body = prescribe!.request!.body!.raw!;
    expect(body).toContain('"hook": "medication-prescribe"');
    expect(body).toContain('"resourceType": "Bundle"');
    expect(body).toContain('"resourceType": "MedicationRequest"');
    expect(body).toContain('rxnorm');
  });

  it('includes Content, Integrations catalogue, and Agentic folders', () => {
    const collection = svc.build({
      baseUrl: 'https://api.example.com',
      services: fakeServices,
    }) as PostmanCollection;
    const names = collection.item.map((f) => f.name);
    expect(names).toContain('Content');
    expect(names).toContain('Integrations catalogue');
    expect(names).toContain('Agentic CDS');
  });

  it('handles an empty CDS service list gracefully', () => {
    const collection = svc.build({
      baseUrl: 'https://api.example.com',
      services: [],
    }) as PostmanCollection;
    const cdsFolder = collection.item.find((f) => f.name === 'CDS Hooks');
    expect(cdsFolder!.item).toHaveLength(1); // just discovery
  });
});
