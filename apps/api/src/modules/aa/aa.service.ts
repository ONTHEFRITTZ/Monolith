import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Account, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { isHex, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
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
import { CircleSmartWalletService } from './circle-smart-wallet.service';

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
  private readonly circleWallets: CircleSmartWalletService;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.circleWallets = new CircleSmartWalletService(this.config, this.logger);
  }

  async startSession(
    payload: StartSessionRequestDto,
  ): Promise<StartSessionResponseDto> {
    const chainKey = SUPPORTED_LOGIN_CHAIN[payload.loginType];

    const fallbackAccount = await this.createSmartAccountClient(chainKey);
    const fallbackSmartAccountAddress = fallbackAccount.smartAccountAddress;

    let sessionId = this.generateSessionId(payload.loginType, payload.email);
    let ownerAddress = fallbackAccount.ownerAddress;
    let smartAccountAddress = fallbackSmartAccountAddress;
    let ownerPrivateKey = fallbackAccount.ownerPrivateKey;
    let sessionStatus: 'pending' | 'completed' | 'failed' = 'pending';
    let linkedWalletsDto: LinkedWalletDto[] | undefined;

    try {
      const external = await this.circleWallets.startSession({
        loginType: payload.loginType,
        chain: chainKey,
        email: payload.email,
      });
      if (external) {
        if (external.sessionId) {
          sessionId = external.sessionId;
        }
        if (external.ownerAddress) {
          ownerAddress = coerceHexString(external.ownerAddress) ?? ownerAddress;
        }
        if (external.ownerPrivateKey) {
          ownerPrivateKey =
            coerceHexString(external.ownerPrivateKey) ?? ownerPrivateKey;
        }
        if (external.smartAccountAddress) {
          smartAccountAddress =
            coerceHexString(external.smartAccountAddress) ??
            smartAccountAddress;
        }
        if (external.status) {
          sessionStatus = external.status;
        }
        if (external.linkedWallets?.length) {
          linkedWalletsDto = normalizeExternalLinkedWallets(
            external.linkedWallets,
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `Circle start session fallback engaged: ${(error as Error).message}`,
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
      await this.circleWallets.saveRecovery({
        sessionId: payload.sessionId,
        contacts: payload.contacts,
        threshold: payload.threshold,
        passkeyEnrolled: payload.passkeyEnrolled,
      });
    } catch (error) {
      this.logger.error(
        `Failed to sync recovery contacts with Circle: ${
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
        linkedWallets: true,
        smartAccountAddress: true,
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

    let linkedWalletsJson: Prisma.JsonArray | undefined;
    if (payload.linkedWallets !== undefined) {
      const sanitised = normaliseLinkedWalletInput(payload.linkedWallets);
      linkedWalletsJson = encodeLinkedWallets(sanitised);
    }

    await this.prisma.session.update({
      where: { sessionId },
      data: {
        sponsorshipTerms: encoded ?? null,
        ...(linkedWalletsJson !== undefined
          ? { linkedWallets: linkedWalletsJson }
          : {}),
      },
    });

    if (linkedWalletsJson !== undefined) {
      try {
        await this.prisma.account.update({
          where: { smartAccountAddress: session.smartAccountAddress },
          data: { linkedWallets: linkedWalletsJson },
        });
      } catch (error) {
        this.logger.warn(
          `Failed to persist linked wallets for account ${session.smartAccountAddress}: ${(error as Error).message}`,
        );
      }
    }

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
    const configuredPaymasterPolicyId =
      sponsorship.plan === SponsorshipPlan.SELF
        ? null
        : (this.config.get<string>('PAYMASTER_POLICY_ID') ?? null);

    const recoveryContactsJson = payload.accountIntent.recoveryContacts.map(
      (contact) => ({
        type: contact.type,
        value: contact.value,
      }),
    ) as unknown as Prisma.JsonArray;

    let finalizeResult = null;
    try {
      finalizeResult = await this.circleWallets.finalizeOnboarding({
        sessionId: payload.sessionId,
        accountIntent: {
          owner: accountIntent.owner,
          loginType: accountIntent.loginType,
          email: accountIntent.email ?? session.email ?? undefined,
          recoveryContacts: accountIntent.recoveryContacts,
          recoveryThreshold: accountIntent.recoveryThreshold,
          passkeyEnrolled: accountIntent.passkeyEnrolled,
          linkedWallets,
          socialLogins: accountIntent.socialLogins ?? [],
          preferences: accountIntent.preferences ?? {},
        },
        sponsorship: {
          plan: sponsorship.plan,
          acceptedTermsVersion: sponsorship.acceptedTermsVersion,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Circle finalize onboarding fallback for session ${payload.sessionId}: ${
          (error as Error).message
        }`,
      );
    }

    const alchemyLinkedWallets = finalizeResult?.linkedWallets
      ? normalizeExternalLinkedWallets(finalizeResult.linkedWallets)
      : undefined;
    const finalLinkedWallets = alchemyLinkedWallets ?? linkedWallets;
    const linkedWalletsJson = encodeLinkedWallets(finalLinkedWallets);
    const finalStatus: 'pending' | 'completed' =
      finalizeResult?.status === 'pending' ? 'pending' : 'completed';
    const finalSmartAccountAddress =
      finalizeResult?.smartAccountAddress ?? session.smartAccountAddress;
    const finalPaymasterPolicyId =
      finalizeResult?.paymasterPolicyId ?? configuredPaymasterPolicyId;

    await this.prisma.session.update({
      where: { sessionId: payload.sessionId },
      data: {
        status: finalStatus,
        email: accountIntent.email ?? session.email,
        recoveryContacts: recoveryContactsJson,
        recoveryThreshold: accountIntent.recoveryThreshold,
        passkeyEnrolled: accountIntent.passkeyEnrolled,
        sponsorshipPlan: sponsorship.plan,
        sponsorshipTerms: sponsorshipTerms ?? sponsorship.acceptedTermsVersion,
        linkedWallets: linkedWalletsJson,
        paymasterPolicyId: finalPaymasterPolicyId,
        smartAccountAddress: finalSmartAccountAddress,
      },
    });

    await this.prisma.account.update({
      where: { smartAccountAddress: session.smartAccountAddress },
      data: {
        smartAccountAddress: finalSmartAccountAddress,
        primaryOwnerAddress: accountIntent.owner,
        loginType: accountIntent.loginType,
        linkedWallets: linkedWalletsJson,
      },
    });

    return {
      smartAccountAddress: finalSmartAccountAddress,
      paymasterPolicyId: finalPaymasterPolicyId ?? '',
      status: finalStatus,
    };
  }

  async getStatus(sessionId: string): Promise<StatusResponseDto> {
    let session = await this.prisma.session.findUnique({
      where: { sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    const originalSmartAccountAddress = session.smartAccountAddress;
    let remoteLinkedWallets: LinkedWalletDto[] | undefined;
    let remoteStatus: 'pending' | 'completed' | 'failed' | undefined;
    let remoteSmartAccountAddress: string | undefined;
    let remotePaymasterPolicyId: string | null | undefined;
    let remoteOwnerAddress: string | undefined;

    try {
      const external = await this.circleWallets.getSession(sessionId);
      if (external) {
        remoteStatus = external.status;
        remoteSmartAccountAddress = external.smartAccountAddress ?? undefined;
        remotePaymasterPolicyId =
          external.paymasterPolicyId !== undefined
            ? external.paymasterPolicyId
            : undefined;
        remoteOwnerAddress = external.ownerAddress ?? undefined;
        remoteLinkedWallets = normalizeExternalLinkedWallets(
          external.linkedWallets,
        );

        const remoteLinkedWalletsJson = remoteLinkedWallets
          ? encodeLinkedWallets(remoteLinkedWallets)
          : undefined;

        const sessionUpdate: Prisma.SessionUpdateInput = {};
        const accountUpdate: Prisma.AccountUpdateInput = {};
        if (remoteStatus && remoteStatus !== session.status) {
          sessionUpdate.status = remoteStatus;
        }
        if (
          remoteSmartAccountAddress &&
          remoteSmartAccountAddress !== session.smartAccountAddress
        ) {
          sessionUpdate.smartAccountAddress = remoteSmartAccountAddress;
        }
        if (remotePaymasterPolicyId !== undefined) {
          sessionUpdate.paymasterPolicyId = remotePaymasterPolicyId;
        }
        if (remoteOwnerAddress && remoteOwnerAddress !== session.ownerAddress) {
          sessionUpdate.ownerAddress = remoteOwnerAddress;
          accountUpdate.primaryOwnerAddress = remoteOwnerAddress;
        }
        if (remoteLinkedWalletsJson) {
          sessionUpdate.linkedWallets = remoteLinkedWalletsJson;
          accountUpdate.linkedWallets = remoteLinkedWalletsJson;
        }

        if (Object.keys(sessionUpdate).length > 0) {
          session = await this.prisma.session.update({
            where: { sessionId },
            data: sessionUpdate,
          });
        }

        let targetAccountAddress = session.smartAccountAddress;
        if (
          remoteSmartAccountAddress &&
          remoteSmartAccountAddress !== originalSmartAccountAddress
        ) {
          try {
            await this.prisma.account.update({
              where: { smartAccountAddress: originalSmartAccountAddress },
              data: { smartAccountAddress: remoteSmartAccountAddress },
            });
            targetAccountAddress = remoteSmartAccountAddress;
          } catch (error) {
            this.logger.warn(
              `Failed to update account smart address for session ${sessionId}: ${
                (error as Error).message
              }`,
            );
          }
        }

        if (Object.keys(accountUpdate).length > 0) {
          try {
            await this.prisma.account.update({
              where: { smartAccountAddress: targetAccountAddress },
              data: accountUpdate,
            });
          } catch (error) {
            this.logger.warn(
              `Failed to sync account metadata on ${targetAccountAddress}: ${
                (error as Error).message
              }`,
            );
          }
        }
      }
    } catch (error) {
      this.logger.warn(
        `Circle status lookup failed for session ${sessionId}: ${
          (error as Error).message
        }`,
      );
    }

    const metadata = decodeSponsorshipMetadata(session.sponsorshipTerms);
    const plan =
      session.sponsorshipPlan &&
      Object.values(SponsorshipPlan).includes(
        session.sponsorshipPlan as SponsorshipPlan,
      )
        ? (session.sponsorshipPlan as SponsorshipPlan)
        : undefined;

    const finalLinkedWallets =
      remoteLinkedWallets ?? mapLinkedWallets(session.linkedWallets);

    const resolvedPaymaster =
      plan === SponsorshipPlan.SELF
        ? undefined
        : remotePaymasterPolicyId !== undefined
          ? (remotePaymasterPolicyId ?? undefined)
          : (session.paymasterPolicyId ?? undefined);

    return {
      sessionId,
      status: remoteStatus ?? (session.status as StatusResponseDto['status']),
      smartAccountAddress:
        remoteSmartAccountAddress ?? session.smartAccountAddress,
      paymasterPolicyId: resolvedPaymaster,
      loginType: session.loginType as LoginType,
      ownerAddress: remoteOwnerAddress ?? session.ownerAddress,
      email: session.email ?? undefined,
      linkedWallets: finalLinkedWallets,
      sponsorshipPlan: plan,
      sponsorshipTermsVersion:
        metadata.version ?? session.sponsorshipTerms ?? undefined,
      socialLogins: metadata.socialLogins,
      preferences: metadata.preferences,
    };
  }

  private async createSmartAccountClient(
    _chainKey: 'ethereum' | 'arbitrum',
  ): Promise<{
    ownerPrivateKey: Hex;
    ownerAddress: Hex;
    smartAccountAddress: Hex;
  }> {
    const ownerPrivateKey = `0x${randomBytes(32).toString('hex')}` as Hex;
    const account = privateKeyToAccount(ownerPrivateKey);
    const ownerAddress = account.address as Hex;
    const smartAccountAddress = ownerAddress;
    return { ownerPrivateKey, ownerAddress, smartAccountAddress };
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

function normaliseLinkedWalletInput(
  wallets: LinkedWalletDto[],
): LinkedWalletDto[] {
  if (!wallets || wallets.length === 0) {
    return [];
  }
  const seen = new Map<string, LinkedWalletDto>();
  wallets.forEach((wallet) => {
    const key = `${wallet.provider}:${wallet.address.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.set(key, {
        provider: wallet.provider,
        address: wallet.address,
        chains: Array.from(new Set(wallet.chains ?? [])),
      });
    }
  });
  return Array.from(seen.values());
}

function coerceHexString(value?: string | null): Hex | undefined {
  if (!value || typeof value !== 'string') {
    return undefined;
  }
  return isHex(value, { strict: false }) ? (value as Hex) : undefined;
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
