import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { SupportedChain, SupportedToken } from '../types/bridge.types';

export class CreateIntentDto {
  @IsEnum(SupportedChain)
  sourceChain!: SupportedChain;

  @IsEnum(SupportedToken)
  sourceToken!: SupportedToken;

  @IsEnum(SupportedChain)
  destinationChain!: SupportedChain;

  @IsEnum(SupportedToken)
  destinationToken!: SupportedToken;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  walletProvider?: string;
}

export class IntentResponseDto {
  @IsUUID()
  id!: string;

  @IsEnum(SupportedChain)
  sourceChain!: SupportedChain;

  @IsEnum(SupportedToken)
  sourceToken!: SupportedToken;

  @IsEnum(SupportedChain)
  destinationChain!: SupportedChain;

  @IsEnum(SupportedToken)
  destinationToken!: SupportedToken;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsNumber()
  @Min(0)
  feeBps!: number;

  @IsNumber()
  @Min(0)
  estimatedDestinationAmount!: number;

  @IsString()
  status!:
    | 'created'
    | 'pending_source'
    | 'pending_settlement'
    | 'settled'
    | 'failed';

  @IsOptional()
  @IsString()
  walletProvider?: string;
}
