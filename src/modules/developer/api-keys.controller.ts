import { Body, Controller, Delete, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsString } from 'class-validator';
import {
  ApiKeysService,
  type ApiKeyEnvironment,
  type ApiKeyScope,
} from './api-keys.service';

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
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'List API keys for the calling integrator (fingerprints only)' })
  list(@Headers('x-integrator-id') integratorId: string) {
    return this.keys.list(integratorId);
  }

  @Post()
  @ApiOperation({
    summary: 'Create an API key',
    description: 'FR-313 — secret returned once at creation; only fingerprints displayed thereafter.',
  })
  create(@Headers('x-integrator-id') integratorId: string, @Body() body: CreateApiKeyDto) {
    return this.keys.create({ integratorId, ...body });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an API key' })
  revoke(@Headers('x-integrator-id') integratorId: string, @Param('id') id: string) {
    return this.keys.revoke(integratorId, id);
  }
}
