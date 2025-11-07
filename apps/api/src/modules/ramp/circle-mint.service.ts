import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Circle, CircleEnvironments } from '@circle-fin/circle-sdk';
import type { WireInstruction } from '@circle-fin/circle-sdk/dist/generated/models/wire-instruction';
import type { OnRampRequestDto } from './dto/ramp.dto';

type SupportedWireCurrency = 'USD' | 'EUR';

@Injectable()
export class CircleMintService {
  private readonly logger = new Logger(CircleMintService.name);
  private readonly circle?: Circle;
  private readonly wireAccountId?: string;
  private readonly defaultCurrency: SupportedWireCurrency = 'USD';

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('CIRCLE_MINT_API_KEY');
    const environment = this.configService.get<string>(
      'CIRCLE_MINT_ENVIRONMENT',
    );
    this.wireAccountId =
      this.configService.get<string>('CIRCLE_MINT_WIRE_ACCOUNT_ID') ??
      undefined;

    if (apiKey && environment) {
      const baseUrl =
        environment.toLowerCase() === 'production'
          ? CircleEnvironments.production
          : CircleEnvironments.sandbox;
      this.circle = new Circle(apiKey, baseUrl);
      this.logger.log(
        `Circle Mint service initialised for ${environment} environment.`,
      );
    } else {
      this.logger.log(
        'Circle Mint service disabled (missing CIRCLE_MINT_API_KEY or CIRCLE_MINT_ENVIRONMENT).',
      );
    }
  }

  isEnabled(): boolean {
    return Boolean(this.circle && this.wireAccountId);
  }

  async buildOnRampGuidance(
    dto: OnRampRequestDto,
    reference: string,
  ): Promise<string[] | null> {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      const targetCurrency: SupportedWireCurrency =
        dto.currency === 'EUR' ? 'EUR' : 'USD';
      const instructions = await this.fetchWireInstructions(targetCurrency);
      if (!instructions) {
        return null;
      }

      return this.formatWireInstructions(dto, reference, instructions);
    } catch (error) {
      this.logger.warn(
        `Unable to retrieve Circle wire instructions: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private async fetchWireInstructions(
    currency: SupportedWireCurrency,
  ): Promise<WireInstruction | null> {
    if (!this.circle || !this.wireAccountId) {
      return null;
    }

    const targetCurrency = currency ?? this.defaultCurrency;
    const response = await this.circle.wires.getBusinessWireAccountInstructions(
      this.wireAccountId,
      targetCurrency,
    );
    return response.data?.data ?? null;
  }

  private formatWireInstructions(
    dto: OnRampRequestDto,
    reference: string,
    instruction: WireInstruction,
  ): string[] {
    const beneficiary = instruction.beneficiary;
    const bank = instruction.beneficiaryBank;
    const lines: string[] = [
      `Initiate a ${dto.currency} wire for ${dto.amount} to the Circle beneficiary listed below.`,
      `Tracking reference: ${instruction.trackingRef ?? reference} (include this in your bank memo field).`,
    ];

    if (beneficiary?.name) {
      lines.push(`Beneficiary: ${beneficiary.name}`);
    }
    if (bank?.name) {
      lines.push(`Beneficiary bank: ${bank.name}`);
    }
    if (bank?.routingNumber) {
      lines.push(`Routing number: ${bank.routingNumber}`);
    }
    if (bank?.accountNumber) {
      lines.push(`Account number: ${bank.accountNumber}`);
    }
    if (bank?.swiftCode) {
      lines.push(`SWIFT: ${bank.swiftCode}`);
    }
    if (bank?.address) {
      lines.push(`Bank address: ${bank.address}`);
    }

    lines.push(
      `Notify ${dto.contactEmail ?? 'treasury@mon-olith.xyz'} when the wire is released so we can mint USDC to ${dto.destinationWallet}.`,
    );

    return lines;
  }
}
