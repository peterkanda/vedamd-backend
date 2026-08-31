import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import type { FastifyRequest } from 'fastify';
import { ApiKeysService, type ApiKeyEnvironment, type ApiKeyScope } from './api-keys.service';
import { OperatorAuthGuard } from '../../common/operator-auth';

const SCOPES: ApiKeyScope[] = [
  'cds:evaluate',
  'cds:discover',
  'content:read',
  'drug-info:read',
  'terminology:read',
  'bundles:read',
  'integration-log:read',
  'clinical-audit:run',
];

class CreateApiKeyDto {
  @ApiProperty({
    description: 'Human-readable label for this key — shown in the dashboard.',
    example: 'EMR production — Nairobi cluster',
    minLength: 1,
    maxLength: 80,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiProperty({
    description: 'Capability scopes granted to this key. Must contain at least one.',
    enum: SCOPES,
    isArray: true,
    example: ['cds:evaluate', 'content:read'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(SCOPES, { each: true })
  scopes!: ApiKeyScope[];

  @ApiProperty({
    description: 'Which environment this key applies to. Sandbox keys are isolated from prod.',
    enum: ['sandbox', 'production'],
    example: 'sandbox',
  })
  @IsIn(['sandbox', 'production'])
  environment!: ApiKeyEnvironment;
}

class ApiKeyRecordDto {
  @ApiProperty({ example: 'a1b2c3d4e5f60718' }) id!: string;
  @ApiProperty({ example: 'integrator_acme' }) integratorId!: string;
  @ApiProperty({ example: 'EMR production — Nairobi cluster' }) name!: string;
  @ApiProperty({
    description: 'HMAC-SHA-256 fingerprint of the secret. Used for safe display.',
    example: '7e3d…',
  })
  fingerprint!: string;
  @ApiProperty({ enum: SCOPES, isArray: true })
  scopes!: ApiKeyScope[];
  @ApiProperty({ enum: ['sandbox', 'production'] })
  environment!: ApiKeyEnvironment;
  @ApiProperty({ example: '2026-05-25T10:00:00.000Z' }) createdAt!: string;
  @ApiProperty({ required: false, example: '2026-05-25T11:42:00.000Z' }) lastUsedAt?: string;
  @ApiProperty({ required: false, example: '2026-05-25T12:00:00.000Z' }) revokedAt?: string;
}

class ApiKeyCreatedOnceDto extends ApiKeyRecordDto {
  @ApiProperty({
    description:
      'The raw bearer secret. Shown EXACTLY ONCE — copy it now. Use it as `Authorization: Bearer <secret>`.',
    example: 'vmd_test_8c0w7Z…',
  })
  secret!: string;
}

class RotateResponseDto {
  @ApiProperty({ type: ApiKeyRecordDto }) revoked!: ApiKeyRecordDto;
  @ApiProperty({ type: ApiKeyCreatedOnceDto }) created!: ApiKeyCreatedOnceDto;
}

@ApiTags('developer')
@Controller('v1/developer/api-keys')
@UseGuards(OperatorAuthGuard)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid operator JWT.' })
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @Get()
  @ApiOperation({
    summary: 'List API keys',
    description:
      'Lists every key owned by the calling integrator. Secrets are never returned — only fingerprints + metadata.',
  })
  @ApiOkResponse({ type: ApiKeyRecordDto, isArray: true })
  list(@Req() req: FastifyRequest) {
    return this.keys.list(req.operator!.integratorId);
  }

  @Post()
  @ApiOperation({
    summary: 'Create an API key',
    description:
      'Issues a new bearer secret. The `secret` field is returned EXACTLY ONCE; the server only stores its HMAC fingerprint. Use the secret as `Authorization: Bearer <secret>` on subsequent calls (FR-313).',
  })
  @ApiBody({ type: CreateApiKeyDto })
  @ApiCreatedResponse({ type: ApiKeyCreatedOnceDto })
  create(@Req() req: FastifyRequest, @Body() body: CreateApiKeyDto) {
    return this.keys.create({ integratorId: req.operator!.integratorId, ...body });
  }

  @Post(':id/rotate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate an API key',
    description:
      'Atomically revokes the old key and issues a new secret with the same name, scopes, and environment. Returns both the revoked metadata and the newly created key (secret shown once).',
  })
  @ApiOkResponse({ type: RotateResponseDto })
  @ApiNotFoundResponse({ description: 'Unknown key id, foreign integrator, or already revoked.' })
  async rotate(@Req() req: FastifyRequest, @Param('id') id: string) {
    const result = await this.keys.rotate(req.operator!.integratorId, id);
    if (!result) {
      throw new NotFoundException(
        'Key not found, already revoked, or owned by another integrator.',
      );
    }
    return result;
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Revoke an API key',
    description:
      'Immediately revokes the key. Any in-flight request with the old secret will be rejected on its next call.',
  })
  @ApiOkResponse({ type: ApiKeyRecordDto })
  @ApiNotFoundResponse({ description: 'Unknown key id or foreign integrator.' })
  async revoke(@Req() req: FastifyRequest, @Param('id') id: string) {
    const out = await this.keys.revoke(req.operator!.integratorId, id);
    if (!out) throw new NotFoundException('Key not found.');
    return out;
  }
}
