import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum LoginType {
  METAMASK = 'metamask',
  EMAIL = 'email',
  SOCIAL = 'social',
}

export enum SponsorshipPlan {
  STARTER = 'starter',
  PRO = 'pro',
  SELF = 'self',
}

export enum LinkedWalletProvider {
  METAMASK = 'metamask',
  PHANTOM = 'phantom',
  BACKPACK = 'backpack',
}

const SUPPORTED_LINKED_CHAINS = [
  'ethereum',
  'arbitrum',
  'solana',
  'monad',
] as const;

export class LinkedWalletDto {
  @IsEnum(LinkedWalletProvider)
  provider: LinkedWalletProvider;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsArray()
  @IsIn(SUPPORTED_LINKED_CHAINS, { each: true })
  chains: string[];
}

export class RecoveryContactDto {
  @IsString()
  @IsIn(['email', 'phone'])
  type: 'email' | 'phone';

  @IsString()
  @IsNotEmpty()
  value: string;
}

export class AccountIntentDto {
  @IsString()
  @IsNotEmpty()
  owner: string;

  @IsEnum(LoginType)
  loginType: LoginType;

  @IsOptional()
  @IsEmail()
  email?: string;

  @ValidateNested({ each: true })
  @Type(() => RecoveryContactDto)
  recoveryContacts: RecoveryContactDto[];

  @Min(1)
  recoveryThreshold: number;

  @IsBoolean()
  passkeyEnrolled: boolean;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => LinkedWalletDto)
  linkedWallets?: LinkedWalletDto[];
}

export class SponsorshipDto {
  @IsEnum(SponsorshipPlan)
  plan: SponsorshipPlan;

  @IsString()
  @IsNotEmpty()
  acceptedTermsVersion: string;
}

export class OnboardRequestDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @ValidateNested()
  @Type(() => AccountIntentDto)
  accountIntent: AccountIntentDto;

  @ValidateNested()
  @Type(() => SponsorshipDto)
  sponsorship: SponsorshipDto;
}

export class OnboardResponseDto {
  smartAccountAddress: string;
  paymasterPolicyId: string;
  status: 'pending' | 'completed';
}
