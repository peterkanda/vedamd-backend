import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CdsService } from './cds.service';
import type { CdsHookRequest, CdsHookResponse, CdsServicesResponse } from './cds.types';

@ApiTags('cds-hooks')
@Controller('cds-services')
export class CdsHooksController {
  constructor(private readonly cds: CdsService) {}

  @Get()
  @ApiOperation({ summary: 'CDS Hooks 1.0 service discovery' })
  discover(): CdsServicesResponse {
    return { services: this.cds.listServices() };
  }

  @Post(':serviceId')
  @ApiOperation({ summary: 'Invoke a CDS Hooks service' })
  async invoke(
    @Param('serviceId') serviceId: string,
    @Body() body: CdsHookRequest,
  ): Promise<CdsHookResponse> {
    const known = this.cds.listServices().find((s) => s.id === serviceId);
    if (!known) throw new NotFoundException(`Unknown CDS service: ${serviceId}`);
    return this.cds.evaluateHook(serviceId, body);
  }
}
