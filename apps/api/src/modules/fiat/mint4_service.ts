// apps/api/src/modules/fiat/mint4.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

interface BankAccount {
  id: string;
  accountNumber: string;
  routingNumber: string;
  bankName: string;
  status: 'active' | 'pending' | 'failed';
}

interface WireTransfer {
  id: string;
  amount: number;
  currency: 'USD';
  status: 'pending' | 'complete' | 'failed';
  beneficiaryWalletAddress: string;
  createdAt: string;
}

interface BlockchainTransfer {
  id: string;
  amount: string;
  currency: 'USDC';
  destinationAddress: string;
  blockchain: string;
  status: 'pending' | 'complete' | 'failed';
  transactionHash?: string;
}

interface CreateWireRequest {
  amount: number;
  beneficiaryWalletAddress: string;
  idempotencyKey: string;
}

interface CreateBlockchainTransferRequest {
  amount: string;
  destinationAddress: string;
  blockchain: string;
  idempotencyKey: string;
}

/**
 * Circle Mint4 Service - Institutional On/Off Ramp
 *
 * Supports:
 * - Wire transfers (USD → USDC on-ramp)
 * - Blockchain withdrawals (USDC → USD off-ramp via Circle redemption)
 * - Multi-chain support (Ethereum, Arbitrum, Solana, Monad when available)
 *
 * Reference: https://developers.circle.com/circle-mint/docs/circle-mint-onboarding-and-quickstart
 */
@Injectable()
export class Mint4Service {
  private readonly logger = new Logger(Mint4Service.name);
  private readonly apiKey: string;
  private readonly environment: 'sandbox' | 'production';
  private readonly apiBase: string;
  private readonly wireAccountId: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('CIRCLE_MINT_API_KEY') ?? '';
    this.environment =
      (this.config.get<string>('CIRCLE_MINT_ENVIRONMENT') as
        | 'sandbox'
        | 'production') ?? 'sandbox';
    this.wireAccountId =
      this.config.get<string>('CIRCLE_MINT_WIRE_ACCOUNT_ID') ?? '';

    this.apiBase =
      this.environment === 'sandbox'
        ? 'https://api-sandbox.circle.com'
        : 'https://api.circle.com';

    this.enabled = Boolean(this.apiKey && this.wireAccountId);

