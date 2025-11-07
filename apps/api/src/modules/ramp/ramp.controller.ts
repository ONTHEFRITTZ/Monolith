import { Body, Controller, Post } from '@nestjs/common';
import { RampService } from './ramp.service';
import { OffRampRequestDto, OnRampRequestDto } from './dto/ramp.dto';

@Controller('ramp')
export class RampController {
  constructor(private readonly rampService: RampService) {}

  @Post('on')
  createOnRamp(@Body() payload: OnRampRequestDto) {
    return this.rampService.createOnRampRequest(payload);
  }

  @Post('off')
  createOffRamp(@Body() payload: OffRampRequestDto) {
    return this.rampService.createOffRampRequest(payload);
  }
}
