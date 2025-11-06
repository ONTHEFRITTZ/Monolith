import { Module } from '@nestjs/common';
import { BridgeService } from './bridge.service';
import { BridgeController } from './bridge.controller';
import { QuoteService } from './quote.service';
import { CctpService } from './cctp.service';

@Module({
  providers: [BridgeService, QuoteService, CctpService],
  controllers: [BridgeController],
})
export class BridgeModule {}
