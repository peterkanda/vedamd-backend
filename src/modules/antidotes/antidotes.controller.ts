import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AntidotesService } from './antidotes.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';

@ApiTags('antidotes')
@Controller('v1/antidotes')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class AntidotesController {
  constructor(private readonly antidotes: AntidotesService) {}

  @Get()
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'List toxicology antidotes (poison -> antidote)',
    description:
      'Open antidote reference (paracetamol->NAC, opioid->naloxone, organophosphate->atropine/pralidoxime, iron->desferrioxamine, digoxin->Fab, methanol->fomepizole, beta-blocker->glucagon, CCB->calcium, LAST->lipid emulsion, cyanide->hydroxocobalamin, etc.). Filters: poison, antidote (name or drug slug), q. Returns summaries; fetch mechanism and dosing by slug.',
  })
  list(
    @Query('poison') poison?: string,
    @Query('antidote') antidote?: string,
    @Query('q') q?: string,
  ) {
    return { antidotes: this.antidotes.list({ poison, antidote, q }) };
  }

  @Get(':slug')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Get an antidote entry by slug',
    description:
      'Returns the poison, antidote (with drug slug), mechanism, dosing guidance, linked poisoning condition and citations. Reference content only — no patient identity is processed.',
  })
  get(@Param('slug') slug: string) {
    const found = this.antidotes.get(slug);
    if (!found) throw new NotFoundException(`Unknown antidote entry: ${slug}`);
    return found;
  }
}
