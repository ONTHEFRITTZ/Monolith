import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createModularAccountAlchemyClient,
  defineAlchemyChain,
} from '@alchemy/aa-alchemy';
import { LocalAccountSigner } from '@alchemy/aa-core';
import type { Account, Prisma } from '@prisma/client';
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
import {
  ProfileResponseDto,
  UpdatePlanRequestDto,
  UpdateProfileSettingsRequestDto,
} from './dto/profile.dto';

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

type SocialProvider = 'google' | 'apple';

interface SessionProfileMetadata {
  version?: string;
  socialLogins?: SocialProvider[];
  preferences?: Record<string, unknown>;
}

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

  async getProfile(sessionId: string): Promise<ProfileResponseDto> {
    const session = await this.prisma.session.findUnique({
      where: { sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    const plan =
      session.sponsorshipPlan &&
      Object.values(SponsorshipPlan).includes(
        session.sponsorshipPlan as SponsorshipPlan,
      )
        ? (session.sponsorshipPlan as SponsorshipPlan)
        : SponsorshipPlan.STARTER;
    const metadata = decodeSponsorshipMetadata(session.sponsorshipTerms);

    return {
      sessionId,
      smartAccountAddress: session.smartAccountAddress,
      ownerAddress: session.ownerAddress,
      loginType: session.loginType as LoginType,
      email: session.email ?? undefined,
      linkedWallets: mapLinkedWallets(session.linkedWallets),
      sponsorshipPlan: plan,
      sponsorship: sponsorshipPlans[plan],
      paymasterPolicyId: session.paymasterPolicyId ?? undefined,
      sponsorshipTermsVersion:
        metadata.version ?? session.sponsorshipTerms ?? undefined,
      socialLogins: metadata.socialLogins,
      preferences: metadata.preferences,
    };
  }

  async updateSponsorshipPlan(
    sessionId: string,
    payload: UpdatePlanRequestDto,
  ): Promise<ProfileResponseDto> {
    await this.prisma.session.update({
      where: { sessionId },
      data: { sponsorshipPlan: payload.plan },
    });

    return this.getProfile(sessionId);
  }

  async updateProfileSettings(
    sessionId: string,
    payload: UpdateProfileSettingsRequestDto,
  ): Promise<ProfileResponseDto> {
    const session = await this.prisma.session.findUnique({
      where: { sessionId },
      select: {
        sponsorshipTerms: true,
      },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    const existingMeta = decodeSponsorshipMetadata(session.sponsorshipTerms);

    const mergedSocials =
      payload.socialLogins !== undefined
        ? normaliseSocialLogins(payload.socialLogins)
        : existingMeta.socialLogins;
    const mergedPreferences =
      payload.preferences !== undefined
        ? normalisePreferences(payload.preferences)
        : existingMeta.preferences;

    const baseVersion =
      existingMeta.version ??
      (session.sponsorshipTerms &&
      !session.sponsorshipTerms.trim().startsWith('{')
        ? session.sponsorshipTerms.trim()
        : undefined);

    const encoded = encodeSponsorshipMetadata(
      baseVersion,
      mergedSocials,
      mergedPreferences,
    );

    await this.prisma.session.update({
      where: { sessionId },
      data: {
        sponsorshipTerms: encoded ?? null,
      },
    });

    return this.getProfile(sessionId);
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
    const sponsorshipTerms = encodeSponsorshipMetadata(
      sponsorship.acceptedTermsVersion,
      accountIntent.socialLogins,
      accountIntent.preferences,
    );
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
        sponsorshipTerms: sponsorshipTerms ?? sponsorship.acceptedTermsVersion,
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

    const metadata = decodeSponsorshipMetadata(session.sponsorshipTerms);

    return {
      sessionId,
      status: session.status as StatusResponseDto['status'],
      smartAccountAddress: session.smartAccountAddress,
      paymasterPolicyId: session.paymasterPolicyId ?? undefined,
      loginType: session.loginType as LoginType,
      ownerAddress: session.ownerAddress,
      email: session.email ?? undefined,
      linkedWallets: mapLinkedWallets(session.linkedWallets),
      sponsorshipPlan: session.sponsorshipPlan
        ? (session.sponsorshipPlan as SponsorshipPlan)
        : undefined,
      sponsorshipTermsVersion:
        metadata.version ?? session.sponsorshipTerms ?? undefined,
      socialLogins: metadata.socialLogins,
      preferences: metadata.preferences,
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

function encodeSponsorshipMetadata(
  version?: string,
  socialLogins?: Array<'google' | 'apple'>,
  preferences?: Record<string, unknown>,
): string | undefined {
  const trimmedVersion = version?.trim();
  const normalisedSocials = normaliseSocialLogins(socialLogins);
  const normalisedPreferences = normalisePreferences(preferences);

  if (!trimmedVersion && !normalisedSocials && !normalisedPreferences) {
    return undefined;
  }

  if (!normalisedSocials && !normalisedPreferences) {
    return trimmedVersion;
  }

  const payload: SessionProfileMetadata = {};

  if (trimmedVersion) {
    payload.version = trimmedVersion;
  }

  if (normalisedSocials) {
    payload.socialLogins = normalisedSocials;
  }

  if (normalisedPreferences) {
    payload.preferences = normalisedPreferences;
  }

  return JSON.stringify(payload);
}

function decodeSponsorshipMetadata(
  raw: string | null | undefined,
): SessionProfileMetadata {
  if (!raw) {
    return {};
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const metadata: SessionProfileMetadata = {};
      const version =
        typeof parsed.version === 'string' ? parsed.version : undefined;
      const socialLogins = normaliseSocialLogins(parsed.socialLogins);
      const preferences = normalisePreferences(parsed.preferences);

      if (version) {
        metadata.version = version;
      }

      if (socialLogins) {
        metadata.socialLogins = socialLogins;
      }

      if (preferences) {
        metadata.preferences = preferences;
      }

      return metadata;
    } catch {
      return { version: trimmed };
    }
  }

  return { version: trimmed };
}

function normaliseSocialLogins(value: unknown): SocialProvider[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const allowed: SocialProvider[] = ['google', 'apple'];
  const unique = Array.from(
    new Set(
      value.filter((entry): entry is SocialProvider => {
        return (
          typeof entry === 'string' && allowed.includes(entry as SocialProvider)
        );
      }),
    ),
  );
  return unique.length > 0 ? unique : undefined;
}

function normalisePreferences(
  value: unknown,
): Record<string, boolean> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const resultEntries = Object.entries(value as Record<string, unknown>).filter(
    ([, preferenceValue]) => typeof preferenceValue === 'boolean',
  );

  if (resultEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(resultEntries) as Record<string, boolean>;
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
