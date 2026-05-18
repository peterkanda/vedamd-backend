import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';
import { DrugsService } from './drugs.service';
import type { AwareCategory } from './drugs.types';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';

class InteractionsRequestDto {
  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  slugs!: string[];
}

@ApiTags('drugs')
@Controller('v1/drugs')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class DrugsController {
  constructor(private readonly drugs: DrugsService) {}

  @Get()
  @RequireScope('drug-info:read')
  @ApiOperation({
    summary: 'List or search drugs',
    description:
      'Filters: q (free text over slug/INN/class/trade/RxNorm/ATC), atc (exact ATC), aware (Access|Watch|Reserve), kemlOnly=true.',
  })
  list(
    @Query('q') q?: string,
    @Query('atc') atc?: string,
    @Query('aware') aware?: AwareCategory,
    @Query('kemlOnly') kemlOnly?: string,
  ) {
    if (aware && !['Access', 'Watch', 'Reserve', 'Not-classified'].includes(aware)) {
      throw new BadRequestException('aware must be one of Access|Watch|Reserve|Not-classified.');
    }
    return {
      drugs: this.drugs.list({
        q,
        atc,
        aware,
        kemlOnly: kemlOnly === 'true',
      }),
    };
  }

  @Get(':slug')
  @RequireScope('drug-info:read')
  @ApiOperation({ summary: 'Get a full drug record by slug' })
  get(@Param('slug') slug: string) {
    const found = this.drugs.get(slug);
    if (!found) throw new NotFoundException(`Unknown drug: ${slug}`);
    return found;
  }

  @Post('interactions')
  @RequireScope('drug-info:read')
  @ApiOperation({
    summary: 'Check pairwise drug-drug interactions',
    description:
      'Body: { slugs: ["paracetamol","warfarin", …] }. Returns every known interaction across the unordered pairs, plus any slugs that did not resolve to a known drug.',
  })
  interactions(@Body() body: InteractionsRequestDto) {
    return this.drugs.checkInteractions(body.slugs);
  }
}
