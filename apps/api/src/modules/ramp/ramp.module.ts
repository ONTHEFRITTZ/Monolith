import { Module } from '@nestjs/common';
import { RampController } from './ramp.controller';
import { RampService } from './ramp.service';

@Module({
  controllers: [RampController],
  providers: [RampService],
})
export class RampModule {}
