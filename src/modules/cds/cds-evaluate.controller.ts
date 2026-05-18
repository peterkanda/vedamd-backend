import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CdsService } from './cds.service';

@ApiTags('cds')
@Controller('v1/cds')
export class CdsEvaluateController {
  constructor(private readonly cds: CdsService) {}

  @Post('evaluate')
  @ApiOperation({
    summary: 'Non-CDS-Hooks evaluation endpoint',
    description:
      'Accepts a structured patient context and returns recommendations. See FR-007.',
  })
  evaluate(@Body() payload: unknown) {
    return this.cds.evaluateGeneric(payload);
  }
}
