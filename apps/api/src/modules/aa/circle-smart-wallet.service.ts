import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  LinkedWalletDto,
  LoginType,
  SponsorshipPlan,
} from './dto/onboard.dto';
import type { SaveRecoveryRequestDto } from './dto/recovery.dto';

type CircleSessionStatus = 'pending' | 'completed' | 'failed';

interface CircleSessionSnapshot {
  sessionId?: string;
  ownerAddress?: string;
  ownerPrivateKey?: string;
  smartAccountAddress?: string;
  status?: CircleSessionStatus;
  linkedWallets?: LinkedWalletDto[];
  paymasterPolicyId?: string | null;
}

interface CircleFinalizePayload {
  sessionId: string;
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
}

interface CircleStartSessionOptions {
  loginType: LoginType;
  chain: 'ethereum' | 'arbitrum';
  email?: string;
}

type CircleEnvelope<T> = {
  data?: T;
  results?: T;
  result?: T;
  error?: {
    code?: string | number;
    message?: string;
  };
};

type CircleSessionLike = Record<string, unknown> & {
  id?: string;
  sessionId?: string;
  status?: CircleSessionStatus;
  smartAccountAddress?: string;
  smartWalletAddress?: string;
  ownerAddress?: string;
  recoveryStatus?: string;
  paymasterPolicyId?: string | null;
  linkedWallets?: Array<Record<string, unknown>>;
};

@Injectable()
export class CircleSmartWalletService {
  private readonly logger: Logger;
  private readonly apiKey?: string;
  private readonly apiBase: string;
  private readonly appId?: string;
  private readonly entityId?: string;
  private readonly defaultPolicyId?: string | null;
  private readonly startSessionPath: string;
  private readonly sessionStatusPath: string;
  private readonly finalizePath: string;
  private readonly recoveryPath: string;

  constructor(
    private readonly config: ConfigService,
    parentLogger?: Logger,
  ) {
    this.logger = parentLogger ?? new Logger(CircleSmartWalletService.name);
    this.apiKey =
      this.config.get<string>('CIRCLE_SMART_WALLET_API_KEY') ??
      this.config.get<string>('CIRCLE_API_KEY') ??
      undefined;
    this.apiBase =
      this.config.get<string>('CIRCLE_SMART_WALLET_API_BASE') ??
      this.config.get<string>('CIRCLE_API_BASE') ??
      'https://api.circle.com';
    this.appId =
      this.config.get<string>('CIRCLE_SMART_WALLET_APP_ID') ?? undefined;
    this.entityId =
      this.config.get<string>('CIRCLE_SMART_WALLET_ENTITY_ID') ?? undefined;
    this.defaultPolicyId =
      this.config.get<string>('CIRCLE_SMART_WALLET_DEFAULT_POLICY_ID') ?? null;
    this.startSessionPath =
      this.config.get<string>('CIRCLE_SMART_WALLET_START_SESSION_PATH') ??
      '/v1/w3s/users/sessions';
    this.sessionStatusPath =
      this.config.get<string>('CIRCLE_SMART_WALLET_SESSION_STATUS_PATH') ??
      '/v1/w3s/users/sessions/{sessionId}';
    this.finalizePath =
      this.config.get<string>('CIRCLE_SMART_WALLET_FINALIZE_PATH') ??
      '/v1/w3s/users/wallets';
    this.recoveryPath =
      this.config.get<string>('CIRCLE_SMART_WALLET_RECOVERY_PATH') ??
      '/v1/w3s/users/recovery';
  }

