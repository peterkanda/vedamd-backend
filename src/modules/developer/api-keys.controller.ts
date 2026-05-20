import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsString } from 'class-validator';
import type { FastifyRequest } from 'fastify';
import { ApiKeysService, type ApiKeyEnvironment, type ApiKeyScope } from './api-keys.service';
import { OperatorAuthGuard } from '../../common/operator-auth';

class CreateApiKeyDto {
  @IsString()
  name!: string;

  @IsArray()
  scopes!: ApiKeyScope[];

  @IsIn(['sandbox', 'production'])
  environment!: ApiKeyEnvironment;
}

@ApiTags('developer')
@Controller('v1/developer/api-keys')
@UseGuards(OperatorAuthGuard)
@ApiBearerAuth()
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'List API keys for the calling integrator (fingerprints only)' })
  list(@Req() req: FastifyRequest) {
    return this.keys.list(req.operator!.integratorId);
  }

  @Post()
  @ApiOperation({
    summary: 'Create an API key',
    description:
      'FR-313 — secret returned once at creation; only fingerprints displayed thereafter.',
  })
  create(@Req() req: FastifyRequest, @Body() body: CreateApiKeyDto) {
    return this.keys.create({ integratorId: req.operator!.integratorId, ...body });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an API key' })
  revoke(@Req() req: FastifyRequest, @Param('id') id: string) {
    return this.keys.revoke(req.operator!.integratorId, id);
  }
}
