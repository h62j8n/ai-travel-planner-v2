import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { FlaggedTripDto } from './dto/flagged-trip.dto';
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
}
