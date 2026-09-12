import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MAX_REPORTS_PER_SYNC } from './device-audit.types';

/**
 * One on-device answer. Note what is absent and must stay absent: the
 * question, the answer, and anything about a patient. The device sends a hash
 * of the question so recurrence can be seen without the text ever leaving the
 * phone.
 */
class DeviceAnswerReportDto {
  @ApiProperty({ description: 'Client-generated id; makes a retried sync idempotent.' })
  @IsString()
  @MaxLength(120)
  clientEventId!: string;

  @ApiProperty({ description: 'When the answer was produced, per the device clock.' })
  @IsISO8601()
  occurredAt!: string;

  @ApiProperty({ description: 'HMAC of the question, computed on the device. Never the text.' })
  @IsString()
  @MaxLength(128)
  questionHash!: string;

  @ApiProperty({ description: "'ondevice', a cloud provider name, or 'refused'." })
  @IsString()
  @MaxLength(60)
  engine!: string;

  @ApiPropertyOptional({ description: 'Installed model build that answered.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  modelVersion?: string;

  @ApiPropertyOptional({ description: 'Content bundle version retrieval ran against.' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  contentVersion?: string;

  @ApiProperty({ description: 'Whether the answer stood on retrieved VedaMD content.' })
  @IsBoolean()
  grounded!: boolean;

  @ApiProperty({ description: 'Whether the clinical-claim gate declined to answer.' })
  @IsBoolean()
  refused!: boolean;

  @ApiProperty({ description: 'False when generation stopped early.' })
  @IsBoolean()
  complete!: boolean;

  @ApiPropertyOptional({ description: 'Cited bundle records as `domain/slug`.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  sourceIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600_000)
  latencyMs?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;
}

/** Body for POST /api/v1/device-audit/answers. */
export class DeviceAnswerSyncDto {
  @ApiProperty({ type: [DeviceAnswerReportDto] })
  @IsArray()
  @ArrayMaxSize(MAX_REPORTS_PER_SYNC)
  @ValidateNested({ each: true })
  @Type(() => DeviceAnswerReportDto)
  reports!: DeviceAnswerReportDto[];
}
