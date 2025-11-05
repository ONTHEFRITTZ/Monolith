import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  arbitrumSepolia,
  createModularAccountAlchemyClient,
  sepolia,
} from '@alchemy/aa-alchemy';
import { generatePrivateKey, LocalAccountSigner } from '@alchemy/aa-core';
import { Account, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
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
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async startSession(
    payload: StartSessionRequestDto,
  ): Promise<StartSessionResponseDto> {
    const sessionId = this.generateSessionId(payload.loginType, payload.email);

    const {
      client: smartAccount,
      ownerPrivateKey,
      ownerAddress,
    } = await this.createSmartAccountClient(
      SUPPORTED_LOGIN_CHAIN[payload.loginType],
    );

    const smartAccountAddress = await smartAccount.getAddress();
    const paymasterPolicyId =
      this.config.get<string>('PAYMASTER_POLICY_ID') ?? undefined;

    const account = await this.upsertAccount({
      smartAccountAddress,
      primaryOwnerAddress: ownerAddress,
      loginType: payload.loginType,
    });

    await this.prisma.session.create({
      data: {
        sessionId,
        loginType: payload.loginType,
        ownerAddress,
        email: payload.email,
        status: 'pending',
        smartAccountAddress,
        ownerPrivateKey,
        paymasterPolicyId,
        accountId: account.id,
      },
    });

    return {
      sessionId,
      ownerAddress,
    };
  }

  async saveRecovery(
    payload: SaveRecoveryRequestDto,
  ): Promise<SaveRecoveryResponseDto> {
    const session = await this.prisma.session.findUnique({
      where: { sessionId: payload.sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session ${payload.sessionId} not found`);
    }

    await this.prisma.session.update({
      where: { sessionId: payload.sessionId },
      data: {
        recoveryContacts: payload.contacts,
        recoveryThreshold: payload.threshold,
        passkeyEnrolled: payload.passkeyEnrolled,
      },
    });

    return { success: true };
  }

  estimateSponsorship(plan: SponsorshipPlan): SponsorshipEstimateResponseDto {
    return sponsorshipPlans[plan];
  }

  async onboard(payload: OnboardRequestDto): Promise<OnboardResponseDto> {
    const session = await this.prisma.session.findUnique({
      where: { sessionId: payload.sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session ${payload.sessionId} not found`);
    }

    const accountIntent = payload.accountIntent;
    const sponsorship = payload.sponsorship;

    await this.prisma.session.update({
      where: { sessionId: payload.sessionId },
      data: {
        status: 'completed',
        email: accountIntent.email ?? session.email,
        recoveryContacts: accountIntent.recoveryContacts as Prisma.JsonArray,
        recoveryThreshold: accountIntent.recoveryThreshold,
        passkeyEnrolled: accountIntent.passkeyEnrolled,
        sponsorshipPlan: sponsorship.plan,
        sponsorshipTerms: sponsorship.acceptedTermsVersion,
      },
    });

    await this.prisma.account.update({
      where: { smartAccountAddress: session.smartAccountAddress },
      data: {
        primaryOwnerAddress: accountIntent.owner,
        loginType: accountIntent.loginType,
      },
    });

    return {
      smartAccountAddress: session.smartAccountAddress,
      paymasterPolicyId: session.paymasterPolicyId ?? '',
      status: 'completed',
    };
  }

  async getStatus(sessionId: string): Promise<StatusResponseDto> {
    const session = await this.prisma.session.findUnique({
      where: { sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    return {
      sessionId,
      status: session.status as StatusResponseDto['status'],
      smartAccountAddress: session.smartAccountAddress,
      paymasterPolicyId: session.paymasterPolicyId ?? undefined,
    };
  }

  private async createSmartAccountClient(chainKey: 'ethereum' | 'arbitrum') {
    const apiKey = this.config.getOrThrow<string>('ALCHEMY_APP_ID');
    const policyId = this.config.get<string>('PAYMASTER_POLICY_ID');
    const ownerPrivateKey = generatePrivateKey();
    const owner = LocalAccountSigner.privateKeyToAccountSigner(ownerPrivateKey);
    const ownerAddress = await owner.getAddress();

    const chain = chainKey === 'arbitrum' ? arbitrumSepolia : sepolia;

    const client = await createModularAccountAlchemyClient({
      apiKey,
      chain,
      owner,
      gasManagerConfig: policyId ? { policyId } : undefined,
    });

    // attach underlying signer for retrieval later
    (client as any).account.signer = owner;

    return { client, ownerPrivateKey, ownerAddress };
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

  private async upsertAccount(params: {
    smartAccountAddress: string;
    primaryOwnerAddress: string;
    loginType: LoginType;
  }): Promise<Account> {
    const { smartAccountAddress, primaryOwnerAddress, loginType } = params;

    return this.prisma.account.upsert({
      where: { smartAccountAddress },
      update: {
        primaryOwnerAddress,
        loginType,
        updatedAt: new Date(),
      },
      create: {
        smartAccountAddress,
        primaryOwnerAddress,
        loginType,
        status: 'active',
      },
    });
  }
}
