import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * One prior turn in a multi-turn clinical conversation. Lets the
 * reasoner resolve follow-up questions ("and if after 3 days they
 * don't get better?") against the established scenario instead of
 * losing context and hallucinating. Content is plain text — for
 * assistant turns the caller passes a readable digest of the cards
 * (summary + detail), NOT raw JSON. Still anonymous: no identifiers.
 */
class ConversationTurnDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @ApiProperty({ description: 'Plain-text content of the turn.' })
  @IsString()
  @MaxLength(6000)
  content!: string;
}

class PatientDto {
  @ApiPropertyOptional({ description: 'Age in years.', example: 42 })
  @IsOptional()
  @IsNumber()
  ageYears?: number;

  @ApiPropertyOptional({ description: 'Age in months (paediatric).', example: 6 })
  @IsOptional()
  @IsNumber()
  ageMonths?: number;

  @ApiPropertyOptional({ description: 'Weight in kilograms.', example: 70 })
  @IsOptional()
  @IsNumber()
  weightKg?: number;

  @ApiPropertyOptional({ enum: ['male', 'female', 'other'] })
  @IsOptional()
  @IsIn(['male', 'female', 'other'])
  sex?: 'male' | 'female' | 'other';

  @ApiPropertyOptional({ description: 'Pregnancy flag.' })
  @IsOptional()
  @IsBoolean()
  pregnant?: boolean;

  @ApiPropertyOptional({ description: 'Gestation in completed weeks.', example: 28 })
  @IsOptional()
  @IsNumber()
  gestationWeeks?: number;

  @ApiPropertyOptional({ description: 'Estimated GFR (mL/min/1.73m²).', example: 75 })
  @IsOptional()
  @IsNumber()
  eGFR?: number;

  @ApiPropertyOptional({ description: 'Serum creatinine in µmol/L.', example: 88 })
  @IsOptional()
  @IsNumber()
  creatinineUmolL?: number;
}