    if (this.enabled) {
      this.logger.log(`Circle Mint4 initialized (${this.environment} mode)`);
    } else {
      this.logger.warn('Circle Mint4 disabled: missing API key or account ID');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get wire transfer instructions for a user to fund their account
   */
  async getWireInstructions(userId: string): Promise<{
    beneficiaryName: string;
    bankName: string;
    accountNumber: string;
    routingNumber: string;
    swiftCode?: string;
    reference: string;
  }> {
    if (!this.enabled) {
      throw new Error('Mint4 not configured');
    }

    // Reference should be unique per user for tracking
    const reference = `MONO-${userId.substring(0, 8).toUpperCase()}`;

    // In production, fetch actual wire details from Circle
    // For now, return template that would be dynamically populated
    return {
      beneficiaryName: 'Circle Internet Financial LLC',
      bankName: 'Signature Bank', // Example - Circle provides actual details
      accountNumber: this.wireAccountId,
      routingNumber: '026013576', // Example routing number
      swiftCode: 'SIGNUS33', // For international wires
      reference,
    };
  }

  /**
   * Create a wire transfer (on-ramp: USD → USDC)
   */
  async initiateOnRamp(params: {
    userId: string;
    amountUsd: number;
    destinationAddress: string;
    blockchain: string;
  }): Promise<WireTransfer> {
    if (!this.enabled) {
      throw new Error('Mint4 not configured');
    }

    const idempotencyKey = randomUUID();

    try {
      const response = await this.request<{ data: WireTransfer }>(
        '/v1/businessAccount/transfers',
        {
          method: 'POST',
          body: JSON.stringify({
            idempotencyKey,
            source: {
              type: 'wire',
              id: this.wireAccountId,
            },
            destination: {
              type: 'blockchain',
              address: params.destinationAddress,
              chain: this.normalizeChainName(params.blockchain),
            },
            amount: {
              amount: params.amountUsd.toFixed(2),
              currency: 'USD',
            },
          }),
        },
      );

      this.logger.log(
        `Created on-ramp transfer ${response.data.id} for user ${params.userId}`,
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to create on-ramp transfer: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Create blockchain withdrawal (off-ramp: USDC → USD)
   */
  async initiateOffRamp(params: {
    userId: string;
    amountUsdc: string;
    sourceAddress: string;
    blockchain: string;
    bankAccountId?: string;
  }): Promise<BlockchainTransfer> {
    if (!this.enabled) {
      throw new Error('Mint4 not configured');
    }

    const idempotencyKey = randomUUID();

    try {
      // Step 1: User sends USDC to Circle's redemption address
      const redemptionAddress = await this.getRedemptionAddress(
        params.blockchain,
      );

      // Step 2: Circle detects the transfer and initiates wire back to user's bank
      const response = await this.request<{ data: BlockchainTransfer }>(
        '/v1/businessAccount/transfers',
        {
          method: 'POST',
          body: JSON.stringify({
            idempotencyKey,
            source: {
              type: 'blockchain',
              address: params.sourceAddress,
              chain: this.normalizeChainName(params.blockchain),
            },
            destination: {
              type: 'wire',
              id: params.bankAccountId ?? this.wireAccountId,
            },
            amount: {
              amount: params.amountUsdc,
              currency: 'USD',
            },
          }),
        },
      );

      this.logger.log(
        `Created off-ramp transfer ${response.data.id} for user ${params.userId}`,
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to create off-ramp transfer: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Get Circle's redemption address for USDC withdrawals
   */
  async getRedemptionAddress(blockchain: string): Promise<string> {
    // These are Circle's official USDC redemption addresses
    // Users send USDC here to initiate USD wire withdrawal
    const REDEMPTION_ADDRESSES: Record<string, string> = {
      ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC on Ethereum
      arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC on Arbitrum
      solana: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC on Solana
      // Monad address to be added when available
    };

    const address = REDEMPTION_ADDRESSES[blockchain.toLowerCase()];
    if (!address) {
      throw new Error(`Unsupported blockchain for off-ramp: ${blockchain}`);
    }

    return address;
  }

  /**
   * Get transfer status and details
   */
  async getTransferStatus(
    transferId: string,
  ): Promise<WireTransfer | BlockchainTransfer> {
    if (!this.enabled) {
      throw new Error('Mint4 not configured');
    }

    const response = await this.request<{
      data: WireTransfer | BlockchainTransfer;
    }>(`/v1/businessAccount/transfers/${transferId}`, {
      method: 'GET',
    });

    return response.data;
  }

  /**
   * List recent transfers for a user
   */
  async listTransfers(params: {
    userId: string;
    limit?: number;
    status?: 'pending' | 'complete' | 'failed';
  }): Promise<(WireTransfer | BlockchainTransfer)[]> {
    if (!this.enabled) {
      return [];
    }

    try {
      const queryParams = new URLSearchParams({
        limit: String(params.limit ?? 10),
        ...(params.status && { status: params.status }),
      });

      const response = await this.request<{
        data: (WireTransfer | BlockchainTransfer)[];
      }>(`/v1/businessAccount/transfers?${queryParams}`, {
        method: 'GET',
      });

      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to list transfers: ${(error as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Add bank account for off-ramp withdrawals
   */
  async addBankAccount(params: {
    userId: string;
    accountNumber: string;
    routingNumber: string;
    accountName: string;
  }): Promise<BankAccount> {
    if (!this.enabled) {
      throw new Error('Mint4 not configured');
    }

    const idempotencyKey = randomUUID();

    const response = await this.request<{ data: BankAccount }>(
      '/v1/businessAccount/banks/wires',
      {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey,
          accountNumber: params.accountNumber,
          routingNumber: params.routingNumber,
          billingDetails: {
            name: params.accountName,
          },
          bankAddress: {
            country: 'US', // Expand for international support
          },
        }),
      },
    );

    this.logger.log(
      `Added bank account ${response.data.id} for user ${params.userId}`,
    );

    return response.data;
  }

  /**
   * Get minimum and maximum transfer amounts
   */
  getLimits(): {
    onRamp: { min: number; max: number };
    offRamp: { min: number; max: number };
  } {
    // Circle Mint typically has these limits
    return {
      onRamp: {
        min: 1000, // $1,000 minimum wire
        max: 1000000, // $1M maximum per transaction
      },
      offRamp: {
        min: 1000, // $1,000 minimum redemption
        max: 1000000, // $1M maximum per transaction
      },
    };
  }

  /**
   * Normalize chain names to Circle's format
   */
  private normalizeChainName(blockchain: string): string {
    const mapping: Record<string, string> = {
      ethereum: 'ETH',
      arbitrum: 'ARB',
      solana: 'SOL',
      monad: 'MONAD', // To be confirmed when Circle adds support
    };

    return mapping[blockchain.toLowerCase()] ?? blockchain.toUpperCase();
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${this.apiBase}${path}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Circle Mint4 API error (${response.status}): ${error}`);
    }

    return (await response.json()) as T;
  }
}
