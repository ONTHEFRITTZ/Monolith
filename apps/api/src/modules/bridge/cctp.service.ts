import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { BridgeKit } from '@circle-fin/bridge-kit';
import { Arbitrum, Ethereum } from '@circle-fin/bridge-kit/chains';
import { createAdapterFromPrivateKey } from '@circle-fin/adapter-viem-v2';
import type { BridgeResult, ChainDefinition } from '@circle-fin/bridge-kit';
import type {
  BridgeSubmissionStatus,
  SupportedChain,
  WalletProvider,
} from './types/bridge.types';

interface CctpTransferRequest {
  intentId: string;
  sourceChain: SupportedChain;
  destinationChain: SupportedChain;
  amount: number;
  walletProvider?: WalletProvider;
  destinationAddress?: string;
}

interface CctpTransferResponse {
  txHash: string;
  status: BridgeSubmissionStatus;
}

type KitAdapterContext = {
  adapter: ReturnType<typeof createAdapterFromPrivateKey>;
  chain: ChainDefinition;
  recipientAddress?: string;
};

@Injectable()
export class CctpService {
  private readonly logger = new Logger(CctpService.name);
  private readonly bridgeKit?: BridgeKit;
  private readonly adapter?: ReturnType<typeof createAdapterFromPrivateKey>;
  private readonly circleEnabled: boolean;
  private readonly chainDefinitions: Partial<
    Record<SupportedChain, ChainDefinition>
  > = {
    ethereum: Ethereum,
    arbitrum: Arbitrum,
  };
  private readonly transferSpeed: 'FAST' | 'SLOW';

  constructor(private readonly configService: ConfigService) {
    const enabled =
      this.configService.get<string>('CIRCLE_CCTP_ENABLED')?.toLowerCase() ===
      'true';
    const speed =
      this.configService
        .get<string>('CIRCLE_CCTP_TRANSFER_SPEED')
        ?.toUpperCase() === 'SLOW'
        ? 'SLOW'
        : 'FAST';
    this.transferSpeed = speed;

    if (enabled) {
      const privateKey = this.configService.get<string>(
        'CIRCLE_BRIDGE_EVM_PRIVATE_KEY',
      );
      if (!privateKey) {
        this.logger.warn(
          'CIRCLE_CCTP_ENABLED is true but CIRCLE_BRIDGE_EVM_PRIVATE_KEY is missing. Falling back to simulated transfers.',
        );
        this.circleEnabled = false;
      } else {
        this.adapter = createAdapterFromPrivateKey({ privateKey });
        this.bridgeKit = new BridgeKit();
        this.circleEnabled = true;
        this.logger.log('Circle Bridge Kit initialised for CCTP transfers.');
      }
    } else {
      this.circleEnabled = false;
    }
  }

  async submitTransfer(
    request: CctpTransferRequest,
  ): Promise<CctpTransferResponse> {
    if (this.circleEnabled) {
      const circleResult = await this.executeWithCircleBridge(request);
      if (circleResult) {
        return circleResult;
      }
    }

    return this.simulateTransfer(request);
  }

  private async executeWithCircleBridge(
    request: CctpTransferRequest,
  ): Promise<CctpTransferResponse | null> {
    if (!this.bridgeKit || !this.adapter) {
      return null;
    }

    const fromContext = this.buildAdapterContext(request.sourceChain);
    const toContext = this.buildAdapterContext(request.destinationChain);

    if (!fromContext || !toContext) {
      this.logger.debug(
        `Circle Bridge Kit does not support ${request.sourceChain} -> ${request.destinationChain}. Falling back to simulation.`,
      );
      return null;
    }

    if (request.destinationAddress) {
      toContext.recipientAddress = request.destinationAddress;
    }

    try {
      const result = await this.bridgeKit.bridge({
        from: fromContext,
        to: toContext,
        amount: request.amount.toString(),
        config: { transferSpeed: this.transferSpeed },
      });

      return {
        txHash: this.extractTxHash(result),
        status: this.mapBridgeState(result.state),
      };
    } catch (error) {
      this.logger.warn(
        `Circle Bridge transfer failed for ${request.intentId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private async simulateTransfer(
    request: CctpTransferRequest,
  ): Promise<CctpTransferResponse> {
    this.logger.log(
      `Simulating CCTP transfer for ${request.intentId} from ${request.sourceChain} to ${request.destinationChain}`,
    );

    const txHash = `0x${randomBytes(32).toString('hex')}`;

    return {
      txHash,
      status: 'awaiting_source',
    };
  }

  private buildAdapterContext(
    chain: SupportedChain,
  ): KitAdapterContext | undefined {
    if (!this.adapter) {
      return undefined;
    }

    const chainDefinition = this.chainDefinitions[chain];
    if (!chainDefinition) {
      return undefined;
    }

    return {
      adapter: this.adapter,
      chain: chainDefinition,
    };
  }

  private extractTxHash(result: BridgeResult): string {
    const stepWithHash = result.steps.find((step) => step.txHash);
    if (stepWithHash?.txHash) {
      return stepWithHash.txHash;
    }
    return `0x${randomBytes(32).toString('hex')}`;
  }

  private mapBridgeState(state: BridgeResult['state']): BridgeSubmissionStatus {
    switch (state) {
      case 'success':
        return 'settled';
      case 'error':
        return 'failed';
      default:
        return 'pending_settlement';
    }
  }
}
