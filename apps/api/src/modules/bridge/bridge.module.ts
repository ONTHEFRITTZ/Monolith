import { Module } from '@nestjs/common';
import { BridgeService } from './bridge.service';
import { BridgeController } from './bridge.controller';
import { QuoteService } from './quote.service';

@Module({
  providers: [BridgeService, QuoteService],
  controllers: [BridgeController],
})
export class BridgeModule {}
