import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { FlaggedTripDto } from './dto/flagged-trip.dto';
import {
  DESTINATION_STATS_PERIODS,
  DestinationStatsQueryDto,
  DestinationStatsResponseDto,
} from './dto/destination-stats.dto';
import {
  PromptTemplateDto,
  UpdatePromptTemplateDto,
} from './dto/prompt-template.dto';
import { TripResponseDto } from '../trips/dto/trip-response.dto';

/**
 * 관리자 전용 API (PRD §6.6, §9). 모든 라우트는 JWT 인증 + role=admin 인가를 요구한다.
 * 미인증(JWT 없음/무효): 401 AUTH_ERROR, 인증되었지만 role!=admin: 403 FORBIDDEN.
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('flagged-trips')
  @ApiOperation({
    summary: '동선 이상(route_warning.flagged=true) 일자 목록 조회',
  })
  @ApiOkResponse({ type: FlaggedTripDto, isArray: true })
  @ApiResponse({ status: 401, description: 'AUTH_ERROR - 인증 필요' })
  @ApiResponse({
    status: 403,
    description: 'FORBIDDEN - role=admin이 아닌 사용자의 요청',
  })
  getFlaggedTrips(): Promise<FlaggedTripDto[]> {
    return this.adminService.getFlaggedTrips();
  }

  @Get('flagged/:tripId')
  @ApiOperation({
    summary:
      '플래그된 trip 상세 조회 (관리자 열람 모드, PRD §6.5/§6.6 "상세보기")',
  })
  @ApiParam({ name: 'tripId', description: '여행 식별자(trips.id)' })
  @ApiResponse({
    status: 200,
    description:
      '사용자용 GET /trips/{trip_id}와 동일한 스키마(days[]/route_warning 포함). ' +
      '소유권과 무관하게 관리자는 모든 trip을 조회할 수 있다.',
    type: TripResponseDto,
  })
  @ApiResponse({ status: 401, description: 'AUTH_ERROR - 인증 필요' })
  @ApiResponse({
    status: 403,
    description: 'FORBIDDEN - role=admin이 아닌 사용자의 요청',
  })
  @ApiResponse({
    status: 404,
    description: 'NOT_FOUND - 존재하지 않는 trip_id',
  })
  getFlaggedTripDetail(
    @Param('tripId') tripId: string,
  ): Promise<TripResponseDto> {
    return this.adminService.getFlaggedTripDetail(tripId);
  }

  @Get('stats/destinations')
  @ApiOperation({
    summary:
      '인기 목적지 통계 (trips.destination GROUP BY, PRD §6.6/§9, WBS Phase 4.4)',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: DESTINATION_STATS_PERIODS,
    description:
      'all(기본값)=전체 기간, month=이번 달(캘린더 월 기준), week=최근 7일. trips.created_at 기준 필터',
  })
  @ApiOkResponse({
    type: DestinationStatsResponseDto,
    description:
      'destination별 생성 건수 내림차순(동률 시 destination 오름차순) 정렬. ' +
      'rank는 정렬 순서대로 1부터 부여, lastCreatedAt은 해당 destination의 최근 생성일(MAX(created_at))',
  })
  @ApiResponse({ status: 401, description: 'AUTH_ERROR - 인증 필요' })
  @ApiResponse({
    status: 403,
    description: 'FORBIDDEN - role=admin이 아닌 사용자의 요청',
  })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR - period가 all/month/week 중 하나가 아님',
  })
  getDestinationStats(
    @Query() query: DestinationStatsQueryDto,
  ): Promise<DestinationStatsResponseDto> {
    return this.adminService.getDestinationStats(query.period);
  }

  @Get('prompt-templates')
  @ApiOperation({
    summary: '프롬프트 템플릿 전체 목록 조회 (PRD §6.6/§9, WBS Phase 4.5)',
  })
  @ApiOkResponse({
    type: PromptTemplateDto,
    isArray: true,
    description: 'name 오름차순 정렬된 전체 프롬프트 템플릿 목록',
  })
  @ApiResponse({ status: 401, description: 'AUTH_ERROR - 인증 필요' })
  @ApiResponse({
    status: 403,
    description: 'FORBIDDEN - role=admin이 아닌 사용자의 요청',
  })
  getPromptTemplates(): Promise<PromptTemplateDto[]> {
    return this.adminService.getPromptTemplates();
  }

  @Get('prompt-templates/:id')
  @ApiOperation({
    summary: '프롬프트 템플릿 상세 조회 (PRD §6.6/§9, WBS Phase 4.5)',
  })
  @ApiParam({ name: 'id', description: '템플릿 식별자(prompt_templates.id)' })
  @ApiOkResponse({ type: PromptTemplateDto })
  @ApiResponse({ status: 401, description: 'AUTH_ERROR - 인증 필요' })
  @ApiResponse({
    status: 403,
    description: 'FORBIDDEN - role=admin이 아닌 사용자의 요청',
  })
  @ApiResponse({
    status: 404,
    description: 'NOT_FOUND - 존재하지 않는 템플릿 id',
  })
  getPromptTemplateDetail(@Param('id') id: string): Promise<PromptTemplateDto> {
    return this.adminService.getPromptTemplateDetail(id);
  }

  @Put('prompt-templates/:id')
  @ApiOperation({
    summary:
      '프롬프트 템플릿 수정 (PRD §6.6/§9, WBS Phase 4.5). content 변경 시에만 ' +
      'version이 자동으로 +1 되며, 낙관적 락은 도입하지 않아 마지막 저장이 이전 값을 덮어쓴다(ERD §6).',
  })
  @ApiParam({ name: 'id', description: '템플릿 식별자(prompt_templates.id)' })
  @ApiBody({ type: UpdatePromptTemplateDto })
  @ApiOkResponse({ type: PromptTemplateDto })
  @ApiResponse({ status: 401, description: 'AUTH_ERROR - 인증 필요' })
  @ApiResponse({
    status: 403,
    description: 'FORBIDDEN - role=admin이 아닌 사용자의 요청',
  })
  @ApiResponse({
    status: 404,
    description: 'NOT_FOUND - 존재하지 않는 템플릿 id',
  })
  updatePromptTemplate(
    @Param('id') id: string,
    @Body() dto: UpdatePromptTemplateDto,
  ): Promise<PromptTemplateDto> {
    return this.adminService.updatePromptTemplate(id, dto);
  }
}
