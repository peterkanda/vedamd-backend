import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CdsService } from './cds.service';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';

@ApiTags('cds')
@Controller('v1/cds')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class CdsEvaluateController {
  constructor(private readonly cds: CdsService) {}

  @Post('evaluate')
  @RequireScope('cds:evaluate')
  @ApiOperation({
    summary: 'Non-CDS-Hooks evaluation endpoint',
    description:
      'Accepts a structured patient context and returns recommendations. See FR-007. Requires the cds:evaluate scope.',
  })
  evaluate(@Body() payload: unknown) {
    return this.cds.evaluateGeneric(payload);
  }
}
