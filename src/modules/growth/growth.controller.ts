import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GrowthService } from './growth.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';

const INDICATORS = ['wfa', 'lhfa', 'hfa', 'wfl', 'wfh', 'bfa'];

@ApiTags('growth')
@Controller('v1/growth')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class GrowthController {
  constructor(private readonly growth: GrowthService) {}

  @Get('standards')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'List the growth standards currently loaded',
    description:
      'Which WHO/CDC LMS tables are available to score against. Empty until `npm run growth:ingest` has been run; the tables are a draft lane outside the signed bundle.',
  })
  standards() {
    return { standards: this.growth.available() };
  }

  @Get('z-score')
  @RequireScope('content:read')
  @ApiOperation({
    summary: 'Score a growth measurement against the WHO standards',
    description:
      'Computes a z-score, percentile and WHO classification from LMS parameters. `x` is age in MONTHS, except for the weight-for-length/height standards where it is length/height in CM. Anthropometry only: no patient identity is accepted or stored. Returns `unavailable` with a reason rather than a number when the standard is missing or does not cover the child.',
  })
  zScore(
    @Query('indicator') indicator?: string,
    @Query('sex') sex?: string,
    @Query('x') x?: string,
    @Query('value') value?: string,
  ) {
    const ind = (indicator ?? '').toLowerCase();
    if (!INDICATORS.includes(ind)) {
      throw new BadRequestException(`indicator must be one of: ${INDICATORS.join(', ')}`);
    }
    const s = (sex ?? '').toLowerCase();
    if (s !== 'male' && s !== 'female') {
      throw new BadRequestException('sex must be male or female');
    }
    const xNum = Number(x);
    const valueNum = Number(value);
    if (!Number.isFinite(xNum) || xNum < 0) {
      throw new BadRequestException('x must be a non-negative number (age in months, or cm)');
    }
    // A zero or negative measurement is a data-entry error, not a z-score.
    if (!Number.isFinite(valueNum) || valueNum <= 0) {
      throw new BadRequestException('value must be a positive number');
    }
    return this.growth.score(ind, s, xNum, valueNum);
  }
}
