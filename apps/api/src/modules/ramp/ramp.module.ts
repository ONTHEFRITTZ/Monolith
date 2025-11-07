import { Module } from '@nestjs/common';
import { RampController } from './ramp.controller';
import { RampService } from './ramp.service';
import { CircleMintService } from './circle-mint.service';

@Module({
  controllers: [RampController],
  providers: [RampService, CircleMintService],
})
export class RampModule {}
