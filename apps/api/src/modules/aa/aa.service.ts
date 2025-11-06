import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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
  private readonly logger = new Logger(AaService.name);
  private readonly alchemy: AlchemyOnboardingClient;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.alchemy = new AlchemyOnboardingClient(this.config);
  }

  async startSession(
    payload: StartSessionRequestDto,
  ): Promise<StartSessionResponseDto> {
    const chainKey = SUPPORTED_LOGIN_CHAIN[payload.loginType];

    const fallbackAccount = await this.createSmartAccountClient(chainKey);
    const fallbackSmartAccountAddress =
      await fallbackAccount.client.getAddress();

    let sessionId = this.generateSessionId(payload.loginType, payload.email);
    let ownerAddress = fallbackAccount.ownerAddress;
    let smartAccountAddress = fallbackSmartAccountAddress;
    let ownerPrivateKey = fallbackAccount.ownerPrivateKey;
    let sessionStatus: 'pending' | 'completed' | 'failed' = 'pending';
    let linkedWalletsDto: LinkedWalletDto[] | undefined;

    try {
      const external = await this.alchemy.startSession(
        payload.loginType,
        chainKey,
        payload.email,
      );
      if (external.sessionId) {
        sessionId = external.sessionId;
      }
      if (external.ownerAddress) {
        ownerAddress = external.ownerAddress;
        ownerPrivateKey = '0x';
      } else if (external.owner?.address) {
        ownerAddress = external.owner.address;
        ownerPrivateKey = '0x';
      }
      if (external.smartAccountAddress) {
        smartAccountAddress = external.smartAccountAddress;
      } else if (external.smartAccount?.address) {
        smartAccountAddress = external.smartAccount.address;
      }
      if (external.status) {
        sessionStatus = external.status;
      }
      const externalWallets = normalizeExternalLinkedWallets(
        external.linkedWallets,
      );
      if (externalWallets) {
        linkedWalletsDto = externalWallets;
      }
    } catch (error) {
      this.logger.warn(
        `Alchemy start session fallback engaged: ${(error as Error).message}`,
      );
    }

    if (!ownerAddress) {
      throw new Error('Failed to determine owner address for onboarding.');
    }

    if (!smartAccountAddress) {
      smartAccountAddress = fallbackSmartAccountAddress;
    }

    const paymasterPolicyId =
      this.config.get<string>('PAYMASTER_POLICY_ID') ?? undefined;

    const linkedWalletsJson = encodeLinkedWallets(linkedWalletsDto);

    const account = await this.upsertAccount({
      smartAccountAddress,
      primaryOwnerAddress: ownerAddress,
      loginType: payload.loginType,
      linkedWallets: linkedWalletsJson,
    });

    await this.prisma.session.create({
      data: {
        sessionId,
        loginType: payload.loginType,
        ownerAddress,
        email: payload.email,
        status: sessionStatus,
        smartAccountAddress,
        ownerPrivateKey,
        paymasterPolicyId,
        accountId: account.id,
        linkedWallets: linkedWalletsJson,
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

    try {
      await this.alchemy.saveRecovery({
        sessionId: payload.sessionId,
        contacts: payload.contacts,
        threshold: payload.threshold,
        passkeyEnrolled: payload.passkeyEnrolled,
      });
    } catch (error) {
      this.logger.error(
        `Failed to sync recovery contacts with Alchemy: ${
          (error as Error).message
        }`,
      );
      throw new BadRequestException(
        'Unable to update recovery settings. Please retry in a moment.',
      );
    }

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
      paymasterPolicyId:
        plan === SponsorshipPlan.SELF
          ? undefined
          : (session.paymasterPolicyId ?? undefined),
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
    const paymasterPolicyId =
      payload.plan === SponsorshipPlan.SELF
        ? null
        : (this.config.get<string>('PAYMASTER_POLICY_ID') ?? null);

    await this.prisma.session.update({
      where: { sessionId },
      data: {
        sponsorshipPlan: payload.plan,
        paymasterPolicyId,
      },
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
    const paymasterPolicyId =
      sponsorship.plan === SponsorshipPlan.SELF
        ? null
        : (this.config.get<string>('PAYMASTER_POLICY_ID') ?? null);
    const linkedWalletsJson = encodeLinkedWallets(linkedWallets);

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
        paymasterPolicyId,
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
      paymasterPolicyId: paymasterPolicyId ?? '',
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
    const plan =
      session.sponsorshipPlan &&
      Object.values(SponsorshipPlan).includes(
        session.sponsorshipPlan as SponsorshipPlan,
      )
        ? (session.sponsorshipPlan as SponsorshipPlan)
        : undefined;

    return {
      sessionId,
      status: session.status as StatusResponseDto['status'],
      smartAccountAddress: session.smartAccountAddress,
      paymasterPolicyId:
        plan === SponsorshipPlan.SELF
          ? undefined
          : (session.paymasterPolicyId ?? undefined),
      loginType: session.loginType as LoginType,
      ownerAddress: session.ownerAddress,
      email: session.email ?? undefined,
      linkedWallets: mapLinkedWallets(session.linkedWallets),
      sponsorshipPlan: plan,
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

function encodeLinkedWallets(
  value: LinkedWalletDto[] | undefined,
): Prisma.JsonArray {
  if (!value || value.length === 0) {
    return [] as unknown as Prisma.JsonArray;
  }

  return value.map((wallet) => ({
    provider: wallet.provider,
    address: wallet.address,
    chains: wallet.chains,
  })) as unknown as Prisma.JsonArray;
}

type ExternalLinkedWallet = {
  provider?: string;
  address?: string;
  chains?: string[];
};

function normalizeExternalLinkedWallets(
  value: ExternalLinkedWallet[] | undefined,
): LinkedWalletDto[] | undefined {
  if (!value || value.length === 0) {
    return undefined;
  }

  const allowed = new Set(Object.values(LinkedWalletProvider));
  const result: LinkedWalletDto[] = [];

  value.forEach((wallet) => {
    const provider =
      typeof wallet.provider === 'string' &&
      allowed.has(wallet.provider as LinkedWalletProvider)
        ? (wallet.provider as LinkedWalletProvider)
        : undefined;
    const address =
      typeof wallet.address === 'string' ? wallet.address : undefined;
    if (!provider || !address) {
      return;
    }

    const chains = Array.isArray(wallet.chains)
      ? wallet.chains.filter(
          (chain): chain is string => typeof chain === 'string',
        )
      : [];

    result.push({
      provider,
      address,
      chains,
    });
  });

  return result.length > 0 ? result : undefined;
}

class AlchemyOnboardingClient {
  private readonly baseUrl: string;
  private readonly appId: string;
  private readonly apiKey?: string;

  constructor(private readonly config: ConfigService) {
    this.appId = this.config.getOrThrow<string>('ALCHEMY_APP_ID');
    this.baseUrl = (
      this.config.get<string>('ALCHEMY_AA_BASE_URL') ??
      'https://api.g.alchemy.com/aa/v1'
    ).replace(/\/$/, '');
    this.apiKey =
      this.config.get<string>('ALCHEMY_AA_API_KEY') ??
      this.config.get<string>('ALCHEMY_TOKEN_API_KEY') ??
      this.config.get<string>('ALCHEMY_APP_TOKEN') ??
      undefined;
  }

  async startSession(
    loginType: LoginType,
    chainKey: 'ethereum' | 'arbitrum',
    email?: string,
  ): Promise<AlchemyStartSessionResponse> {
    return this.request<AlchemyStartSessionResponse>('POST', '/sessions', {
      loginType,
      email,
      chain: chainKey,
    });
  }

  async saveRecovery(payload: {
    sessionId: string;
    contacts: string[];
    threshold: number;
    passkeyEnrolled: boolean;
  }): Promise<void> {
    await this.request<void>('PUT', `/sessions/${payload.sessionId}/recovery`, {
      contacts: payload.contacts,
      threshold: payload.threshold,
      passkeyEnrolled: payload.passkeyEnrolled,
    });
  }

  async finalizeOnboarding(
    sessionId: string,
    payload: {
      accountIntent: {
        owner: string;
        loginType: LoginType;
        email?: string;
        recoveryContacts: Array<{ type: string; value: string }>;
        recoveryThreshold: number;
        passkeyEnrolled: boolean;
        linkedWallets: LinkedWalletDto[];
        socialLogins: Array<'google' | 'apple'>;
        preferences: Record<string, unknown>;
      };
      sponsorship: {
        plan: SponsorshipPlan;
        acceptedTermsVersion: string;
      };
    },
  ): Promise<AlchemyFinalizeOnboardingResponse> {
    return this.request<AlchemyFinalizeOnboardingResponse>(
      'POST',
      `/sessions/${sessionId}/onboard`,
      payload,
    );
  }

  async getSession(sessionId: string): Promise<AlchemySessionStatusResponse> {
    return this.request<AlchemySessionStatusResponse>(
      'GET',
      `/sessions/${sessionId}`,
    );
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}/${this.appId}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['X-Alchemy-Token'] = this.apiKey;
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const response = await globalThis.fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Alchemy onboarding request failed (${response.status}): ${text}`,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}

interface AlchemyStartSessionResponse {
  sessionId?: string;
  ownerAddress?: string;
  owner?: { address?: string };
  smartAccountAddress?: string;
  smartAccount?: { address?: string };
  status?: 'pending' | 'completed' | 'failed';
  linkedWallets?: ExternalLinkedWallet[];
}

interface AlchemyFinalizeOnboardingResponse {
  smartAccountAddress?: string;
  status?: 'pending' | 'completed';
  paymasterPolicyId?: string | null;
  linkedWallets?: ExternalLinkedWallet[];
}

interface AlchemySessionStatusResponse {
  sessionId?: string;
  status?: 'pending' | 'completed' | 'failed';
  ownerAddress?: string;
  smartAccountAddress?: string;
  paymasterPolicyId?: string | null;
  linkedWallets?: ExternalLinkedWallet[];
}
