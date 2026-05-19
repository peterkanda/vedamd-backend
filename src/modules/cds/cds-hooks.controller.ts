import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CdsService } from './cds.service';
import type { CdsHookRequest, CdsHookResponse, CdsServicesResponse } from './cds.types';
import { ApiKeyGuard, RequireScope } from '../../common/api-key-auth';

@ApiTags('cds-hooks')
@Controller('cds-services')
export class CdsHooksController {
  constructor(private readonly cds: CdsService) {}

  @Get()
  @ApiOperation({
    summary: 'CDS Hooks 1.0 service discovery',
    description: 'Unauthenticated by design — discovery is public per CDS Hooks convention.',
  })
  discover(): CdsServicesResponse {
    return { services: this.cds.listServices() };
  }

  @Post(':serviceId')
  @UseGuards(ApiKeyGuard)
  @RequireScope('cds:evaluate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invoke a CDS Hooks service (requires cds:evaluate scope)' })
  async invoke(
    @Param('serviceId') serviceId: string,
    @Body() body: CdsHookRequest,
  ): Promise<CdsHookResponse> {
    const known = this.cds.listServices().find((s) => s.id === serviceId);
    if (!known) throw new NotFoundException(`Unknown CDS service: ${serviceId}`);
    return this.cds.evaluateHook(serviceId, body);
  }
}
