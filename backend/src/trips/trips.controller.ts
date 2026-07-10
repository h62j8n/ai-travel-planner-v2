import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { TripResponseDto } from './dto/trip-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

/**
 * 여행 일정 API (PRD §9). 모든 라우트는 로그인한 사용자만 호출 가능(JwtAuthGuard, §6.1).
 */
@ApiTags('trips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '일정 최초 생성 (동일 조건 재요청 시 ai_response_cache 히트 결과 반환)',
  })
  @ApiResponse({
    status: 200,
    description:
      'PRD §9 API 계약대로 200 OK로 응답. §8.3 스키마 반환(revision=1)',
    type: TripResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR - 입력값 형식 오류',
  })
  @ApiResponse({ status: 401, description: 'AUTH_ERROR - 인증 필요' })
  @ApiResponse({ status: 503, description: 'STORAGE_ERROR - 저장소 연결 실패' })
  create(
    @Body() dto: CreateTripDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TripResponseDto> {
    return this.tripsService.create(dto, user.userId);
  }
}
