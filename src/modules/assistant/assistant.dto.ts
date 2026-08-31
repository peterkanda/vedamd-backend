import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ChatTurnDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @ApiProperty()
  @IsString()
  @MaxLength(6000)
  content!: string;
}

/** Body for POST /api/v1/assistant/chat (mobile cloud assistant). */
export class AssistantChatDto {
  @ApiProperty({ description: 'The clinician’s clinical question.' })
  @IsString()
  @MaxLength(4000)
  question!: string;

  @ApiPropertyOptional({
    type: [ChatTurnDto],
    description: 'Prior turns, oldest first (no patient identity).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ChatTurnDto)
  conversation?: ChatTurnDto[];
}
