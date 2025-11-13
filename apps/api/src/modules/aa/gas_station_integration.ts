// apps/api/src/modules/aa/gas-station.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SponsorshipPlanId } from './dto/onboard.dto';

interface GasStationPolicy {
  policyId: string;
  name: string;
  network: string;
  monthlyBudgetUsd: number;
  perTransactionLimitUsd: number;
  allowedContracts?: string[];
}

interface GasPolicyResponse {
  data: {
    id: string;
    name: string;
    blockchain: string;
    maxSpendPerMonth: number;
    maxSpendPerTransaction: number;
    contractAllowlist?: string[];
  };
}

interface GasUsageResponse {
  data: {
    totalSpentUsd: number;
    transactionCount: number;
    period: {
      start: string;
      end: string;
    };
  };
}

/**
 * Circle Gas Station Service
 * Manages gas sponsorship policies and usage tracking per pricing tier
 *
 * Reference: https://developers.circle.com/wallets/gas-station
 */
@Injectable()
export class GasStationService {
  private readonly logger = new Logger(GasStationService.name);
  private readonly apiKey: string;
  private readonly apiBase: string;
  private readonly entityId: string;
  private readonly enabled: boolean;

  // Plan-based monthly sponsorship limits (in USD)
  private readonly PLAN_LIMITS: Record<SponsorshipPlanId, number> = {
    starter: 50,
    pro: 250,
    self: 0,
  };

  constructor(private readonly config: ConfigService) {
    this.apiKey =
      this.config.get<string>('CIRCLE_GAS_STATION_API_KEY') ??
      this.config.get<string>('CIRCLE_SMART_WALLET_API_KEY') ??
      '';
    this.apiBase =
      this.config.get<string>('CIRCLE_GAS_STATION_API_BASE') ??
      'https://api.circle.com';
    this.entityId =
      this.config.get<string>('CIRCLE_SMART_WALLET_ENTITY_ID') ?? '';
    this.enabled = Boolean(this.apiKey && this.entityId);

    if (this.enabled) {
      this.logger.log('Circle Gas Station service initialized');
    } else {
      this.logger.warn(
        'Circle Gas Station disabled: missing API key or entity ID',
      );
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Create or retrieve a gas policy for a specific plan and network
   */
  async ensurePolicyForPlan(
    plan: SponsorshipPlanId,
    network: string,
  ): Promise<string> {
    if (!this.enabled) {
      throw new Error('Gas Station not configured');
    }

    if (plan === 'self') {
      // Self-managed plan doesn't use gas sponsorship
      return '';
    }

    const policyName = `monolith-${plan}-${network}`;
    const monthlyLimit = this.PLAN_LIMITS[plan];

    try {
      // Check if policy already exists
      const existingPolicy = await this.findPolicyByName(policyName);
      if (existingPolicy) {
        return existingPolicy.policyId;
      }

      // Create new policy
      return await this.createGasPolicy({
        name: policyName,
        network,
        monthlyBudgetUsd: monthlyLimit,
        perTransactionLimitUsd: Math.min(monthlyLimit / 10, 25), // Max 10% per tx or $25
      });
    } catch (error) {
      this.logger.error(
        `Failed to ensure gas policy for ${plan}/${network}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Create a new gas sponsorship policy
   */
  private async createGasPolicy(
    policy: Omit<GasStationPolicy, 'policyId'>,
  ): Promise<string> {
    const response = await this.request<GasPolicyResponse>(
      '/v1/w3s/gas/policies',
      {
        method: 'POST',
        body: JSON.stringify({
          name: policy.name,
          blockchain: policy.network,
          maxSpendPerMonth: policy.monthlyBudgetUsd,
          maxSpendPerTransaction: policy.perTransactionLimitUsd,
          contractAllowlist: policy.allowedContracts,
        }),
      },
    );

    this.logger.log(
      `Created gas policy: ${response.data.id} for ${policy.name}`,
    );
    return response.data.id;
  }

  /**
   * Find existing policy by name
   */
  private async findPolicyByName(
    name: string,
  ): Promise<GasStationPolicy | null> {
    try {
      const response = await this.request<{
        data: GasPolicyResponse['data'][];
      }>('/v1/w3s/gas/policies', { method: 'GET' });

      const policy = response.data.find((p) => p.name === name);
      if (!policy) {
        return null;
      }

      return {
        policyId: policy.id,
        name: policy.name,
        network: policy.blockchain,
        monthlyBudgetUsd: policy.maxSpendPerMonth,
        perTransactionLimitUsd: policy.maxSpendPerTransaction,
        allowedContracts: policy.contractAllowlist,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to find policy ${name}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Get current month's gas usage for a policy
   */
  async getMonthlyUsage(policyId: string): Promise<{
    spent: number;
    limit: number;
    remaining: number;
    transactionCount: number;
  }> {
    if (!this.enabled) {
      return { spent: 0, limit: 0, remaining: 0, transactionCount: 0 };
    }

    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const response = await this.request<GasUsageResponse>(
        `/v1/w3s/gas/policies/${policyId}/usage?start=${startOfMonth.toISOString()}&end=${endOfMonth.toISOString()}`,
        { method: 'GET' },
      );

      // Get policy to find limit
      const policyResponse = await this.request<GasPolicyResponse>(
        `/v1/w3s/gas/policies/${policyId}`,
        { method: 'GET' },
      );

      const spent = response.data.totalSpentUsd;
      const limit = policyResponse.data.maxSpendPerMonth;

      return {
        spent,
        limit,
        remaining: Math.max(0, limit - spent),
        transactionCount: response.data.transactionCount,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get usage for policy ${policyId}: ${(error as Error).message}`,
      );
      return { spent: 0, limit: 0, remaining: 0, transactionCount: 0 };
    }
  }

  /**
   * Check if account has remaining gas budget
   */
  async canSponsorTransaction(
    policyId: string,
    estimatedCostUsd: number,
  ): Promise<boolean> {
    if (!this.enabled || !policyId) {
      return false;
    }

    const usage = await this.getMonthlyUsage(policyId);
    return usage.remaining >= estimatedCostUsd;
  }

  /**
   * Update policy spending limits (for plan upgrades/downgrades)
   */
  async updatePolicyLimits(
    policyId: string,
    monthlyBudgetUsd: number,
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }

    await this.request(`/v1/w3s/gas/policies/${policyId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        maxSpendPerMonth: monthlyBudgetUsd,
        maxSpendPerTransaction: Math.min(monthlyBudgetUsd / 10, 25),
      }),
    });

    this.logger.log(
      `Updated policy ${policyId} with ${monthlyBudgetUsd} USD monthly limit`,
    );
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${this.apiBase.replace(/\/$/, '')}${path}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'X-Entity-Id': this.entityId,
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gas Station API error (${response.status}): ${error}`);
    }

    return (await response.json()) as T;
  }
}
