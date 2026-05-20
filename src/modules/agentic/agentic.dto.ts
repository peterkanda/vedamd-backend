import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class PatientDto {
  @IsOptional() @IsNumber() ageYears?: number;
  @IsOptional() @IsNumber() ageMonths?: number;
  @IsOptional() @IsNumber() weightKg?: number;
  @IsOptional() @IsIn(['male', 'female', 'other']) sex?: 'male' | 'female' | 'other';
  @IsOptional() @IsBoolean() pregnant?: boolean;
  @IsOptional() @IsNumber() gestationWeeks?: number;
  @IsOptional() @IsNumber() eGFR?: number;
  @IsOptional() @IsNumber() creatinineUmolL?: number;
}

class LabDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  value!: number | string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() date?: string;
}

/**
 * Request body for POST /api/v1/agentic/evaluate.
 *
 * Developer-friendly: send only what you have. The engine fuzzy-
 * matches medication / diagnosis strings against the signed bundle,
 * so slugs are not required (but improve precision).
 */
export class AgenticEvaluateDto {
  @IsOptional() @IsString() hook?: string;
  @IsOptional() @IsString() question?: string;
  @IsOptional() @IsIn(['deterministic', 'agentic', 'auto']) mode?: 'deterministic' | 'agentic' | 'auto';
  @IsOptional() @IsNumber() minConfidence?: number;

  @IsOptional() @ValidateNested() @Type(() => PatientDto) patient?: PatientDto;

  @IsOptional() @IsArray() @IsString({ each: true }) medications?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) diagnoses?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) allergies?: string[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => LabDto) labs?: LabDto[];

  @IsOptional() @IsObject() signals?: Record<string, unknown>;
}

/**
 * Request body for POST /api/v1/agentic/evaluate-batch.
 *
 * Population / retrospective safety sweep — submit up to 100 anonymous
 * clinical contexts; each is evaluated independently (deterministic
 * safety floor + agentic reasoning) and returned with a per-item id so
 * the caller can map results back to their own records. Per-item
 * errors are isolated — one bad context never fails the batch.
 *
 * Use cases: nightly population sweeps to surface dangerous co-
 * prescribing already in the EMR, prescribing audits, formulary
 * migration checks.
 */
export class AgenticBatchItemDto extends AgenticEvaluateDto {
  /** Caller-supplied opaque id to correlate the result (e.g. encounter id). Never logged. */
  @IsOptional() @IsString() id?: string;
}

export class AgenticBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AgenticBatchItemDto)
  items!: AgenticBatchItemDto[];
}

/**
 * Request body for POST /api/v1/agentic/evaluate-fhir.
 * Accepts a FHIR R4 Bundle or single resource — parsed by the
 * FHIR adapter into AgenticClinicalContext.
 */
export class AgenticFhirEvaluateDto {
  @IsObject() resource!: Record<string, unknown>;
  @IsOptional() @IsString() hook?: string;
  @IsOptional() @IsString() question?: string;
  @IsOptional() @IsIn(['deterministic', 'agentic', 'auto']) mode?: 'deterministic' | 'agentic' | 'auto';
  @IsOptional() @IsNumber() minConfidence?: number;
}

/**
 * Request body for POST /api/v1/agentic/evaluate-sql.
 * Pull-mode: the engine reads patient data from a configured EHR
 * database connection, maps it, then evaluates. Read-only.
 */
export class AgenticSqlEvaluateDto {
  /** Connection id configured server-side (never a raw connection string from the client). */
  @IsString() connectionId!: string;
  /** Named query template id configured server-side (prevents arbitrary SQL injection). */
  @IsString() queryId!: string;
  /** Bound parameters for the named query (e.g. encounter id). */
  @IsOptional() @IsObject() params?: Record<string, string | number>;
  @IsOptional() @IsString() hook?: string;
  @IsOptional() @IsString() question?: string;
  @IsOptional() @IsIn(['deterministic', 'agentic', 'auto']) mode?: 'deterministic' | 'agentic' | 'auto';
  @IsOptional() @IsNumber() minConfidence?: number;
}
