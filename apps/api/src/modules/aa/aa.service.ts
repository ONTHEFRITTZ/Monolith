import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createModularAccountAlchemyClient,
  defineAlchemyChain,
} from '@alchemy/aa-alchemy';
import { LocalAccountSigner } from '@alchemy/aa-core';
import { Account, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import type { Hex } from 'viem';
import { arbitrumSepolia, sepolia } from 'viem/chains';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LinkedWalletDto,
  LinkedWalletProvider,
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
    note: 'Monolith covers up to $50 of gas each month for bridge intents.',
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
    note: 'Bring your own gas. Monolith intervenes only for stuck transactions.',
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
      linkedWallets: [],
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
        linkedWallets: [],
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
    const linkedWallets = accountIntent.linkedWallets ?? [];
    const linkedWalletsJson = linkedWallets.map((wallet) => ({
      provider: wallet.provider,
      address: wallet.address,
      chains: wallet.chains,
    })) as Prisma.JsonArray;

    const recoveryContactsJson = payload.accountIntent.recoveryContacts.map(
      (contact) => ({
        type: contact.type,
        value: contact.value,
      }),
    ) as unknown as Prisma.JsonArray;

    await this.prisma.session.update({
      where: { sessionId: payload.sessionId },
      data: {
        status: 'completed',
        email: accountIntent.email ?? session.email,
        recoveryContacts: recoveryContactsJson,
        recoveryThreshold: accountIntent.recoveryThreshold,
        passkeyEnrolled: accountIntent.passkeyEnrolled,
        sponsorshipPlan: sponsorship.plan,
        sponsorshipTerms: sponsorship.acceptedTermsVersion,
        linkedWallets: linkedWalletsJson,
      },
    });

    await this.prisma.account.update({
      where: { smartAccountAddress: session.smartAccountAddress },
      data: {
        primaryOwnerAddress: accountIntent.owner,
        loginType: accountIntent.loginType,
        linkedWallets: linkedWalletsJson,
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
      loginType: session.loginType as LoginType,
      ownerAddress: session.ownerAddress,
      email: session.email ?? undefined,
      linkedWallets: mapLinkedWallets(session.linkedWallets),
    };
  }

  private async createSmartAccountClient(chainKey: 'ethereum' | 'arbitrum') {
    const apiKey = this.config.getOrThrow<string>('ALCHEMY_APP_ID');
    const policyId = this.config.get<string>('PAYMASTER_POLICY_ID');
    const rpcUrl =
      chainKey === 'arbitrum'
        ? this.config.getOrThrow<string>('ALCHEMY_ARB_RPC_URL')
        : this.config.getOrThrow<string>('ALCHEMY_ETH_RPC_URL');

    const ownerPrivateKey = `0x${randomBytes(32).toString('hex')}` as Hex;
    const owner = LocalAccountSigner.privateKeyToAccountSigner(ownerPrivateKey);
    const ownerAddress = await owner.getAddress();

    const baseChain = chainKey === 'arbitrum' ? arbitrumSepolia : sepolia;
    const chain = defineAlchemyChain({
      chain: baseChain,
      rpcBaseUrl: rpcUrl,
    });

    const client = await createModularAccountAlchemyClient({
      apiKey,
      chain,
      signer: owner,
      owners: [ownerAddress],
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
    linkedWallets?: Prisma.JsonArray;
  }): Promise<Account> {
    const {
      smartAccountAddress,
      primaryOwnerAddress,
      loginType,
      linkedWallets,
    } = params;

    return this.prisma.account.upsert({
      where: { smartAccountAddress },
      update: {
        primaryOwnerAddress,
        loginType,
        linkedWallets: linkedWallets ?? undefined,
        updatedAt: new Date(),
      },
      create: {
        smartAccountAddress,
        primaryOwnerAddress,
        loginType,
        status: 'active',
        linkedWallets: linkedWallets ?? undefined,
      },
    });
  }
}

function mapLinkedWallets(
  value: Prisma.JsonValue | null | undefined,
): LinkedWalletDto[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const allowedProviders = new Set(Object.values(LinkedWalletProvider));

  const result: LinkedWalletDto[] = [];

  value.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }
    const entry = item as Record<string, unknown>;
    const providerRaw =
      typeof entry.provider === 'string' ? entry.provider : undefined;
    const provider =
      providerRaw && allowedProviders.has(providerRaw as LinkedWalletProvider)
        ? (providerRaw as LinkedWalletProvider)
        : undefined;
    const address =
      typeof entry.address === 'string' ? entry.address : undefined;
    const chainsRaw = Array.isArray(entry.chains) ? entry.chains : [];
    const chains = chainsRaw.filter(
      (chain): chain is string => typeof chain === 'string',
    );

    if (provider && address) {
      result.push({
        provider,
        address,
        chains,
      });
    }
  });

  return result.length > 0 ? result : undefined;
}
