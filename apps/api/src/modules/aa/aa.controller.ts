import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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
import {
  ProfileResponseDto,
  UpdatePlanRequestDto,
  UpdateProfileSettingsRequestDto,
} from './dto/profile.dto';

@Controller('aa')
export class AaController {
  constructor(private readonly aaService: AaService) {}

  @Post('session')
  async startSession(
    @Body() body: StartSessionRequestDto,
  ): Promise<StartSessionResponseDto> {
    return this.aaService.startSession(body);
  }

  @Post('recovery')
  async saveRecovery(
    @Body() body: SaveRecoveryRequestDto,
  ): Promise<SaveRecoveryResponseDto> {
    return this.aaService.saveRecovery(body);
  }

  @Get('sponsorships')
  estimateSponsorship(
    @Query() query: SponsorshipEstimateRequestDto,
  ): SponsorshipEstimateResponseDto {
    return this.aaService.estimateSponsorship(query.plan);
  }

  @Post('onboard')
  async onboard(@Body() body: OnboardRequestDto): Promise<OnboardResponseDto> {
    return this.aaService.onboard(body);
  }

  @Get('status/:sessionId')
  async getStatus(
    @Param('sessionId') sessionId: string,
  ): Promise<StatusResponseDto> {
    return this.aaService.getStatus(sessionId);
  }

  @Get('profile/:sessionId')
  async getProfile(
    @Param('sessionId') sessionId: string,
  ): Promise<ProfileResponseDto> {
    return this.aaService.getProfile(sessionId);
  }

  @Patch('profile/:sessionId/plan')
  async updatePlan(
    @Param('sessionId') sessionId: string,
    @Body() body: UpdatePlanRequestDto,
  ): Promise<ProfileResponseDto> {
    return this.aaService.updateSponsorshipPlan(sessionId, body);
  }

  @Patch('profile/:sessionId/settings')
  async updateSettings(
    @Param('sessionId') sessionId: string,
    @Body() body: UpdateProfileSettingsRequestDto,
  ): Promise<ProfileResponseDto> {
    return this.aaService.updateProfileSettings(sessionId, body);
  }
}
