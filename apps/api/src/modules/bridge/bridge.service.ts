import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateIntentDto, IntentResponseDto } from './dto/create-intent.dto';
import { BridgeIntent, SupportedChain } from './types/bridge.types';

@Injectable()
export class BridgeService {
  private readonly intents = new Map<string, BridgeIntent>();

  createIntent(payload: CreateIntentDto): IntentResponseDto {
    const id = randomUUID();
    const feeBps = this.estimateFeeBps(
      payload.sourceChain,
      payload.destinationChain,
    );
    const estimatedDestinationAmount = this.estimateDestinationAmount(
      payload.amount,
      feeBps,
    );

    const intent: BridgeIntent = {
      id,
      sourceChain: payload.sourceChain,
      sourceToken: payload.sourceToken,
      destinationChain: payload.destinationChain,
      destinationToken: payload.destinationToken,
      amount: payload.amount,
      walletProvider: payload.walletProvider,
      feeBps,
      estimatedDestinationAmount,
      status: 'created',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.intents.set(id, intent);

    return this.mapIntentToResponse(intent);
  }

  getIntentStatus(id: string): IntentResponseDto {
    const intent = this.intents.get(id);
    if (!intent) {
      throw new NotFoundException(`Bridge intent ${id} not found`);
    }

    return this.mapIntentToResponse(intent);
  }

  private estimateFeeBps(
    sourceChain: SupportedChain,
    destinationChain: SupportedChain,
  ): number {
    if (sourceChain === 'solana' || destinationChain === 'solana') {
      return 18; // slightly higher for cross-ecosystem hop
    }

    if (sourceChain !== destinationChain) {
      return 12;
    }

    return 6;
  }

  private estimateDestinationAmount(amount: number, feeBps: number): number {
    const fee = (feeBps / 10_000) * amount;
    return Number((amount - fee).toFixed(6));
  }

  private mapIntentToResponse(intent: BridgeIntent): IntentResponseDto {
    return {
      id: intent.id,
      sourceChain: intent.sourceChain,
      sourceToken: intent.sourceToken,
      destinationChain: intent.destinationChain,
      destinationToken: intent.destinationToken,
      amount: intent.amount,
      feeBps: intent.feeBps,
      estimatedDestinationAmount: intent.estimatedDestinationAmount,
      status: intent.status,
      walletProvider: intent.walletProvider,
    };
  }
}