  async startSession(
    options: CircleStartSessionOptions,
  ): Promise<CircleSessionSnapshot | null> {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      const response = await this.request<CircleSessionLike>(
        this.startSessionPath,
        {
          method: 'POST',
          body: JSON.stringify({
            appId: this.appId,
            entityId: this.entityId,
            loginType: options.loginType,
            chain: options.chain,
            email: options.email,
          }),
        },
      );

      return this.normaliseSessionSnapshot(response);
    } catch (error) {
      this.logger.warn(
        `Circle start session fallback engaged: ${(error as Error).message}`,
      );
      return null;
    }
  }

  async saveRecovery(payload: SaveRecoveryRequestDto): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    try {
      await this.request(this.recoveryPath, {
        method: 'POST',
        body: JSON.stringify({
          appId: this.appId,
          entityId: this.entityId,
          sessionId: payload.sessionId,
          contacts: payload.contacts,
          threshold: payload.threshold,
          passkeyEnrolled: payload.passkeyEnrolled,
        }),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to sync recovery contacts with Circle: ${(error as Error).message}`,
      );
    }
  }

  async finalizeOnboarding(
    payload: CircleFinalizePayload,
  ): Promise<CircleSessionSnapshot | null> {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      const response = await this.request<CircleSessionLike>(
        this.finalizePath,
        {
          method: 'POST',
          body: JSON.stringify({
            appId: this.appId,
            entityId: this.entityId,
            sessionId: payload.sessionId,
            accountIntent: payload.accountIntent,
            sponsorship: {
              ...payload.sponsorship,
              policyId: this.defaultPolicyId ?? undefined,
            },
          }),
        },
      );

      return this.normaliseSessionSnapshot(response);
    } catch (error) {
      this.logger.warn(
        `Circle finalize onboarding fallback for session ${payload.sessionId}: ${
          (error as Error).message
        }`,
      );
      return null;
    }
  }

  async getSession(sessionId: string): Promise<CircleSessionSnapshot | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const path = this.sessionStatusPath.replace('{sessionId}', sessionId);
    try {
      const response = await this.request<CircleSessionLike>(path, {
        method: 'GET',
      });
      return this.normaliseSessionSnapshot(response);
    } catch (error) {
      this.logger.warn(
        `Circle status lookup failed for session ${sessionId}: ${
          (error as Error).message
        }`,
      );
      return null;
    }
  }

  private isEnabled(): boolean {
    return Boolean(this.apiKey && this.appId && this.entityId);
  }

  private async request<T>(path: string, init: RequestInit): Promise<T | null> {
    if (!this.apiKey) {
      return null;
    }

    const url =
      path.startsWith('http://') || path.startsWith('https://')
        ? path
        : `${this.apiBase.replace(/\/$/, '')}${path}`;

    const response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      let details = '';
      try {
        const payload = (await response.json()) as Record<string, unknown>;
        details =
          typeof payload.message === 'string' ? `: ${payload.message}` : '';
      } catch {
        // ignore parse errors
      }
      throw new Error(
        `Circle API ${init.method ?? 'GET'} ${url} failed with status ${
          response.status
        }${details}`,
      );
    }

    if (response.status === 204) {
      return null;
    }

    try {
      const payload = (await response.json()) as CircleEnvelope<T> | T;
      if (
        'data' in (payload as CircleEnvelope<T>) &&
        (payload as CircleEnvelope<T>).data
      ) {
        return (payload as CircleEnvelope<T>).data as T;
      }
      if (
        'results' in (payload as CircleEnvelope<T>) &&
        (payload as CircleEnvelope<T>).results
      ) {
        return (payload as CircleEnvelope<T>).results as T;
      }
      if (
        'result' in (payload as CircleEnvelope<T>) &&
        (payload as CircleEnvelope<T>).result
      ) {
        return (payload as CircleEnvelope<T>).result as T;
      }
      return payload as T;
    } catch (error) {
      throw new Error(
        `Unable to parse Circle API response: ${(error as Error).message}`,
      );
    }
  }

  private normaliseSessionSnapshot(
    payload: CircleSessionLike | null | undefined,
  ): CircleSessionSnapshot | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const session =
      (payload.session as CircleSessionLike | undefined) ?? payload;

    const snapshot: CircleSessionSnapshot = {
      sessionId: this.pickString(
        session.sessionId,
        session.id,
        (session as Record<string, unknown>).challengeId,
      ),
      ownerAddress: this.pickString(
        session.ownerAddress,
        (session.owner as Record<string, unknown>)?.address,
        (session.owner as Record<string, unknown>)?.walletAddress,
      ),
      smartAccountAddress: this.pickString(
        session.smartAccountAddress,
        session.smartWalletAddress,
        (session.smartAccount as Record<string, unknown>)?.address,
      ),
      status: this.pickStatus(session.status as CircleSessionStatus),
      paymasterPolicyId:
        this.pickString(
          session.paymasterPolicyId,
          (session.paymaster as Record<string, unknown>)?.policyId,
        ) ?? this.defaultPolicyId,
    };

    const linkedWallets = Array.isArray(session.linkedWallets)
      ? session.linkedWallets
          .map((wallet) => this.normaliseLinkedWallet(wallet))
          .filter((wallet): wallet is LinkedWalletDto => wallet !== undefined)
      : undefined;

    if (linkedWallets && linkedWallets.length > 0) {
      snapshot.linkedWallets = linkedWallets;
    }

    return snapshot;
  }

  private normaliseLinkedWallet(
    value: Record<string, unknown>,
  ): LinkedWalletDto | undefined {
    const provider = this.pickString(value.provider, value.type) as
      | LinkedWalletDto['provider']
      | undefined;
    const address = this.pickString(value.address);
    if (!provider || !address) {
      return undefined;
    }

    const chainsRaw = Array.isArray(value.chains)
      ? value.chains
      : Array.isArray(value.networks)
        ? value.networks
        : [];

    const chains = chainsRaw
      .map((chain) => this.pickString(chain))
      .filter((chain): chain is string => Boolean(chain));

    return {
      provider,
      address,
      chains,
    };
  }

  private pickString(...candidates: Array<unknown>): string | undefined {
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.length > 0) {
        return candidate;
      }
    }
    return undefined;
  }

  private pickStatus(value?: string): CircleSessionStatus | undefined {
    if (!value) {
      return undefined;
    }
    const lowered = value.toLowerCase();
    if (
      lowered === 'pending' ||
      lowered === 'completed' ||
      lowered === 'failed'
    ) {
      return lowered;
    }
    return undefined;
  }
}
