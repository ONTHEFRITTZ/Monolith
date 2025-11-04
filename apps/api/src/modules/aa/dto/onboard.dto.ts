import {
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