class LabDto {
  @ApiPropertyOptional({ description: 'LOINC code if known.', example: '2160-0' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: 'Human-readable name.', example: 'Creatinine' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Numeric or string lab value.', example: 88 })
  value!: number | string;

  @ApiPropertyOptional({ description: 'Unit (UCUM preferred).', example: 'umol/L' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ description: 'ISO date of the result.', example: '2026-05-20' })
  @IsOptional()
  @IsString()
  date?: string;
}

/**
 * Request body for POST /api/v1/agentic/evaluate.
 */
export class AgenticEvaluateDto {
  @ApiPropertyOptional({
    description: 'CDS Hook to evaluate against (e.g. medication-prescribe, patient-view).',
    example: 'medication-prescribe',
  })
  @IsOptional()
  @IsString()
  hook?: string;

  @ApiPropertyOptional({
    description: 'Free-text clinical question for the agentic reasoner.',
    example: 'Is metformin safe to start in this patient?',
  })
  @IsOptional()
  @IsString()
  question?: string;

  @ApiPropertyOptional({
    type: [ConversationTurnDto],
    description:
      'Prior turns of the conversation, oldest first, EXCLUDING the current `question`. Lets the reasoner keep context across follow-up questions. Anonymous — no patient identifiers. Capped at 40 turns.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ConversationTurnDto)
  conversation?: ConversationTurnDto[];

  @ApiPropertyOptional({
    enum: ['deterministic', 'agentic', 'auto'],
    description:
      'Pipeline mode. `deterministic` skips LLM; `agentic` requires an LLM provider; `auto` runs LLM if configured, else degrades to deterministic.',
    default: 'auto',
  })
  @IsOptional()
  @IsIn(['deterministic', 'agentic', 'auto'])
  mode?: 'deterministic' | 'agentic' | 'auto';

  @ApiPropertyOptional({
    description: 'Drop agentic cards with confidence below this threshold (0..1).',
    example: 0.6,
  })
  @IsOptional()
  @IsNumber()
  minConfidence?: number;

  @ApiPropertyOptional({ type: PatientDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PatientDto)
  patient?: PatientDto;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Active medications by free-text name, RxNorm/ATC code, or VedaMD slug. Fuzzy-matched.',
    example: ['metformin 500 mg PO BD', 'lisinopril 10 mg'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  medications?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Active diagnoses by name, ICD-10/11, or slug.',
    example: ['type 2 diabetes', 'hypertension'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  diagnoses?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Known allergies.',
    example: ['penicillin'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];

  @ApiPropertyOptional({ type: [LabDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabDto)
  labs?: LabDto[];

  @ApiPropertyOptional({
    description: 'Free-form additional signals (vitals, observations) passed straight through.',
    example: { systolicBP: 152, heartRate: 88 },
  })
  @IsOptional()
  @IsObject()
  signals?: Record<string, unknown>;
}

/**
 * Request body for POST /api/v1/agentic/evaluate-batch.
 */
export class AgenticBatchItemDto extends AgenticEvaluateDto {
  @ApiPropertyOptional({
    description:
      'Caller-supplied opaque id to correlate the result (e.g. encounter id). Never logged.',
    example: 'enc_42',
  })
  @IsOptional()
  @IsString()
  id?: string;
}

export class AgenticBatchDto {
  @ApiProperty({
    type: [AgenticBatchItemDto],
    description: 'Up to 100 anonymous clinical contexts. Each is evaluated independently.',
    minItems: 1,
    maxItems: 100,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AgenticBatchItemDto)
  items!: AgenticBatchItemDto[];
}

/**
 * Request body for POST /api/v1/agentic/evaluate-fhir.
 */
export class AgenticFhirEvaluateDto {
  @ApiProperty({
    description:
      'FHIR R4 Bundle or single resource (Patient, MedicationRequest, Observation, Condition). Parsed by the FHIR adapter.',
  })
  @IsObject()
  resource!: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'medication-prescribe' })
  @IsOptional()
  @IsString()
  hook?: string;

  @ApiPropertyOptional({ example: 'Is this safe for this patient?' })
  @IsOptional()
  @IsString()
  question?: string;

  @ApiPropertyOptional({
    type: [ConversationTurnDto],
    description: 'Prior conversation turns (oldest first), excluding the current question.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ConversationTurnDto)
  conversation?: ConversationTurnDto[];

  @ApiPropertyOptional({ enum: ['deterministic', 'agentic', 'auto'] })
  @IsOptional()
  @IsIn(['deterministic', 'agentic', 'auto'])
  mode?: 'deterministic' | 'agentic' | 'auto';

  @ApiPropertyOptional({ example: 0.6 })
  @IsOptional()
  @IsNumber()
  minConfidence?: number;
}

/**
 * Request body for POST /api/v1/agentic/evaluate-sql.
 */
export class AgenticSqlEvaluateDto {
  @ApiProperty({
    description:
      'Server-side configured connection id (never a raw connection string from the client).',
    example: 'openmrs-prod',
  })
  @IsString()
  connectionId!: string;

  @ApiProperty({
    description: 'Server-side named query template id (prevents arbitrary SQL injection).',
    example: 'patient-encounter-snapshot',
  })
  @IsString()
  queryId!: string;

  @ApiPropertyOptional({
    description: 'Bound parameters for the named query.',
    example: { encounterId: 'enc_42' },
  })
  @IsOptional()
  @IsObject()
  params?: Record<string, string | number>;

  @ApiPropertyOptional({ example: 'patient-view' })
  @IsOptional()
  @IsString()
  hook?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() question?: string;

  @ApiPropertyOptional({ enum: ['deterministic', 'agentic', 'auto'] })
  @IsOptional()
  @IsIn(['deterministic', 'agentic', 'auto'])
  mode?: 'deterministic' | 'agentic' | 'auto';

  @ApiPropertyOptional({ example: 0.6 })
  @IsOptional()
  @IsNumber()
  minConfidence?: number;
}
