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
import { TempTripResponseDto, TripResponseDto } from './dto/trip-response.dto';
import {
  RegenerateDayTempDto,
  RegenerateSaveDto,
  ReorderTempDto,
  SaveTripDaysDto,
  SaveTripDto,
} from './dto/temp-trip.dto';
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

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '일정 임시 생성 (PRD §6.2.1, v2.5 - DB 저장 없음, 동일 조건 재요청 시 ai_response_cache 히트 결과 반환)',
  })
  @ApiResponse({
    status: 200,
    description:
      '§8.3 스키마에서 trip_id/meta.revision을 제외한 임시 응답(TempTripResponseDto). DB에 어떤 행도 생성되지 않는다.',
    type: TempTripResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR - 입력값 형식 오류',
  })
  @ApiResponse({ status: 401, description: 'AUTH_ERROR - 인증 필요' })
  @ApiResponse({
    status: 503,
    description: 'GENERATION_FAILED - AI 생성 실패',
  })
  generateTemp(@Body() dto: CreateTripDto): Promise<TempTripResponseDto> {
    return this.tripsService.generateTemp(dto);
  }

  @Post('regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '일정 임시 전체 재생성 (PRD §6.2.3, v2.5 - 입력값 유지, 캐시 항상 무시, DB 저장 없음)',
  })
  @ApiResponse({
    status: 200,
    description:
      '§8.3 스키마에서 trip_id/meta.revision을 제외한 임시 응답. 함께 보낸 days[]는 무시하고 8.1 입력값으로 AI를 새로 호출한다.',
    type: TempTripResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR - 입력값 형식 오류',
  })
  @ApiResponse({ status: 401, description: 'AUTH_ERROR - 인증 필요' })
  @ApiResponse({
    status: 503,
    description: 'GENERATION_FAILED - AI 생성 실패',
  })
  regenerateTemp(@Body() dto: CreateTripDto): Promise<TempTripResponseDto> {
    return this.tripsService.regenerateTemp(dto);
  }

  @Patch('reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '일정 임시 재조정 (PRD §6.3.1, §8.2, v2.5 - 요청한 day만 재계산, 나머지 day는 요청받은 그대로 relay, DB 저장 없음)',
  })
  @ApiResponse({
    status: 200,
    description:
      '§8.3 스키마에서 trip_id/meta.revision을 제외한 임시 응답. 대상 day만 last_modified: true',
    type: TempTripResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'VALIDATION_ERROR - day 범위 초과 또는 new_activity_order가 기존 활동 집합과 불일치',
  })
  @ApiResponse({ status: 401, description: 'AUTH_ERROR - 인증 필요' })
  @ApiResponse({
    status: 503,
    description: 'GENERATION_FAILED - AI 응답 검증 실패',
  })
  reorderTemp(@Body() dto: ReorderTempDto): Promise<TempTripResponseDto> {
    return this.tripsService.reorderTemp(dto);
  }

  @Patch('regenerate-day')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '일정 임시 일자별 활동 교체 (PRD §6.3.2, §8.2, v2.5 - 다른 day 정보는 요청받은 days[]에서 서버가 추출, DB 저장 없음)',
  })
  @ApiResponse({
    status: 200,
    description:
      '§8.3 스키마에서 trip_id/meta.revision을 제외한 임시 응답. 대상 day만 새 활동으로 교체, last_modified: true',
    type: TempTripResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR - day 범위 초과',
  })
  @ApiResponse({ status: 401, description: 'AUTH_ERROR - 인증 필요' })
  @ApiResponse({
    status: 503,
    description: 'GENERATION_FAILED - AI 응답 검증 실패',
  })
  regenerateDayTemp(
    @Body() dto: RegenerateDayTempDto,
  ): Promise<TempTripResponseDto> {
    return this.tripsService.regenerateDayTemp(dto);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '일정 저장 (PRD §6.2.2, v2.5 - AI를 다시 호출하지 않고 프론트가 조정한 임시 일정을 그대로 영속화, trip_id 생성/revision=1)',
  })
  @ApiResponse({
    status: 200,
    description:
      'PRD §9 API 계약대로 200 OK로 응답. §8.3 스키마 반환(revision=1)',
    type: TripResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'VALIDATION_ERROR - 입력값 형식 오류 또는 days가 1~duration_days를 중복/누락 없이 포함하지 않음',
  })
  @ApiResponse({ status: 401, description: 'AUTH_ERROR - 인증 필요' })
  @ApiResponse({ status: 503, description: 'STORAGE_ERROR - 저장소 연결 실패' })
  save(
    @Body() dto: SaveTripDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TripResponseDto> {
    return this.tripsService.save(dto, user.userId);
  }

  @Post(':tripId/regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '[미리보기, v2.6] 일정 전체 재생성 (입력값은 원본 trip 그대로 유지하고 AI만 새로 호출, 캐시 무시, DB 미반영)',
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
      'PRD §8.3 "주의" - trip_id/meta.revision이 없는 임시 응답(TempTripResponseDto). ' +
      'DB에는 전혀 반영되지 않는다(원본 trip도 그대로 유지). 저장하려면 ' +
      'POST /trips/{trip_id}/regenerate/save를 호출해야 하며, 그 경우 항상 새 trip_id가 생성된다.',
    type: TempTripResponseDto,
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
    description: 'GENERATION_FAILED - AI 생성 실패',
  })
  regenerate(
    @Param('tripId') tripId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TempTripResponseDto> {
    return this.tripsService.regenerate(tripId, user.userId);
  }

  @Post(':tripId/regenerate/save')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '[커밋, v2.6 신규] 전체 재생성 미리보기 저장 (AI를 다시 호출하지 않고 미리보기 응답을 그대로 새 trip으로 저장, 원본 trip은 그대로 유지)',
  })
  @ApiParam({ name: 'tripId', description: '원본 여행 식별자(trips.id)' })
  @ApiBody({
    description:
      'POST /trips/{trip_id}/regenerate 미리보기 응답을 그대로 전달(summary, days[])',
    type: RegenerateSaveDto,
  })
  @ApiResponse({
    status: 200,
    description:
      'PRD §9 API 계약대로 200 OK로 응답. §8.3 스키마 반환(새로운 trip_id, revision=1). ' +
      '원본 trip은 저장 목록에 그대로 유지됨',
    type: TripResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'VALIDATION_ERROR - days가 1~duration_days를 중복/누락 없이 포함하지 않음',
  })
  @ApiResponse({ status: 401, description: 'AUTH_ERROR - 인증 필요' })
  @ApiResponse({
    status: 403,
    description: 'FORBIDDEN - 본인 소유가 아닌 일정에 대한 저장 요청',
  })
  @ApiResponse({
    status: 404,
    description: 'NOT_FOUND - 존재하지 않는 trip_id',
  })
  @ApiResponse({ status: 503, description: 'STORAGE_ERROR - 저장소 연결 실패' })
  regenerateSave(
    @Param('tripId') tripId: string,
    @Body() dto: RegenerateSaveDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TripResponseDto> {
    return this.tripsService.regenerateSave(tripId, dto, user.userId);
  }

  @Patch(':tripId/regenerate-day')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '[미리보기, v2.6] 일자별 활동 교체 (해당 day의 활동 전체를 새로 생성, 다른 day 정보는 요청받은 days[]에서 추출, DB 미반영)',
  })
  @ApiParam({ name: 'tripId', description: '여행 식별자(trips.id)' })
  @ApiResponse({
    status: 200,
    description:
      'PRD §9 API 계약대로 200 OK로 응답. §8.3 스키마 전체 반환(해당 day만 last_modified: true, ' +
      'trip_id/revision은 DB에 저장된 현재 값 그대로 - 아직 미반영). ' +
      '저장하려면 POST /trips/{trip_id}/save를 호출해야 한다.',
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
    description: 'GENERATION_FAILED - AI 응답 검증 실패',
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
      '[미리보기, v2.6] 일자 단위 부분 재조정 (요청한 day만 재계산, 나머지 day는 요청받은 그대로 relay, DB 미반영)',
  })
  @ApiParam({ name: 'tripId', description: '여행 식별자(trips.id)' })
  @ApiResponse({
    status: 200,
    description:
      'PRD §9 API 계약대로 200 OK로 응답. §8.3 스키마 반환(해당 day만 last_modified: true, ' +
      'trip_id/revision은 DB에 저장된 현재 값 그대로 - 아직 미반영). ' +
      '저장하려면 POST /trips/{trip_id}/save를 호출해야 한다.',
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
    description: 'GENERATION_FAILED - AI 응답 검증 실패',
  })
  reorder(
    @Param('tripId') tripId: string,
    @Body() dto: ReorderTripDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TripResponseDto> {
    return this.tripsService.reorder(tripId, dto, user.userId);
  }

  @Post(':tripId/save')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '[커밋, v2.6 신규] day 단위 미리보기(reorder/regenerate-day) 저장 (같은 trip_id 갱신, revision 1회 증가)',
  })
  @ApiParam({ name: 'tripId', description: '여행 식별자(trips.id)' })
  @ApiBody({
    description:
      '현재 화면에 표시된 최종 일정 전체(days[]). AI를 다시 호출하지 않는다.',
    type: SaveTripDaysDto,
  })
  @ApiResponse({
    status: 200,
    description:
      'PRD §9 API 계약대로 200 OK로 응답. §8.3 스키마 반환(같은 trip_id, revision 1 증가 - ' +
      '여러 day를 모아 저장했어도 1만 증가, changed_day_number는 null로 스냅샷 기록)',
    type: TripResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'VALIDATION_ERROR - days가 1~duration_days를 중복/누락 없이 포함하지 않음',
  })
  @ApiResponse({ status: 401, description: 'AUTH_ERROR - 인증 필요' })
  @ApiResponse({
    status: 403,
    description: 'FORBIDDEN - 본인 소유가 아닌 일정에 대한 저장 요청',
  })
  @ApiResponse({
    status: 404,
    description: 'NOT_FOUND - 존재하지 않는 trip_id',
  })
  @ApiResponse({ status: 503, description: 'STORAGE_ERROR - 저장소 연결 실패' })
  saveExisting(
    @Param('tripId') tripId: string,
    @Body() dto: SaveTripDaysDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TripResponseDto> {
    return this.tripsService.saveExisting(tripId, dto, user.userId);
  }
}
