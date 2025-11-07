import {
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum RampProvider {
  PAYPAL = 'paypal',
  STRIPE = 'stripe',
  CIRCLE = 'circle',
}

export const SUPPORTED_RAMP_FIAT = ['USD', 'CAD', 'EUR'] as const;
export type SupportedRampFiat = (typeof SUPPORTED_RAMP_FIAT)[number];

export class OnRampRequestDto {
  @IsEnum(RampProvider)
  provider: RampProvider;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount: number;

  @IsIn(SUPPORTED_RAMP_FIAT)
  currency: SupportedRampFiat;

  @IsString()
  @IsNotEmpty()
  destinationWallet: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  accountReference?: string;

  @IsOptional()
  @IsString()
  institutionName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class OffRampRequestDto {
  @IsEnum(RampProvider)
  provider: RampProvider;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount: number;

  @IsIn(SUPPORTED_RAMP_FIAT)
  currency: SupportedRampFiat;

  @IsString()
  @IsNotEmpty()
  sourceWallet: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  accountReference?: string;

  @IsOptional()
  @IsString()
  institutionName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
