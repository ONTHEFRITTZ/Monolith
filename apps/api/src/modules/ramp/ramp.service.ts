import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  OffRampRequestDto,
  OnRampRequestDto,
  RampProvider,
  SupportedRampFiat,
} from './dto/ramp.dto';

type RampRequestType = 'on' | 'off';
type RampRequestStatus = 'awaiting_settlement' | 'scheduled';

interface RampRequestRecord {
  id: string;
  type: RampRequestType;
  provider: RampProvider;
  amount: number;
  currency: SupportedRampFiat;
  status: RampRequestStatus;
  referenceCode: string;
  sessionId?: string;
  createdAt: Date;
  metadata: Record<string, string | undefined>;
}

export interface RampActionResponse {
  requestId: string;
  provider: RampProvider;
  status: RampRequestStatus;
  referenceCode: string;
  etaMinutes: number;
  summary: string;
  instructions: string[];
}

@Injectable()
export class RampService {
  private readonly requests = new Map<string, RampRequestRecord>();

  createOnRampRequest(dto: OnRampRequestDto): RampActionResponse {
    this.assertProviderRequirements('on', dto.provider, dto);
    const requestId = randomUUID();
    const referenceCode = this.generateReference(dto.provider);
    const status: RampRequestStatus = 'awaiting_settlement';

    this.requests.set(requestId, {
      id: requestId,
      type: 'on',
      provider: dto.provider,
      amount: dto.amount,
      currency: dto.currency,
      status,
      referenceCode,
      sessionId: dto.sessionId,
      createdAt: new Date(),
      metadata: this.extractMetadata(dto),
    });

    return {
      requestId,
      provider: dto.provider,
      status,
      referenceCode,
      etaMinutes: this.estimateEtaMinutes(dto.provider, 'on'),
      summary: `Prepare ${dto.amount} ${dto.currency} via ${this.providerLabel(dto.provider)} to credit ${dto.destinationWallet}`,
      instructions: this.buildOnRampInstructions(dto, referenceCode),
    };
  }

  createOffRampRequest(dto: OffRampRequestDto): RampActionResponse {
    this.assertProviderRequirements('off', dto.provider, dto);
    const requestId = randomUUID();
    const referenceCode = this.generateReference(dto.provider);
    const status: RampRequestStatus = 'scheduled';

    this.requests.set(requestId, {
      id: requestId,
      type: 'off',
      provider: dto.provider,
      amount: dto.amount,
      currency: dto.currency,
      status,
      referenceCode,
      sessionId: dto.sessionId,
      createdAt: new Date(),
      metadata: this.extractMetadata(dto),
    });

    return {
      requestId,
      provider: dto.provider,
      status,
      referenceCode,
      etaMinutes: this.estimateEtaMinutes(dto.provider, 'off'),
      summary: `Schedule ${dto.amount} ${dto.currency} payout from ${dto.sourceWallet} via ${this.providerLabel(dto.provider)}`,
      instructions: this.buildOffRampInstructions(dto, referenceCode),
    };
  }

  private buildOnRampInstructions(
    dto: OnRampRequestDto,
    reference: string,
  ): string[] {
    switch (dto.provider) {
      case RampProvider.PAYPAL:
        return [
          `Initiate a PayPal transfer from ${dto.contactEmail ?? 'your PayPal account'} to treasury@mon-olith.xyz for ${dto.amount} ${dto.currency}.`,
          `Add memo "${reference}" so we can auto-match the deposit.`,
          `Once confirmed, we mint USDC directly to ${dto.destinationWallet}.`,
        ];
      case RampProvider.STRIPE:
        return [
          `Create a Stripe Connect transfer from account ${dto.accountReference ?? 'your Stripe account'} for ${dto.amount} ${dto.currency}.`,
          `Use destination account \`acct_1MonolithOps\` and include reference "${reference}".`,
          `Funds are swept into our smart account and bridged to ${dto.destinationWallet}.`,
        ];
      case RampProvider.CIRCLE:
        return [
          `Submit a Circle Mint 4 wire from ${dto.institutionName ?? 'your institution'} referencing "${reference}".`,
          `Target sub-account: MON-OLITH TREASURY · Routing 026013673 · Account 123456789.`,
          `Email ${dto.contactEmail ?? 'treasury@mon-olith.xyz'} once the wire is released so we can mint USDC to ${dto.destinationWallet}.`,
        ];
      default:
        return [];
    }
  }

