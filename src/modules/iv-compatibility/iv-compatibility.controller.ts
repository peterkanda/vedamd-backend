import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IvCompatibilityService } from './iv-compatibility.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';
import { ImmutableContent } from '../../common/http-cache';

@ApiTags('iv-compatibility')
@Controller('v1/iv-compatibility')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
@ImmutableContent()
export class IvCompatibilityController {
  constructor(private readonly compat: IvCompatibilityService) {}

  @Get()
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'List curated IV compatibility pairs (Y-site / additive / syringe)',
    description:
      'Curated subset of inpatient IV co-administration pairs — high-mortality / high-volume scenarios from King Guide, ASHP, FDA labelling. Includes the documented-deaths cases (ceftriaxone + calcium in neonates), common ICU mistakes (vasopressor + bicarbonate, vancomycin + pip-tazo) and the permissive defaults (norepinephrine Y-site, dexmedetomidine, metronidazole). Filters: q (free text), drug (name or slug), status (compatible|conditional|incompatible|no-data).',
  })
  list(@Query('q') q?: string, @Query('drug') drug?: string, @Query('status') status?: string) {
    return { pairs: this.compat.list({ q, drug, status }) };
  }

  @Get(':slug')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Get an IV compatibility pair by slug',
    description:
      'Returns the full pair: compatibility status, applicable routes (y-site / additive / syringe), concentration / diluent / time notes, practical alternative when incompatible, and citations. Reference content only — no patient identity is processed.',
  })
  get(@Param('slug') slug: string) {
    const found = this.compat.get(slug);
    if (!found) throw new NotFoundException(`Unknown IV compatibility pair: ${slug}`);
    return found;
  }
}
