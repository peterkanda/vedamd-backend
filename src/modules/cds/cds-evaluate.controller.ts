import { Body, Controller, Post, UseGuards, NotImplementedException } from '@nestjs/common';
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
    summary: 'Non-CDS-Hooks evaluation endpoint (not implemented)',
    description:
      'Not implemented: returns 501. Use the CDS Hooks services (POST /cds-services/{id}) or POST /api/v1/agentic/evaluate. Requires the cds:evaluate scope.',
  })
  evaluate(@Body() _payload: unknown) {
    // This used to answer every request with an empty list and a 200 —
    // indistinguishable from "evaluated, nothing to flag". Say it plainly.
    throw new NotImplementedException(
      'POST /v1/cds/evaluate is not implemented. Use the CDS Hooks services (POST /cds-services/{id}) or POST /api/v1/agentic/evaluate.',
    );
  }
}