  private buildOffRampInstructions(
    dto: OffRampRequestDto,
    reference: string,
  ): string[] {
    switch (dto.provider) {
      case RampProvider.PAYPAL:
        return [
          `We will release ${dto.amount} ${dto.currency} from treasury to PayPal account ${dto.contactEmail ?? 'provided email'}.`,
          `Expect a payout confirmation referencing "${reference}" within ${this.estimateEtaMinutes(dto.provider, 'off')} minutes.`,
          `Ensure USDC has been burned from ${dto.sourceWallet} before funds settle.`,
        ];
      case RampProvider.STRIPE:
        return [
          `Stripe transfer ${dto.amount} ${dto.currency} to destination account ${dto.accountReference ?? 'provided account'} is being queued.`,
          `You will receive a webhook with reference "${reference}" once the payout hits.`,
          `Keep ${dto.sourceWallet} funded until the sweep completes.`,
        ];
      case RampProvider.CIRCLE:
        return [
          `Circle treasury payout for ${dto.amount} ${dto.currency} is being scheduled under reference "${reference}".`,
          `Counterparty ${dto.institutionName ?? 'your institution'} will receive ACH/Wire instructions once compliance approves.`,
          `We will burn USDC from ${dto.sourceWallet} as soon as the fiat release is confirmed.`,
        ];
      default:
        return [];
    }
  }

  private estimateEtaMinutes(
    provider: RampProvider,
    type: RampRequestType,
  ): number {
    if (provider === RampProvider.CIRCLE) {
      return type === 'on' ? 90 : 120;
    }
    if (provider === RampProvider.STRIPE) {
      return type === 'on' ? 30 : 45;
    }
    return type === 'on' ? 10 : 15;
  }

  private generateReference(provider: RampProvider): string {
    return `${provider.slice(0, 2).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  }

  private providerLabel(provider: RampProvider): string {
    switch (provider) {
      case RampProvider.PAYPAL:
        return 'PayPal';
      case RampProvider.STRIPE:
        return 'Stripe';
      case RampProvider.CIRCLE:
        return 'Circle';
      default:
        return provider;
    }
  }

  private extractMetadata(
    dto: OnRampRequestDto | OffRampRequestDto,
  ): Record<string, string | undefined> {
    return {
      contactEmail: dto.contactEmail,
      accountReference: dto.accountReference,
      institutionName: this.readInstitutionName(dto),
      notes: dto.notes,
    };
  }

  private assertProviderRequirements(
    type: RampRequestType,
    provider: RampProvider,
    dto: OnRampRequestDto | OffRampRequestDto,
  ): void {
    if (provider === RampProvider.PAYPAL && !dto.contactEmail) {
      throw new BadRequestException('PayPal flows require a contact email.');
    }
    if (provider === RampProvider.STRIPE && !dto.accountReference) {
      throw new BadRequestException(
        'Stripe flows require an account reference.',
      );
    }
    const institutionName = this.readInstitutionName(dto);
    if (provider === RampProvider.CIRCLE && !institutionName) {
      throw new BadRequestException(
        'Circle flows require an institution name.',
      );
    }
    if (provider === RampProvider.CIRCLE && !dto.contactEmail) {
      throw new BadRequestException(
        'Circle flows require a primary contact email.',
      );
    }
    if (
      provider === RampProvider.CIRCLE &&
      type === 'off' &&
      !(dto as OffRampRequestDto).accountReference
    ) {
      throw new BadRequestException(
        'Circle off-ramp requests require a payout reference.',
      );
    }
  }

  private readInstitutionName(
    dto: OnRampRequestDto | OffRampRequestDto,
  ): string | undefined {
    const value = (dto as { institutionName?: string }).institutionName;
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    return undefined;
  }
}
