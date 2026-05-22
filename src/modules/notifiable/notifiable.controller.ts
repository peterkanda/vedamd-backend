import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotifiableService } from './notifiable.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';

@ApiTags('notifiable-diseases')
@Controller('v1/notifiable-diseases')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class NotifiableController {
  constructor(private readonly notifiable: NotifiableService) {}

  @Get()
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'List notifiable diseases (public-health reporting reference)',
    description:
      'Open reference of WHO IHR and commonly nationally-notifiable diseases with reporting urgency. Filters: level (ihr-always|ihr-assess|national-immediate|national-routine), q. National statutory lists vary — this is guidance, not the local legal list. Returns summaries; fetch detail by slug.',
  })
  list(@Query('level') level?: string, @Query('q') q?: string) {
    return { notifiableDiseases: this.notifiable.list({ level, q }) };
  }

  @Get(':slug')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Get a notifiable-disease entry by slug',
    description:
      'Returns the disease, notification level, reporting timeframe, linked condition slug, notes and citations. Reference content only — no patient identity is processed.',
  })
  get(@Param('slug') slug: string) {
    const found = this.notifiable.get(slug);
    if (!found) throw new NotFoundException(`Unknown notifiable disease: ${slug}`);
    return found;
  }
}
