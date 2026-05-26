import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DoseProtocolsService } from './dose-protocols.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';

@ApiTags('dose-protocols')
@Controller('v1/dose-protocols')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class DoseProtocolsController {
  constructor(private readonly service: DoseProtocolsService) {}

  @Get()
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'List weight-based dose protocols',
    description:
      'Curated mg/kg starting points indexed by (diagnosis, treatment line, medication). Filter by `q` (free-text across diagnosis / line / medication / preparation / remarks) and/or `diagnosis` (exact or substring match). Returns the matching protocol rows plus a sorted unique-diagnosis list for navigation.',
  })
  list(@Query('q') q?: string, @Query('diagnosis') diagnosis?: string) {
    return this.service.list({ q, diagnosis });
  }

  @Get('diagnoses')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Sorted alphabetical list of unique dose-protocol diagnoses',
    description:
      'Lightweight diagnosis index — used by Catalogue / Dose calculator when the full protocol bodies are not needed.',
  })
  diagnoses() {
    return { diagnoses: this.service.diagnoses() };
  }
}
