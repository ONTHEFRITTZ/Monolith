import { IsArray, IsEnum, IsIn, IsObject, IsOptional } from 'class-validator';
import { LinkedWalletDto, LoginType, SponsorshipPlan } from './onboard.dto';
import { SponsorshipEstimateResponseDto } from './sponsorship.dto';

export class ProfileResponseDto {
  sessionId: string;
  smartAccountAddress: string;
  ownerAddress: string;
  loginType: LoginType;
  email?: string;
  linkedWallets?: LinkedWalletDto[];
  sponsorshipPlan: SponsorshipPlan;
  sponsorship: SponsorshipEstimateResponseDto;
  paymasterPolicyId?: string;
  sponsorshipTermsVersion?: string;
  socialLogins?: Array<'google' | 'apple'>;
  preferences?: Record<string, unknown>;
}

export class UpdatePlanRequestDto {
  @IsEnum(SponsorshipPlan)
  plan: SponsorshipPlan;
}

export class UpdateProfileSettingsRequestDto {
  @IsOptional()
  @IsArray()
  @IsIn(['google', 'apple'], { each: true })
  socialLogins?: Array<'google' | 'apple'>;

  @IsOptional()
  @IsObject()
  preferences?: Record<string, boolean>;
}
