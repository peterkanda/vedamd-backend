import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OperatorAuthGuard } from '../../common/operator-auth';
import { CustomRulesService } from './custom-rules.service';
import type { CustomRuleCreateDto, CustomRuleUpdateDto } from './custom-rules.types';

interface OperatorRequest {
  operator?: { integratorId: string; userId?: string };
}

class CustomRuleMatchDto {
  @ApiProperty({ required: false, type: [String], example: ['metformin'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  medications?: string[];

  @ApiProperty({ required: false, type: [String], example: ['ckd', 'chronic kidney'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  diagnoses?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];

  @ApiProperty({
    required: false,
    type: [String],
    example: ['medication-prescribe'],
    description: 'Restrict the rule to specific CDS hooks. Empty = all hooks.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hooks?: string[];

  @ApiProperty({ required: false, example: 0 })
  @IsOptional()
  @IsNumber()
  ageMinYears?: number;

  @ApiProperty({ required: false, example: 18 })
  @IsOptional()
  @IsNumber()
  ageMaxYears?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  pregnant?: boolean;

  @ApiProperty({
    required: false,
    example: 30,
    description: 'Rule matches if eGFR < this threshold.',
  })
  @IsOptional()
  @IsNumber()
  eGFRBelow?: number;

  @ApiProperty({
    required: false,
    description: 'Array of lab-value clauses (all must hold).',
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  labs?: Array<{
    code?: string;
    nameContains?: string;
    operator: '>' | '>=' | '<' | '<=' | '==';
    value: number;
  }>;
}

class CustomRuleCardDto {
  @ApiProperty({
    example: 'Hold metformin if eGFR < 30 — local renal protocol.',
    minLength: 4,
    maxLength: 240,
  })
  @IsString()
  @MinLength(4)
  @MaxLength(240)
  summary!: string;

  @ApiProperty({ required: false, description: 'Markdown-rendered detail body.' })
  @IsOptional()
  @IsString()
  detail?: string;

  @ApiProperty({ required: false, example: 'Acme Hospital Pharmacy SOP v3.1' })
  @IsOptional()
  @IsString()
  sourceLabel?: string;

  @ApiProperty({ required: false, example: 'https://intranet.acme/sops/renal' })
  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  suggestions?: Array<{ label: string; uuid?: string }>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  links?: Array<{ label: string; url: string; type?: 'absolute' | 'smart' }>;
}

class CreateCustomRuleDto implements CustomRuleCreateDto {
  @ApiProperty({ example: 'Hold metformin in CKD 4/5', minLength: 1, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ enum: ['critical', 'warning', 'info'] })
  @IsIn(['critical', 'warning', 'info'])
  indicator!: 'critical' | 'warning' | 'info';

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ type: CustomRuleMatchDto })
  @IsObject()
  @ValidateNested()
  @Type(() => CustomRuleMatchDto)
  match!: CustomRuleMatchDto;

  @ApiProperty({ type: CustomRuleCardDto })
  @IsObject()
  @ValidateNested()
  @Type(() => CustomRuleCardDto)
  card!: CustomRuleCardDto;
}

class UpdateCustomRuleDto implements CustomRuleUpdateDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;
  @ApiProperty({ required: false, enum: ['critical', 'warning', 'info'] })
  @IsOptional()
  @IsIn(['critical', 'warning', 'info'])
  indicator?: 'critical' | 'warning' | 'info';
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiProperty({ required: false, type: CustomRuleMatchDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomRuleMatchDto)
  match?: CustomRuleMatchDto;
  @ApiProperty({ required: false, type: CustomRuleCardDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomRuleCardDto)
  card?: CustomRuleCardDto;
}

/**
 * Per-integrator custom CDS rule management. Operator-authenticated
 * (same JWT as policies + api-keys). Rules are integrator-scoped and
 * evaluated alongside the signed bundle by the agentic engine.
 */
@ApiTags('custom-rules')
@Controller('v1/custom-rules')
@UseGuards(OperatorAuthGuard)
@ApiBearerAuth()
export class CustomRulesController {
  constructor(private readonly rules: CustomRulesService) {}

  @Get()
  @ApiOperation({
    summary: 'List custom CDS rules for the current integrator',
    description:
      'Returns summaries (no match/card body). Each rule fires at evaluation time when the match block holds.',
  })
  @ApiOkResponse()
  async list(@Req() req: OperatorRequest) {
    return { rules: await this.rules.list(req.operator!.integratorId) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single rule with its full match + card body' })
  @ApiOkResponse()
  @ApiNotFoundResponse()
  async get(@Req() req: OperatorRequest, @Param('id') id: string) {
    const rule = await this.rules.get(req.operator!.integratorId, id);
    if (!rule) throw new NotFoundException(`Unknown rule: ${id}`);
    return rule;
  }

  @Post()
  @ApiOperation({
    summary: 'Create a custom rule',
    description:
      'Define a match block (medications / diagnoses / allergies / labs / patient signals) and a card. The agentic engine merges the resulting cards with the signed bundle + policies.',
  })
  @ApiBody({ type: CreateCustomRuleDto })
  @ApiCreatedResponse()
  async create(@Req() req: OperatorRequest, @Body() dto: CreateCustomRuleDto) {
    try {
      return await this.rules.create(req.operator!.integratorId, dto, req.operator!.userId);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a custom rule (partial)' })
  @ApiOkResponse()
  @ApiNotFoundResponse()
  async update(
    @Req() req: OperatorRequest,
    @Param('id') id: string,
    @Body() dto: UpdateCustomRuleDto,
  ) {
    try {
      const out = await this.rules.update(req.operator!.integratorId, id, dto);
      if (!out) throw new NotFoundException(`Unknown rule: ${id}`);
      return out;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new BadRequestException((err as Error).message);
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a custom rule by id' })
  @ApiOkResponse()
  @ApiNotFoundResponse()
  async remove(@Req() req: OperatorRequest, @Param('id') id: string) {
    const ok = await this.rules.remove(req.operator!.integratorId, id);
    if (!ok) throw new NotFoundException(`Unknown rule: ${id}`);
    return { ok: true };
  }
}
