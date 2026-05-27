import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { OperatorAuthGuard } from '../../common/operator-auth';
import { DataSourcesService } from './data-sources.service';
import type {
  ConnectionCreateDto,
  ConnectionUpdateDto,
  NamedQueryCreateDto,
  NamedQueryUpdateDto,
} from './data-sources.types';

type OperatorRequest = FastifyRequest & {
  operator?: { integratorId: string; userId?: string };
};

@ApiTags('data-sources')
@Controller('v1/data-sources')
@UseGuards(OperatorAuthGuard)
@ApiBearerAuth()
export class DataSourcesController {
  constructor(private readonly svc: DataSourcesService) {}

  /* ── Connections ───────────────────────────────────────────────── */

  @Get('connections')
  @ApiOperation({
    summary: 'List SQL connections for the calling integrator',
    description:
      'Returns metadata only — connection URLs are AEAD-encrypted server-side and never returned over the API.',
  })
  listConnections(@Req() req: OperatorRequest) {
    return { connections: this.svc.listConnections(req.operator!.integratorId) };
  }

  @Get('connections/:id')
  async getConnection(@Param('id') id: string, @Req() req: OperatorRequest) {
    const found = await this.svc.getConnection(req.operator!.integratorId, id);
    if (!found) throw new BadRequestException(`Connection not found: ${id}`);
    return found;
  }

  @Post('connections')
  @ApiOperation({
    summary: 'Register a SQL connection',
    description:
      'Connection URLs are encrypted on receipt with the integratorId as AAD; the raw value never reaches the database or any application log. The connection is also pushed into the runtime ingestion registry immediately so audits + agentic flows can use it without an app restart.',
  })
  createConnection(@Body() dto: ConnectionCreateDto, @Req() req: OperatorRequest) {
    if (!dto.id || !dto.name || !dto.dialect || !dto.url) {
      throw new BadRequestException('id, name, dialect, and url are required.');
    }
    return this.svc.createConnection(req.operator!.integratorId, dto, req.operator!.userId);
  }

  @Patch('connections/:id')
  @ApiOperation({
    summary: 'Update a connection (rotate URL by submitting `url`)',
  })
  updateConnection(
    @Param('id') id: string,
    @Body() dto: ConnectionUpdateDto,
    @Req() req: OperatorRequest,
  ) {
    return this.svc.updateConnection(req.operator!.integratorId, id, dto);
  }

  @Delete('connections/:id')
  async removeConnection(@Param('id') id: string, @Req() req: OperatorRequest) {
    const ok = await this.svc.removeConnection(req.operator!.integratorId, id);
    if (!ok) throw new BadRequestException(`Connection not found: ${id}`);
    return { deleted: true };
  }

  @Post('connections/:id/test')
  @ApiOperation({
    summary: 'Test the connection (issues a SELECT 1 round trip)',
  })
  testConnection(@Param('id') id: string, @Req() req: OperatorRequest) {
    return this.svc.testConnection(req.operator!.integratorId, id);
  }

  /* ── Named queries ─────────────────────────────────────────────── */

  @Get('queries')
  @ApiOperation({ summary: 'List named queries for the calling integrator' })
  listQueries(@Req() req: OperatorRequest) {
    return { queries: this.svc.listQueries(req.operator!.integratorId) };
  }

  @Get('queries/:id')
  async getQuery(@Param('id') id: string, @Req() req: OperatorRequest) {
    const found = await this.svc.getQuery(req.operator!.integratorId, id);
    if (!found) throw new BadRequestException(`Named query not found: ${id}`);
    return found;
  }

  @Post('queries')
  @ApiOperation({
    summary: 'Register a named query',
    description:
      'SQL is validated read-only at submission (rejects INSERT/UPDATE/DELETE/DDL + stacked statements). The mapping is a declarative description of how the result columns map to AgenticClinicalContext (medications, diagnoses, allergies, labs).',
  })
  createQuery(@Body() dto: NamedQueryCreateDto, @Req() req: OperatorRequest) {
    if (!dto.id || !dto.name || !dto.sql) {
      throw new BadRequestException('id, name, and sql are required.');
    }
    return this.svc.createQuery(req.operator!.integratorId, dto, req.operator!.userId);
  }

  @Patch('queries/:id')
  updateQuery(
    @Param('id') id: string,
    @Body() dto: NamedQueryUpdateDto,
    @Req() req: OperatorRequest,
  ) {
    return this.svc.updateQuery(req.operator!.integratorId, id, dto);
  }

  @Delete('queries/:id')
  async removeQuery(@Param('id') id: string, @Req() req: OperatorRequest) {
    const ok = await this.svc.removeQuery(req.operator!.integratorId, id);
    if (!ok) throw new BadRequestException(`Named query not found: ${id}`);
    return { deleted: true };
  }
}
