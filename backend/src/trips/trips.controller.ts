import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { ReorderTripDto } from './dto/reorder-trip.dto';
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

  @Patch(':tripId/reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '일자 단위 부분 재조정 (요청한 day만 재계산, 나머지 day는 원본 그대로 유지)',
  })
  @ApiParam({ name: 'tripId', description: '여행 식별자(trips.id)' })
  @ApiResponse({
    status: 200,
    description:
      'PRD §9 API 계약대로 200 OK로 응답. §8.3 스키마 반환(해당 day만 last_modified: true, revision 1 증가)',
    type: TripResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'VALIDATION_ERROR - day 범위 초과 또는 new_activity_order가 기존 활동 집합과 불일치',
  })
  @ApiResponse({ status: 401, description: 'AUTH_ERROR - 인증 필요' })
  @ApiResponse({
    status: 403,
    description: 'FORBIDDEN - 본인 소유가 아닌 일정에 대한 재조정 요청',
  })
  @ApiResponse({
    status: 404,
    description: 'NOT_FOUND - 존재하지 않는 trip_id',
  })
  @ApiResponse({
    status: 503,
    description:
      'GENERATION_FAILED/STORAGE_ERROR - AI 응답 검증 실패 또는 저장소 연결 실패',
  })
  reorder(
    @Param('tripId') tripId: string,
    @Body() dto: ReorderTripDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TripResponseDto> {
    return this.tripsService.reorder(tripId, dto, user.userId);
  }
}
