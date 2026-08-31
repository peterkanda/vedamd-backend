import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClinicalToolsService } from './clinical-tools.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';

@ApiTags('clinical-tools')
@Controller('v1/clinical-tools')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class ClinicalToolsController {
  constructor(private readonly tools: ClinicalToolsService) {}

  @Get()
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Bedside-calculator reference data — dose drugs + vitals + scoring systems',
    description:
      'Single payload powering the /app/tools calculators. Returns paediatric mg/kg dose drugs (paracetamol, ibuprofen, amoxicillin, ceftriaxone, salbutamol, prednisolone, zinc, ORS, cotrimoxazole), the IMCI/APLS vital-sign reference table, and validated scoring systems (NEWS2, qSOFA, Wells PE, CHA₂DS₂-VASc). Calculator math runs client-side; this endpoint ships only the normative reference data.',
  })
  all() {
    return this.tools.all();
  }

  @Get('scoring/:id')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Get one scoring system by id',
    description:
      'Sub-resource — returns just the axes + citation for the requested scoring system (news2, qsofa, wells-pe, cha2ds2-vasc).',
  })
  scoring(@Param('id') id: string) {
    const found = this.tools.scoringSystem(id);
    if (!found) throw new NotFoundException(`Unknown scoring system: ${id}`);
    return found;
  }
}
