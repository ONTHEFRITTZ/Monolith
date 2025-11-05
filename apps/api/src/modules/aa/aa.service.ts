import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createModularAccountAlchemyClient,
  sepolia,
  arbitrumSepolia,
} from '@alchemy/aa-alchemy';
import { generatePrivateKey, LocalAccountSigner } from '@alchemy/aa-core';
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
  loginType: LoginType;
  ownerAddress: string;
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
  ownerPrivateKey?: string;
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

const SUPPORTED_LOGIN_CHAIN: Record<LoginType, 'ethereum' | 'arbitrum'> = {
  [LoginType.METAMASK]: 'ethereum',
  [LoginType.EMAIL]: 'ethereum',
  [LoginType.SOCIAL]: 'arbitrum',
};

@Injectable()
export class AaService {
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(private readonly config: ConfigService) {}

  async startSession(
    payload: StartSessionRequestDto,
  ): Promise<StartSessionResponseDto> {
    const sessionId = this.generateSessionId(payload.loginType, payload.email);

    const smartAccount = await this.createSmartAccountClient(
      SUPPORTED_LOGIN_CHAIN[payload.loginType],
    );
    const smartAccountAddress = await smartAccount.getAddress();

    const ownerPrivateKey = smartAccount.account?.signer?.privateKey;
    if (!ownerPrivateKey) {
      throw new Error(
        'Unable to derive owner private key for smart account session.',
      );
    }

    const record: SessionRecord = {
      sessionId,
      loginType: payload.loginType,
      ownerAddress: smartAccountAddress,
      email: payload.email,
      status: 'pending',
      smartAccountAddress,
      ownerPrivateKey,
      paymasterPolicyId:
        this.config.get<string>('PAYMASTER_POLICY_ID') ?? undefined,
      updatedAt: Date.now(),
    };

    this.sessions.set(sessionId, record);

    return {
      sessionId,
      ownerAddress: smartAccountAddress,
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

  private async createSmartAccountClient(chainKey: 'ethereum' | 'arbitrum') {
    const apiKey = this.config.getOrThrow<string>('ALCHEMY_APP_ID');
    const policyId = this.config.get<string>('PAYMASTER_POLICY_ID');
    const ownerPrivateKey = generatePrivateKey();
    const owner = LocalAccountSigner.privateKeyToAccountSigner(ownerPrivateKey);

    const chain = chainKey === 'arbitrum' ? arbitrumSepolia : sepolia;

    const client = await createModularAccountAlchemyClient({
      apiKey,
      chain,
      owner,
      gasManagerConfig: policyId ? { policyId } : undefined,
    });

    // attach underlying signer for retrieval later
    (client as any).account.signer = owner;

    return client;
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
}
