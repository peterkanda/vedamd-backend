import type { Citation } from '../../common/citation';
import { Injectable } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';

/**
 * Deterministic diagram generation for the reference UI.
 *
 * Builds Mermaid diagram source DIRECTLY from the structured signed
 * content (no LLM, no hallucination). The UI renders the Mermaid
 * client-side. Two diagram types:
 *   - condition management flowchart (steps + red-flag escalation)
 *   - procedure step flowchart (sequential steps + safety-check gates)
 *
 * Because the source is the signed bundle, every node is traceable +
 * factual. Returns Mermaid text + the cited references.
 */

export interface DiagramResult {
  kind: 'condition' | 'procedure';
  slug: string;
  title: string;
  format: 'mermaid';
  diagram: string;
  references: Citation[];
}

@Injectable()
export class ReferenceDiagramService {
  constructor(private readonly knowledge: KnowledgeService) {}

  conditionFlowchart(slug: string): DiagramResult | null {
    const c = this.knowledge.getConditions().find((x) => x.slug === slug) as
      | {
          slug: string;
          title: string;
          redFlags?: string[];
          management?: Array<{ step: string; detail: string }>;
          references?: { label: string; url?: string }[];
        }
      | undefined;
    if (!c) return null;

    const lines: string[] = ['flowchart TD'];
    lines.push(`  start([${q(c.title)}])`);

    // Red-flag escalation branch first (safety-forward).
    if (c.redFlags?.length) {
      lines.push(`  rf{Any red flag?}`);
      lines.push(`  start --> rf`);
      const rfText = c.redFlags.slice(0, 6).map((r) => '• ' + r).join('<br/>');
      lines.push(`  rfyes[["⚠ ESCALATE / URGENT<br/>${q(rfText)}"]]`);
      lines.push(`  rf -- yes --> rfyes`);
      lines.push(`  rf -- no --> m0`);
    } else {
      lines.push(`  start --> m0`);
    }

    const steps = c.management ?? [];
    if (steps.length === 0) {
      lines.push(`  m0[No structured management steps]`);
    } else {
      steps.forEach((s, i) => {
        const id = `m${i}`;
        lines.push(`  ${id}["${i + 1}. ${q(s.step)}<br/><small>${q(trunc(s.detail, 140))}</small>"]`);
        if (i > 0) lines.push(`  m${i - 1} --> ${id}`);
      });
      lines.push(`  m${steps.length - 1} --> done([Reassess / follow-up])`);
    }

    return {
      kind: 'condition',
      slug: c.slug,
      title: c.title,
      format: 'mermaid',
      diagram: lines.join('\n'),
      references: c.references ?? [],
    };
  }

  /**
   * Drug-interaction NETWORK for a list of medications (polypharmacy
   * review). Nodes = the supplied drugs; edges = every known pairwise
   * interaction among them, styled + labelled by severity. Built from
   * the signed drug-interactions content — deterministic + traceable.
   * Returns the Mermaid graph + a structured edge list the UI can also
   * render as a table, + the count of interactions found.
   */
  interactionNetwork(slugs: string[]): {
    format: 'mermaid';
    diagram: string;
    drugs: string[];
    interactions: Array<{ a: string; b: string; severity: string; mechanism: string; management: string }>;
    severeCount: number;
  } {
    const norm = [...new Set(slugs.map((s) => s.toLowerCase().trim()).filter(Boolean))];
    const known = this.knowledge.getDrugs();
    const innOf = (slug: string) => known.find((d) => d.slug === slug)?.inn ?? slug;

    const all = this.knowledge.getInteractions() as Array<{
      slugA: string; slugB: string; severity: string; mechanism: string; management: string;
    }>;
    const edges = all.filter((i) => norm.includes(i.slugA) && norm.includes(i.slugB));

    const lines: string[] = ['graph TD'];
    // Declare nodes (use the INN as label).
    norm.forEach((slug, i) => {
      lines.push(`  n${i}["${q(titleCase(innOf(slug)))}"]`);
    });
    // Edges with severity label + class for styling.
    const idx = (slug: string) => `n${norm.indexOf(slug)}`;
    edges.forEach((e, i) => {
      const sev = e.severity.toUpperCase();
      lines.push(`  ${idx(e.slugA)} -- "${sev}" --> ${idx(e.slugB)}`);
      lines.push(`  linkStyle ${i} stroke:${severityColour(e.severity)},stroke-width:${severityWidth(e.severity)}px`);
    });
    if (edges.length === 0) {
      lines.push('  note[No known interactions among these drugs in VedaMD]');
    }

    return {
      format: 'mermaid',
      diagram: lines.join('\n'),
      drugs: norm,
      interactions: edges.map((e) => ({
        a: e.slugA, b: e.slugB, severity: e.severity, mechanism: e.mechanism, management: e.management,
      })),
      severeCount: edges.filter((e) => e.severity === 'severe' || e.severity === 'major').length,
    };
  }

