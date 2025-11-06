import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { LinkedWalletDto, LoginType, SponsorshipPlan } from './onboard.dto';

export class StartSessionRequestDto {
  @IsEnum(LoginType)
  loginType: LoginType;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class StartSessionResponseDto {
  sessionId: string;
  ownerAddress: string;
}

export class StatusResponseDto {
  sessionId: string;
  status: 'pending' | 'completed' | 'failed';
  smartAccountAddress?: string;
  paymasterPolicyId?: string;
  loginType?: LoginType;
  ownerAddress?: string;
  email?: string;
  linkedWallets?: LinkedWalletDto[];
  sponsorshipPlan?: SponsorshipPlan;
  sponsorshipTermsVersion?: string;
}
