import { Injectable } from '@nestjs/common';
import type { Integration } from './integrations.data';

/**
 * Render an Integration record as a Markdown document suitable for
 * pasting into Confluence / Notion / GitHub README / internal wiki.
 *
 * Plain text out, no PHI, no patient data — same content as the JSON
 * detail endpoint, formatted for human reading.
 */
@Injectable()
export class IntegrationMarkdownService {
  render(i: Integration): string {
    const lines: string[] = [];

    lines.push(`# ${i.name}`);
    lines.push('');
    lines.push(`> ${i.tagline}`);
    lines.push('');

    lines.push('## At a glance');
    lines.push('');
    lines.push(`- **Category:** ${i.category}`);
    lines.push(`- **Primary method:** \`${i.primaryMethod}\``);
    lines.push(`- **All methods:** ${i.methods.map((m) => `\`${m}\``).join(', ')}`);
    if (i.tags.length > 0) {
      lines.push(`- **Tags:** ${i.tags.join(', ')}`);
    }
    lines.push(`- **Homepage:** ${i.homepage}`);
    lines.push('');

    lines.push('## Description');
    lines.push('');
    lines.push(i.description);
    lines.push('');

    if (i.supportedHooks && i.supportedHooks.length > 0) {
      lines.push('## Supported CDS Hooks');
      lines.push('');
      for (const h of i.supportedHooks) {
        lines.push(`- \`${h}\``);
      }
      lines.push('');
    }

    if (i.snippets.length > 0) {
      lines.push('## Snippets');
      lines.push('');
      for (const s of i.snippets) {
        lines.push(`### ${s.label}`);
        lines.push('');
        lines.push('```' + s.language);
        lines.push(s.code);
        lines.push('```');
        lines.push('');
      }
    }

    if (i.links.length > 0) {
      lines.push('## Links');
      lines.push('');
      for (const l of i.links) {
        lines.push(`- [${l.label}](${l.url}) — _${l.kind}_`);
      }
      lines.push('');
    }

    if (i.notes && i.notes.length > 0) {
      lines.push('## Notes');
      lines.push('');
      for (const n of i.notes) {
        lines.push(`- ${n}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push(
      `_Generated from VedaMD integration catalogue — slug \`${i.slug}\`._`,
    );
    lines.push('');

    return lines.join('\n');
  }
}
