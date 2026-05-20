import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ReferenceChatDto {
  @IsString() @MinLength(3) @MaxLength(500) question!: string;
}

export class DoseCalcDto {
  @IsString() slug!: string;
  @IsOptional() @IsNumber() weightKg?: number;
  @IsOptional() @IsNumber() ageYears?: number;
  @IsOptional() @IsNumber() crClMlMin?: number;
  @IsOptional() @IsString() indication?: string;
  @IsOptional() @IsString() route?: string;
}

export class ReferenceSearchDto {
  @IsString() @MinLength(1) q!: string;
  @IsOptional() @IsIn(['drug', 'condition', 'procedure']) kind?: 'drug' | 'condition' | 'procedure';
}

export class InteractionNetworkDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(40)
  @IsString({ each: true })
  medications!: string[];
}
