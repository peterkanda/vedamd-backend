import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
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
import type { AgenticBatchResponse, AgenticEvaluationResponse } from './agentic.types';

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
      provider: process.env.AGENTIC_PROVIDER ?? 'anthropic',
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
    @Req() req: { apiKey?: { integratorId?: string } },
  ): Promise<AgenticEvaluationResponse> {
    try {
      return await this.agentic.evaluate({ ...dto, integratorId: req.apiKey?.integratorId });
    } catch (err) {
      throw mapConfigError(err);
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
    @Req() req: { apiKey?: { integratorId?: string } },
  ): Promise<AgenticEvaluationResponse> {
    const ctx = fhirToContext(dto.resource, dto.hook, dto.question);
    ctx.mode = dto.mode;
    ctx.minConfidence = dto.minConfidence;
    ctx.integratorId = req.apiKey?.integratorId;
    try {
      return await this.agentic.evaluate(ctx);
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
    @Req() req: { apiKey?: { integratorId?: string } },
  ): Promise<AgenticEvaluationResponse> {
    let ctx;
    try {
      ctx = await this.sql.buildContext(
        dto.connectionId,
        dto.queryId,
        dto.params ?? {},
        dto.hook,
        dto.question,
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
      return await this.agentic.evaluate(ctx);
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