  /**
   * Single-drug interaction map — the drug at the centre with every
   * interaction partner radiating out, styled by severity. Useful when
   * a clinician is about to add one drug + wants to see everything it
   * interacts with.
   */
  drugInteractionMap(slug: string): {
    format: 'mermaid';
    diagram: string;
    drug: string;
    partners: Array<{ slug: string; severity: string }>;
  } | null {
    const known = this.knowledge.getDrugs();
    const drug = known.find((d) => d.slug === slug);
    if (!drug) return null;
    const innOf = (s: string) => known.find((d) => d.slug === s)?.inn ?? s;

    const all = this.knowledge.getInteractions() as Array<{
      slugA: string; slugB: string; severity: string;
    }>;
    const partners = all
      .filter((i) => i.slugA === slug || i.slugB === slug)
      .map((i) => ({ slug: i.slugA === slug ? i.slugB : i.slugA, severity: i.severity }));

    const lines: string[] = ['graph LR', `  c(["${q(titleCase(drug.inn))}"])`];
    partners.forEach((p, i) => {
      lines.push(`  p${i}["${q(titleCase(innOf(p.slug)))}"]`);
      lines.push(`  c -- "${p.severity.toUpperCase()}" --> p${i}`);
      lines.push(`  linkStyle ${i} stroke:${severityColour(p.severity)},stroke-width:${severityWidth(p.severity)}px`);
    });
    if (partners.length === 0) lines.push('  none[No interactions recorded in VedaMD]');

    return { format: 'mermaid', diagram: lines.join('\n'), drug: drug.inn, partners };
  }

  procedureFlowchart(slug: string): DiagramResult | null {
    const p = this.knowledge.getProcedures().find((x) => x.slug === slug) as
      | {
          slug: string;
          title: string;
          steps?: Array<{ step: string; detail: string; safetyCheck?: boolean }>;
          redFlags?: string[];
          references?: { label: string; url?: string }[];
        }
      | undefined;
    if (!p) return null;

    const lines: string[] = ['flowchart TD'];
    lines.push(`  start([${q(p.title)}])`);
    const steps = p.steps ?? [];
    steps.forEach((s, i) => {
      const id = `s${i}`;
      // Safety-check steps render as decision gates to emphasise the stop point.
      if (s.safetyCheck) {
        lines.push(`  ${id}{{"🛑 SAFETY CHECK<br/>${q(s.step)}<br/><small>${q(trunc(s.detail, 120))}</small>"}}`);
      } else {
        lines.push(`  ${id}["${i + 1}. ${q(s.step)}<br/><small>${q(trunc(s.detail, 120))}</small>"]`);
      }
      if (i === 0) lines.push(`  start --> ${id}`);
      else lines.push(`  s${i - 1} --> ${id}`);
    });
    if (steps.length) lines.push(`  s${steps.length - 1} --> done([Post-procedure care])`);

    return {
      kind: 'procedure',
      slug: p.slug,
      title: p.title,
      format: 'mermaid',
      diagram: lines.join('\n'),
      references: p.references ?? [],
    };
  }
}

/** Sanitise text for Mermaid node labels (quotes/newlines/brackets break parsing). */
function q(s: string): string {
  return String(s)
    .replace(/"/g, "'")
    .replace(/[\[\]{}()|]/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
}

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function titleCase(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Mermaid edge colour by interaction severity (UI legend: red→amber→grey). */
function severityColour(sev: string): string {
  switch (sev) {
    case 'severe': return '#b00020';
    case 'major': return '#d32f2f';
    case 'moderate': return '#f57c00';
    default: return '#9e9e9e';
  }
}

function severityWidth(sev: string): number {
  switch (sev) {
    case 'severe': return 4;
    case 'major': return 3;
    case 'moderate': return 2;
    default: return 1;
  }
}
