import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  LoginType,
  OnboardRequestDto,
  OnboardResponseDto,
  SponsorshipPlan,
} from './dto/onboard.dto';
import {
  SaveRecoveryRequestDto,
  SaveRecoveryResponseDto,
} from './dto/recovery.dto';
import {
  StartSessionRequestDto,
  StartSessionResponseDto,
  StatusResponseDto,
} from './dto/session.dto';
import { SponsorshipEstimateResponseDto } from './dto/sponsorship.dto';

type SessionStatus = 'pending' | 'completed' | 'failed';

interface SessionRecord {
  sessionId: string;
  ownerAddress: string;
  loginType: LoginType;
  email?: string;
  status: SessionStatus;
  recovery?: {
    contacts: string[];
    threshold: number;
    passkeyEnrolled: boolean;
  };
  sponsorship?: {
    plan: SponsorshipPlan;
    acceptedTermsVersion: string;
  };
  smartAccountAddress?: string;
  paymasterPolicyId?: string;
  updatedAt: number;
}

const sponsorshipPlans: Record<
  SponsorshipPlan,
  SponsorshipEstimateResponseDto
> = {
  [SponsorshipPlan.STARTER]: {
    plan: SponsorshipPlan.STARTER,
    monthlyAllowance: 50,
    currency: 'USD',
    note: 'Mon-olith covers up to $50 of gas each month for bridge intents.',
    recommended: true,
  },
  [SponsorshipPlan.PRO]: {
    plan: SponsorshipPlan.PRO,
    monthlyAllowance: 250,
    currency: 'USD',
    note: 'Priority routing and sponsorship for high-volume accounts.',
    recommended: false,
  },
  [SponsorshipPlan.SELF]: {
    plan: SponsorshipPlan.SELF,
    monthlyAllowance: 0,
    currency: 'USD',
    note: 'Bring your own gas. Mon-olith intervenes only for stuck transactions.',
    recommended: false,
  },
};

@Injectable()
export class AaService {
  private readonly sessions = new Map<string, SessionRecord>();

  startSession(payload: StartSessionRequestDto): StartSessionResponseDto {
    const sessionId = this.generateSessionId(payload.loginType, payload.email);
    const ownerAddress = this.generateAddress();

    const record: SessionRecord = {
      sessionId,
      ownerAddress,
      loginType: payload.loginType,
      email: payload.email,
      status: 'pending',
      updatedAt: Date.now(),
    };

    this.sessions.set(sessionId, record);

    return {
      sessionId,
      ownerAddress,
    };
  }

  saveRecovery(payload: SaveRecoveryRequestDto): SaveRecoveryResponseDto {
    const session = this.sessions.get(payload.sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${payload.sessionId} not found`);
    }

    session.recovery = {
      contacts: payload.contacts,
      threshold: payload.threshold,
      passkeyEnrolled: payload.passkeyEnrolled,
    };
    session.updatedAt = Date.now();

    this.sessions.set(payload.sessionId, session);

    return { success: true };
  }

  estimateSponsorship(plan: SponsorshipPlan): SponsorshipEstimateResponseDto {
    return sponsorshipPlans[plan];
  }

  onboard(payload: OnboardRequestDto): OnboardResponseDto {
    const session = this.sessions.get(payload.sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${payload.sessionId} not found`);
    }

    session.sponsorship = {
      plan: payload.sponsorship.plan,
      acceptedTermsVersion: payload.sponsorship.acceptedTermsVersion,
    };

    session.smartAccountAddress =
      session.smartAccountAddress ?? this.generateAddress();
    session.paymasterPolicyId =
      session.paymasterPolicyId ?? this.generatePaymasterPolicyId();
    session.status = 'completed';
    session.updatedAt = Date.now();

    this.sessions.set(payload.sessionId, session);

    return {
      smartAccountAddress: session.smartAccountAddress,
      paymasterPolicyId: session.paymasterPolicyId,
      status: session.status,
    };
  }

  getStatus(sessionId: string): StatusResponseDto {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    return {
      sessionId,
      status: session.status,
      smartAccountAddress: session.smartAccountAddress,
      paymasterPolicyId: session.paymasterPolicyId,
    };
  }

  private generateSessionId(loginType: LoginType, email?: string): string {
    const prefix =
      loginType === LoginType.METAMASK
        ? 'mm'
        : loginType === LoginType.EMAIL
          ? 'em'
          : 'sso';
    const serial =
      email
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .padEnd(6, '0')
        .slice(0, 6) ?? randomBytes(3).toString('hex');
    return `sess_${prefix}_${serial}`;
  }

  private generateAddress(): string {
    return `0x${randomBytes(20).toString('hex')}`;
  }

  private generatePaymasterPolicyId(): string {
    return `paymaster_${randomBytes(4).toString('hex')}`;
  }
}
