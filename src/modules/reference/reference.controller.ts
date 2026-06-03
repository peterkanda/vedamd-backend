import { Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReferenceService, type RefKind } from './reference.service';
import { ReferenceDoseService } from './reference-dose.service';
import { ReferenceDiagramService } from './reference-diagram.service';
import { ReferenceChatService } from './reference-chat.service';
import { DoseCalcDto, InteractionNetworkDto, ReferenceChatDto } from './reference.dto';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';

/**
 * Clinician-facing reference API. Read-only browse/search + dose
 * calculator + diagrams + guarded reference chat. These power the
 * medic/doctor reference UI — distinct from the developer agentic API.
 *
 * Gated by ApiKeyGuard + `content:read` (the same scope the per-domain
 * content endpoints use). The web app obtains a session API key
 * automatically via mintInAppSessionKey() — clinicians never paste
 * keys — but bulk scraping the catalogue by an unauthenticated caller
 * is no longer possible. The content here is licensed IP; pilot sites
 * call through their own keys, public callers cannot enumerate it.
 */
@ApiTags('reference')
@Controller('v1/reference')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class ReferenceController {
  constructor(
    private readonly reference: ReferenceService,
    private readonly dose: ReferenceDoseService,
    private readonly diagram: ReferenceDiagramService,
    private readonly chat: ReferenceChatService,
  ) {}

  @Get('summary')
  @RequireScope('content:read')
  @ApiOperation({ summary: 'Reference home — content counts + chat availability' })
  summary() {
    return { ...this.reference.summary(), chatAvailable: this.chat.available() };
  }

  @Get('index')
  @RequireScope('content:read')
  @ApiOperation({ summary: 'A–Z index across drugs, conditions + procedures (optionally filter by kind)' })
  index(@Query('kind') kind?: RefKind) {
    return { groups: this.reference.alphabetical(kind ? [kind] : undefined) };
  }

  @Get('groups/:kind/:dimension')
  @RequireScope('content:read')
  @ApiOperation({
    summary:
      'Grouped browse. drug: class|aware|keml. condition/procedure: specialty|domain (by clinical domain tags).',
  })
  groups(@Param('kind') kind: RefKind, @Param('dimension') dimension: string) {
    return { groups: this.reference.grouped(kind, dimension) };
  }

  @Get('search')
  @RequireScope('content:read')
  @ApiOperation({ summary: 'Free-text reference search across titles, slugs, classes + tags' })
  search(@Query('q') q: string, @Query('kind') kind?: RefKind) {
    return { results: this.reference.search(q ?? '', kind ? [kind] : undefined) };
  }

  @Get('diagram/condition/:slug')
  @RequireScope('content:read')
  @ApiOperation({ summary: 'Mermaid management flowchart for a condition (deterministic, from signed content)' })
  conditionDiagram(@Param('slug') slug: string) {
    const d = this.diagram.conditionFlowchart(slug);
    if (!d) throw new NotFoundException(`Unknown condition: ${slug}`);
    return d;
  }

  @Get('diagram/procedure/:slug')
  @RequireScope('content:read')
  @ApiOperation({ summary: 'Mermaid step flowchart for a procedure (safety-check gates highlighted)' })
  procedureDiagram(@Param('slug') slug: string) {
    const d = this.diagram.procedureFlowchart(slug);
    if (!d) throw new NotFoundException(`Unknown procedure: ${slug}`);
    return d;
  }

  @Post('diagram/interactions')
  @RequireScope('content:read')
  @ApiOperation({
    summary:
      'Drug-interaction NETWORK for a medication list (polypharmacy review) — Mermaid graph with severity-coded edges + a structured interaction list.',
  })
  interactionNetwork(@Body() dto: InteractionNetworkDto) {
    return this.diagram.interactionNetwork(dto.medications);
  }

  @Get('diagram/drug-interactions/:slug')
  @RequireScope('content:read')
  @ApiOperation({ summary: 'Single-drug interaction map — the drug + all its interaction partners, severity-coded' })
  drugInteractionMap(@Param('slug') slug: string) {
    const d = this.diagram.drugInteractionMap(slug);
    if (!d) throw new NotFoundException(`Unknown drug: ${slug}`);
    return d;
  }

  @Post('dose')
  @RequireScope('content:read')
  @ApiOperation({
    summary:
      'Dose calculator — weight/age/renal-based, computed from the signed bundle. Refuses + cites when inputs missing or renally contraindicated.',
  })
  doseCalc(@Body() dto: DoseCalcDto) {
    const result = this.dose.calculate(dto);
    if (!result) throw new NotFoundException(`Unknown drug: ${dto.slug}`);
    return result;
  }

  @Post('chat')
  @RequireScope('content:read')
  @ApiOperation({
    summary:
      'Guarded clinician reference chat — answers ONLY from VedaMD references, cites every claim, refuses anything not covered or non-medical. No patient data; PHI-free.',
  })
  async referenceChat(@Body() dto: ReferenceChatDto) {
    return this.chat.ask(dto.question);
  }
}
