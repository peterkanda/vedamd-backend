import { describe, expect, it } from 'vitest';
import { IntegrationMarkdownService } from '../src/modules/integrations/integration-markdown.service';
import { IntegrationsService } from '../src/modules/integrations/integrations.service';

describe('IntegrationMarkdownService', () => {
  const md = new IntegrationMarkdownService();
  const integrations = new IntegrationsService();

  it('renders an Integration as a Markdown document with all sections', () => {
    const openmrs = integrations.get('openmrs');
    expect(openmrs).not.toBeNull();
    const text = md.render(openmrs!);
    expect(text).toContain('# OpenMRS');
    expect(text).toContain('## At a glance');
    expect(text).toContain('## Description');
    expect(text).toContain('## Supported CDS Hooks');
    expect(text).toContain('## Snippets');
    expect(text).toContain('## Links');
    expect(text).toContain('## Notes');
    expect(text).toContain('slug `openmrs`');
  });

  it('embeds snippet code in fenced blocks with language tag', () => {
    const dhis2 = integrations.get('dhis2');
    expect(dhis2).not.toBeNull();
    const text = md.render(dhis2!);
    expect(text).toMatch(/```javascript/);
    expect(text).toMatch(/```xml/); // iframe embed
    expect(text).toMatch(/```\n/);
  });

  it('omits CDS Hooks section when not applicable to a standard', () => {
    const hl7v2 = integrations.get('hl7v2');
    expect(hl7v2).not.toBeNull();
    const text = md.render(hl7v2!);
    // HL7 v2 does not have supportedHooks in the fixture
    expect(text).toContain('# HL7 v2');
    // Section header should be absent for hooks
    expect(text.includes('## Supported CDS Hooks')).toBe(false);
  });

  it('lists all methods + tags + homepage in the At a glance block', () => {
    const epic = integrations.get('epic');
    expect(epic).not.toBeNull();
    const text = md.render(epic!);
    expect(text).toContain('**Primary method:** `cds-hooks`');
    expect(text).toContain('`smart-on-fhir`');
    expect(text).toContain('**Homepage:** https://www.epic.com');
    expect(text).toContain('**Tags:** enterprise, us, global');
  });
});
