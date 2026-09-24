import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AgenticService } from './agentic.service';
import { SqlIngestionService } from './connectors/sql-ingestion.service';
import { ProviderRouter } from './providers/provider-router';
import { fhirToContext } from './fhir/fhir-adapter';
import {
  AgenticBatchDto,
  AgenticEvaluateDto,
  AgenticFhirEvaluateDto,
  AgenticSqlEvaluateDto,
} from './agentic.dto';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';
import { listPresets, type SchemaPreset } from './connectors/schema-presets';
import {
  stashClinicalAudit,
  type AuditableRequest,
  type ClinicalAuditStash,
} from '../audit/clinical-audit.types';
import type { AgenticBatchResponse, AgenticEvaluationResponse } from './agentic.types';

/**
 * Summarize an agentic evaluation for the audit ledger: what answered, on what
 * evidence, and how many cards came back. PHI-free — card summaries are rule
 * output and citations are bundle record ids.
 */
function auditStash(res: AgenticEvaluationResponse, hook?: string): ClinicalAuditStash {
  const provider = res.meta.llmProvider;
  return {
    kind: 'agentic',
    hook,
    llmInvoked: res.meta.agenticInvoked,
    // 'disabled' is a state, not a provider that answered.
    llmProvider: provider && provider !== 'disabled' ? provider : undefined,
    llmModel: res.meta.llmModel,
    llmMedical: res.meta.llmMedical,
    fellBackFrom: res.meta.llmFellBackFrom,
    cardsReturned: res.cards.length,
    cardSummaries: res.cards.map((c) => c.summary),
    citations: res.meta.citedRecords,
    refusedReason: res.meta.agenticError,
  };
}

/**
 * Agentic CDS endpoints. All require an API key with the
 * `cds:evaluate` scope — same as the CDS Hooks invoke path. The
 * agentic layer reasons over the full signed bundle and merges with
 * the deterministic safety floor.
 *
 * Endpoints:
 *   POST /api/v1/agentic/evaluate        — structured JSON context
 *   POST /api/v1/agentic/evaluate-fhir   — FHIR R4 Bundle / resource
 *   POST /api/v1/agentic/evaluate-sql    — pull from configured EHR DB
 *   GET  /api/v1/agentic/capabilities    — provider + connector status
 */
@ApiTags('agentic')
@Controller('v1/agentic')
export class AgenticController {
  private readonly nestLogger = new Logger(AgenticController.name);

  constructor(
    private readonly agentic: AgenticService,
    private readonly sql: SqlIngestionService,
    private readonly router: ProviderRouter,
  ) {}

  @Get('capabilities')
  @ApiOperation({
    summary: 'Agentic engine capabilities — LLM provider + SQL connector availability',
  })
  capabilities() {
    return {
      agenticEnabled: this.router.anyConfigured(),
      provider: this.router.advertisedProvider(),
      model: this.router.advertisedModel(),
      connectors: this.sql.availability(),
      ingestionModes: ['rest', 'fhir', 'sql', 'cds-hooks'],
      schemaPresetPlatforms: ['openmrs', 'bahmni', 'openemr', 'dhis2-tracker', 'fhir-sql'],
    };
  }

  @Get('presets')
  @ApiOperation({
    summary:
      'EHR/HMIS schema-mapper presets (OpenMRS, Bahmni, openEMR, DHIS2 Tracker, FHIR-SQL) — clone + adapt to your local schema, then register as a named query.',
  })
  presets(): { presets: SchemaPreset[] } {
    return { presets: listPresets() };
  }

