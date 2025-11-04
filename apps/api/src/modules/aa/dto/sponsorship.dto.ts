import { IsEnum } from 'class-validator';
import { SponsorshipPlan } from './onboard.dto';

export class SponsorshipEstimateRequestDto {
  @IsEnum(SponsorshipPlan)
  plan: SponsorshipPlan;
}

export class SponsorshipEstimateResponseDto {
  plan: SponsorshipPlan;
  monthlyAllowance: number;
  currency: 'USD';
  note: string;
  recommended: boolean;
}
