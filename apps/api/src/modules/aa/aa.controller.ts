import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AaService } from './aa.service';
import {
  StartSessionRequestDto,
  StartSessionResponseDto,
  StatusResponseDto,
} from './dto/session.dto';
import {
  SaveRecoveryRequestDto,
  SaveRecoveryResponseDto,
} from './dto/recovery.dto';
import { OnboardRequestDto, OnboardResponseDto } from './dto/onboard.dto';
import {
  SponsorshipEstimateRequestDto,
  SponsorshipEstimateResponseDto,
} from './dto/sponsorship.dto';

@Controller('aa')
export class AaController {
  constructor(private readonly aaService: AaService) {}

  @Post('session')
  startSession(@Body() body: StartSessionRequestDto): StartSessionResponseDto {
    return this.aaService.startSession(body);
  }

  @Post('recovery')
  saveRecovery(@Body() body: SaveRecoveryRequestDto): SaveRecoveryResponseDto {
    return this.aaService.saveRecovery(body);
  }

  @Get('sponsorships')
  estimateSponsorship(
    @Query() query: SponsorshipEstimateRequestDto,
  ): SponsorshipEstimateResponseDto {
    return this.aaService.estimateSponsorship(query.plan);
  }

  @Post('onboard')
  onboard(@Body() body: OnboardRequestDto): OnboardResponseDto {
    return this.aaService.onboard(body);
  }

  @Get('status/:sessionId')
  getStatus(@Param('sessionId') sessionId: string): StatusResponseDto {
    return this.aaService.getStatus(sessionId);
  }
}