  @Post('evaluate')
  @UseGuards(ApiKeyGuard)
  @RequireScope('cds:evaluate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agentic CDS evaluation from a structured JSON clinical context' })
  async evaluate(
    @Body() dto: AgenticEvaluateDto,
    @Req() req: { apiKey?: { integratorId?: string } } & AuditableRequest,
  ): Promise<AgenticEvaluationResponse> {
    try {
      const res = await this.agentic.evaluate({
        ...dto,
        integratorId: req.apiKey?.integratorId,
      });
      stashClinicalAudit(req, auditStash(res, dto.hook));
      return res;
    } catch (err) {
      throw mapConfigError(err);
    }
  }

  @Post('evaluate/stream')
  @UseGuards(ApiKeyGuard)
  @RequireScope('cds:evaluate')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Agentic CDS evaluation, streamed as it progresses (Server-Sent Events)',
    description:
      'Same input and final result as POST /evaluate, delivered as text/event-stream so a client can show verified content while the model is still working. Events: `deterministic` ({ cards } from the rule engine) and `retrieval` (counts of records found), in either order as each finishes, then last `final` (the full AgenticEvaluationResponse, after citation checks) or `error` ({ status, message }). LLM output only ever arrives in `final`. Comment lines (": ping") keep the connection open.',
  })
  async evaluateStream(
    @Body() dto: AgenticEvaluateDto,
    @Req() req: { apiKey?: { integratorId?: string } } & AuditableRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    // Headers other hooks set on the reply (CORS, security, rate limit) live
    // on `reply`, not on the raw response we write to directly.
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      ...(reply.getHeaders() as Record<string, string>),
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      // Ask proxies not to hold events back until the response ends.
      'x-accel-buffering': 'no',
    });

    // A client that goes away stops the writes, not the evaluation: it runs
    // to the end so the audit trail still records what was answered.
    let open = true;
    raw.on('close', () => {
      open = false;
    });
    const send = (event: string, data: unknown) => {
      if (open) raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const ping = setInterval(() => open && raw.write(': ping\n\n'), 15_000);

    try {
      const res = await this.agentic.evaluate(
        { ...dto, integratorId: req.apiKey?.integratorId },
        {
          onDeterministic: (cards) => send('deterministic', { cards }),
          onRetrieval: (found) => send('retrieval', found),
        },
      );
      stashClinicalAudit(req, auditStash(res, dto.hook));
      send('final', res);
    } catch (err) {
      const mapped = mapConfigError(err);
      const status = mapped instanceof HttpException ? mapped.getStatus() : 500;
      // What Nest's exception handler would log for /evaluate.
      if (status >= 500) this.nestLogger.error(err instanceof Error ? err.stack : String(err));
      // Recorded by the usage log; the client already has a 200 status line.
      raw.statusCode = status;
      send('error', {
        status,
        message: status < 500 ? (mapped as Error).message : 'The evaluation failed.',
      });
    } finally {
      clearInterval(ping);
      raw.end();
    }
  }

  @Post('evaluate-batch')
  @UseGuards(ApiKeyGuard)
  @RequireScope('cds:evaluate')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Population / retrospective safety sweep — evaluate up to 100 anonymous contexts; returns per-item results + a critical/warning/info roll-up to triage the most dangerous patients first.',
  })
  async evaluateBatch(@Body() dto: AgenticBatchDto): Promise<AgenticBatchResponse> {
    return this.agentic.evaluateBatch(dto.items);
  }

  @Post('evaluate-fhir')
  @UseGuards(ApiKeyGuard)
  @RequireScope('cds:evaluate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agentic CDS evaluation from a FHIR R4 Bundle or resource' })
  async evaluateFhir(
    @Body() dto: AgenticFhirEvaluateDto,
    @Req() req: { apiKey?: { integratorId?: string } } & AuditableRequest,
  ): Promise<AgenticEvaluationResponse> {
    const ctx = fhirToContext(dto.resource, dto.hook, dto.question);
    ctx.mode = dto.mode;
    ctx.minConfidence = dto.minConfidence;
    ctx.conversation = dto.conversation;
    ctx.integratorId = req.apiKey?.integratorId;
    try {
      const res = await this.agentic.evaluate(ctx);
      stashClinicalAudit(req, auditStash(res, dto.hook));
      return res;
    } catch (err) {
      throw mapConfigError(err);
    }
  }

  @Post('evaluate-sql')
  @UseGuards(ApiKeyGuard)
  @RequireScope('cds:evaluate')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Agentic CDS evaluation pulling patient data from a configured EHR database',
  })
  async evaluateSql(
    @Body() dto: AgenticSqlEvaluateDto,
    @Req() req: { apiKey?: { integratorId?: string } } & AuditableRequest,
  ): Promise<AgenticEvaluationResponse> {
    let ctx;
    try {
      ctx = await this.sql.buildContext(
        dto.connectionId,
        dto.queryId,
        dto.params ?? {},
        dto.hook,
        dto.question,
        // Enforce per-tenant ownership: a caller can only use its own
        // registered connection/query, never another integrator's.
        req.apiKey?.integratorId,
      );
      ctx.mode = dto.mode;
      ctx.minConfidence = dto.minConfidence;
      ctx.integratorId = req.apiKey?.integratorId;
    } catch (err) {
      // Configuration / query errors are the caller's to fix — return 400
      // with the specific reason (never leaks row data; messages are
      // about ids + drivers only).
      throw new BadRequestException(err instanceof Error ? err.message : 'SQL ingestion failed.');
    }
    try {
      const res = await this.agentic.evaluate(ctx);
      stashClinicalAudit(req, auditStash(res, dto.hook));
      return res;
    } catch (err) {
      throw mapConfigError(err);
    }
  }
}

/**
 * Map caller-fixable configuration errors (e.g. mode='agentic' with no
 * provider) to a 400 with the actionable message; re-throw everything
 * else so genuine 500s surface.
 */
function mapConfigError(err: unknown): unknown {
  if (err instanceof Error && /requires an LLM provider/i.test(err.message)) {
    return new BadRequestException(err.message);
  }
  return err;
}
