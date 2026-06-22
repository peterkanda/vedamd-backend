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
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { DrugsService } from './drugs.service';
import type { AwareCategory } from './drugs.types';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';
import { ImmutableContent } from '../../common/http-cache';

class InteractionsRequestDto {
  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  slugs!: string[];
}

class SafetyReviewRequestDto extends InteractionsRequestDto {
  /** Optional estimated creatinine clearance (mL/min) to drive renal flags. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(200)
  crClMlMin?: number;

  /** Optional patient weight (kg) to drive paediatric weight-based dosing. */
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(300)
  weightKg?: number;

  /** Optional patient condition slugs to drive drug-disease contraindication flags. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  conditions?: string[];
}

class DosingRequestDto {
  @IsNumber()
  @Min(0.5)
  @Max(300)
  weightKg!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(120)
  ageYears?: number;

  @IsOptional()
  @IsString()
  indication?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(200)
  crClMlMin?: number;

  @IsOptional()
  @IsString()
  route?: string;
}

@ApiTags('drugs')
@Controller('v1/drugs')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
@ImmutableContent()
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

  @Post('safety-review')
  @RequireScope('drug-info:read')
  @ApiOperation({
    summary: 'Holistic medication safety review for a med list',
    description:
      'Body: { slugs: [...], crClMlMin?, weightKg?, conditions? }. One point-of-care panel: ' +
      'pairwise drug-drug interactions, antimicrobial-stewardship flags (WHO AWaRe ' +
      'Watch/Reserve), duplicate-therapy (same drug class), pregnancy-contraindicated ' +
      'drugs, hepatic guidance, and — when crClMlMin is supplied — renal dose-adjustment / ' +
      'contraindication flags, when a paediatric weightKg is supplied — weight-based ' +
      'dosing with overdose-cap warnings, and when condition slugs are supplied — ' +
      'drug-disease contraindication / caution flags. Returns unresolved slugs and a ' +
      'severity summary. Deterministic; no LLM.',
  })
  safetyReview(@Body() body: SafetyReviewRequestDto) {
    return this.drugs.safetyReview(body.slugs, body.crClMlMin, body.weightKg, body.conditions);
  }

  @Post(':slug/dosing')
  @RequireScope('drug-info:read')
  @ApiOperation({
    summary: 'Calculate a dose for the drug given weight / age / renal function',
    description:
      'Deterministic algorithm over the structured drug record. Refuses to return a mg dose for individualised regimens (e.g. warfarin) or when CrCl falls in a contraindicated band. Always returns a narrative.',
  })
  dosing(@Param('slug') slug: string, @Body() body: DosingRequestDto) {
    const result = this.drugs.calculateDose(slug, body);
    if (!result) throw new NotFoundException(`Unknown drug: ${slug}`);
    return result;
  }
}
