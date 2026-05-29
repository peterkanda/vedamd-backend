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
import { OperatorOrApiKeyGuard } from '../../common/operator-auth';
import { RequireScope } from '../../common/api-key-auth';
import { ClinicalAuditsService } from './clinical-audits.service';
import type { AuditCreateDto, AuditUpdateDto } from './clinical-audits.types';

type OperatorRequest = FastifyRequest & {
  operator?: { integratorId: string; userId?: string };
};

@ApiTags('clinical-audits')
@Controller('v1/clinical-audits')
@UseGuards(OperatorOrApiKeyGuard)
@RequireScope('clinical-audit:run')
@ApiBearerAuth()
export class ClinicalAuditsController {
  constructor(private readonly svc: ClinicalAuditsService) {}

  @Get()
  @ApiOperation({ summary: 'List clinical audits for the calling integrator' })
  list(@Req() req: OperatorRequest) {
    return { audits: this.svc.list(req.operator!.integratorId) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single audit definition by id' })
  async get(@Param('id') id: string, @Req() req: OperatorRequest) {
    const found = await this.svc.get(req.operator!.integratorId, id);
    if (!found) throw new BadRequestException(`Audit not found: ${id}`);
    return found;
  }

  @Post()
  @ApiOperation({
    summary: 'Create a clinical audit',
    description:
      'Binds a named query (connectionId + namedQueryId) to a set of custom-rule IDs, optional policy IDs to cite, a threshold (absolute count or percentage), and the notification-channel IDs to dispatch on breach.',
  })
  async create(@Body() dto: AuditCreateDto, @Req() req: OperatorRequest) {
    if (!dto.name || !dto.connectionId || !dto.namedQueryId || !dto.threshold) {
      throw new BadRequestException(
        'name, connectionId, namedQueryId, and threshold are required.',
      );
    }
    return this.svc.create(req.operator!.integratorId, dto, req.operator!.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update audit name / rules / policies / threshold / channels' })
  async update(
    @Param('id') id: string,
    @Body() dto: AuditUpdateDto,
    @Req() req: OperatorRequest,
  ) {
    return this.svc.update(req.operator!.integratorId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an audit' })
  async remove(@Param('id') id: string, @Req() req: OperatorRequest) {
    const ok = await this.svc.remove(req.operator!.integratorId, id);
    if (!ok) throw new BadRequestException(`Audit not found: ${id}`);
    return { deleted: true };
  }

  @Post(':id/run')
  @ApiOperation({
    summary: 'Run an audit on demand',
    description:
      'Executes the configured named query against the integrator-registered connection, evaluates each row against the configured custom rules, cites uploaded policies, computes threshold breach, and dispatches alerts via configured channels when the threshold trips. Returns full structured result (row-level verdicts use anonymous row indices — never patient identifiers).',
  })
  async run(@Param('id') id: string, @Req() req: OperatorRequest) {
    return this.svc.runAudit(req.operator!.integratorId, id);
  }
}
