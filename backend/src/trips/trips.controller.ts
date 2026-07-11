import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { ReorderTripDto } from './dto/reorder-trip.dto';
import { RegenerateDayDto } from './dto/regenerate-day.dto';
import { TripResponseDto } from './dto/trip-response.dto';
import { TripListItemDto } from './dto/trip-list-item.dto';
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

  @Get()
  @ApiOperation({
    summary: '내 저장 목록 조회 (최신순, updated_at DESC)',
  })
  @ApiResponse({
    status: 200,
    description:
      '로그인한 사용자 소유의 trip만 반환. 목록 카드용 경량 스키마(day/activity 상세 제외)이며, ' +
      '각 trip의 flagged_days_count로 route_warning(flagged) 존재 여부를 노출한다. 저장된 여행이 없으면 빈 배열([])',
    type: TripListItemDto,
    isArray: true,
  })
  @ApiResponse({ status: 401, description: 'AUTH_ERROR - 인증 필요' })
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<TripListItemDto[]> {
    return this.tripsService.findAll(user.userId);
  }

  @Get(':tripId')
  @ApiOperation({
    summary: '저장된 일정 상세 조회 (목록 카드 클릭 시 진입)',
  })
  @ApiParam({ name: 'tripId', description: '여행 식별자(trips.id)' })
  @ApiResponse({
    status: 200,
    description: 'PRD §8.3 스키마 전체 반환(days/activities 포함)',
    type: TripResponseDto,
  })
  @ApiResponse({ status: 401, description: 'AUTH_ERROR - 인증 필요' })
  @ApiResponse({
    status: 403,
    description: 'FORBIDDEN - 본인 소유가 아닌 일정 조회 요청',
  })
  @ApiResponse({
    status: 404,
    description: 'NOT_FOUND - 존재하지 않는 trip_id',
  })
  findOne(
    @Param('tripId') tripId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TripResponseDto> {
    return this.tripsService.findOne(tripId, user.userId);
  }

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

  @Post(':tripId/regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '일정 전체 재생성 (입력값은 원본 trip 그대로 유지하고 AI만 새로 호출, 캐시 무시, 새 trip_id 생성)',
  })
  @ApiParam({ name: 'tripId', description: '원본 여행 식별자(trips.id)' })
  @ApiBody({
    description: '요청 바디 없음(입력값은 원본 trip을 그대로 사용)',
    required: false,
    schema: { type: 'object', properties: {}, example: {} },
  })
  @ApiResponse({
    status: 200,
    description:
      'PRD §9 API 계약대로 200 OK로 응답. §8.3 스키마 반환(새로운 trip_id, revision=1). 원본 trip은 저장 목록에 그대로 유지됨',
    type: TripResponseDto,
  })
  @ApiResponse({ status: 401, description: 'AUTH_ERROR - 인증 필요' })
  @ApiResponse({
    status: 403,
    description: 'FORBIDDEN - 본인 소유가 아닌 일정에 대한 재생성 요청',
  })
  @ApiResponse({
    status: 404,
    description: 'NOT_FOUND - 존재하지 않는 trip_id',
  })
  @ApiResponse({
    status: 503,
    description:
      'GENERATION_FAILED/STORAGE_ERROR - AI 생성 실패 또는 저장소 연결 실패',
  })
  regenerate(
    @Param('tripId') tripId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TripResponseDto> {
    return this.tripsService.regenerate(tripId, user.userId);
  }

  @Patch(':tripId/regenerate-day')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '일자별 활동 교체 (해당 day의 활동 전체를 새로 생성, 다른 day는 원본 그대로 유지 및 중복 방지에 활용)',
  })
  @ApiParam({ name: 'tripId', description: '여행 식별자(trips.id)' })
  @ApiResponse({
    status: 200,
    description:
      'PRD §9 API 계약대로 200 OK로 응답. §8.3 스키마 전체 재반환(해당 day만 last_modified: true, revision 1 증가)',
    type: TripResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR - day 범위 초과',
  })
  @ApiResponse({ status: 401, description: 'AUTH_ERROR - 인증 필요' })
  @ApiResponse({
    status: 403,
    description: 'FORBIDDEN - 본인 소유가 아닌 일정에 대한 재생성 요청',
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
  regenerateDay(
    @Param('tripId') tripId: string,
    @Body() dto: RegenerateDayDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TripResponseDto> {
    return this.tripsService.regenerateDay(tripId, dto, user.userId);
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
