import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { BridgeService } from './bridge.service';
import { CreateIntentDto, IntentResponseDto } from './dto/create-intent.dto';
import {
  ProviderBalancesRequestDto,
  ProviderBalancesResponseDto,
  QuoteRequestDto,
  QuoteResponseDto,
  SubmitBridgeRequestDto,
  SubmitBridgeResponseDto,
} from './dto/balances.dto';

@Controller('bridge')
export class BridgeController {
  constructor(private readonly bridgeService: BridgeService) {}

  @Post('intents')
  async createIntent(
    @Body() payload: CreateIntentDto,
  ): Promise<IntentResponseDto> {
    return this.bridgeService.createIntent(payload);
  }

  @Post('providers/:provider/balances')
  async detectBalances(
    @Param('provider') provider: string,
    @Body() payload: ProviderBalancesRequestDto,
  ): Promise<ProviderBalancesResponseDto> {
    return this.bridgeService.detectBalances(
      provider,
      payload.address,
      payload.chainConnections,
    );
  }

  @Post('quote')
  async quote(@Body() payload: QuoteRequestDto): Promise<QuoteResponseDto> {
    return this.bridgeService.quoteIntent(
      payload.intentId,
      payload.amount,
      payload.slippageBps,
    );
  }

  @Post('submit')
  async submit(
    @Body() payload: SubmitBridgeRequestDto,
  ): Promise<SubmitBridgeResponseDto> {
    return this.bridgeService.submitIntent(
      payload.intentId,
      payload.amount,
      payload.slippageBps,
    );
  }

  @Get('intents/:id/status')
  async getIntentStatus(@Param('id') id: string): Promise<IntentResponseDto> {
    return this.bridgeService.getIntentStatus(id);
  }
}
