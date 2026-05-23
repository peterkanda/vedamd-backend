import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OperatorAuthGuard } from '../../common/operator-auth';
import { PoliciesService } from './policies.service';
import type { PolicyCreateDto } from './policies.types';

interface OperatorRequest {
  operator?: { integratorId: string; userId?: string };
}

/**
 * Per-integrator policy / standards management. Uses the operator JWT
 * (same auth as API-key management). Never accepts patient data.
 */
@ApiTags('policies')
@Controller('v1/policies')
@UseGuards(OperatorAuthGuard)
@ApiBearerAuth()
export class PoliciesController {
  constructor(private readonly policies: PoliciesService) {}

  @Get()
  @ApiOperation({
    summary: 'List uploaded policies / standards for the current integrator',
    description:
      'Returns summaries (no full body). Each policy is a clinical SOP or external standard (JCI, ISO, WHO, NICE, company). Policies are integrator-scoped and used by the agentic engine to align recommendations.',
  })
  list(@Req() req: OperatorRequest) {
    return { policies: this.policies.list(req.operator!.integratorId) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single policy with its sections' })
  get(@Req() req: OperatorRequest, @Param('id') id: string) {
    const found = this.policies.get(req.operator!.integratorId, id);
    if (!found) throw new NotFoundException(`Unknown policy: ${id}`);
    return found;
  }

  @Post()
  @ApiOperation({
    summary: 'Upload a policy / standard (JSON body)',
    description:
      'Accepts either an array of structured `sections` ({title?, body}) or a single `text` body. Source identifies the standard family (JCI, ISO, WHO, NICE, company, other).',
  })
  create(@Req() req: OperatorRequest, @Body() dto: PolicyCreateDto) {
    if (!dto?.name?.trim()) throw new BadRequestException('name is required');
    if (!dto?.source?.trim()) throw new BadRequestException('source is required');
    if ((!dto.sections || !dto.sections.length) && !dto.text?.trim()) {
      throw new BadRequestException('Provide either `sections` or `text`');
    }
    return this.policies.create(req.operator!.integratorId, dto, req.operator!.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a policy by id' })
  remove(@Req() req: OperatorRequest, @Param('id') id: string) {
    const ok = this.policies.remove(req.operator!.integratorId, id);
    if (!ok) throw new NotFoundException(`Unknown policy: ${id}`);
    return { ok: true };
  }
}
