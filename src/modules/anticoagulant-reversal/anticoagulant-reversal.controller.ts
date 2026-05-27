import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnticoagulantReversalService } from './anticoagulant-reversal.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';

@ApiTags('anticoagulant-reversal')
@Controller('v1/anticoagulant-reversal')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class AnticoagulantReversalController {
  constructor(private readonly reversal: AnticoagulantReversalService) {}

  @Get()
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'List anticoagulant reversal protocols',
    description:
      'Reversal reference for warfarin, DOACs (apixaban, rivaroxaban, edoxaban, dabigatran), unfractionated heparin, LMWH, fondaparinux, and fibrinolytics (alteplase/tPA). Each record covers life-threatening bleed, urgent surgery, major bleed and supratherapeutic-no-bleed scenarios. Filters: q, drugClass.',
  })
  list(@Query('q') q?: string, @Query('drugClass') drugClass?: string) {
    return { reversals: this.reversal.list({ q, drugClass }) };
  }

  @Get(':slug')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Get an anticoagulant reversal protocol by slug',
    description:
      'Returns the full reversal plan: mechanism, urgency-ordered protocols (agent, dose, adjuncts, monitoring, cautions), pitfalls, and citations. Reference content only — no patient identity is processed.',
  })
  get(@Param('slug') slug: string) {
    const found = this.reversal.get(slug);
    if (!found) throw new NotFoundException(`Unknown anticoagulant-reversal protocol: ${slug}`);
    return found;
  }
}
