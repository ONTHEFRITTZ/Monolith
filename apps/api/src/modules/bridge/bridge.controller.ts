import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { BridgeService } from './bridge.service';
import { CreateIntentDto, IntentResponseDto } from './dto/create-intent.dto';

@Controller('bridge')
export class BridgeController {
  constructor(private readonly bridgeService: BridgeService) {}

  @Post('intents')
  createIntent(@Body() payload: CreateIntentDto): IntentResponseDto {
    return this.bridgeService.createIntent(payload);
  }

  @Get('intents/:id/status')
  getIntentStatus(@Param('id') id: string): IntentResponseDto {
    return this.bridgeService.getIntentStatus(id);
  }
}
