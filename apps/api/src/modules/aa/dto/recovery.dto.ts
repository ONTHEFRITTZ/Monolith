import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsString,
  Min,
} from 'class-validator';

export class SaveRecoveryRequestDto {
  @IsString()
  sessionId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEmail({}, { each: true })
  contacts: string[];

  @Min(1)
  threshold: number;

  @IsBoolean()
  passkeyEnrolled: boolean;
}

export class SaveRecoveryResponseDto {
  success: boolean;
}
