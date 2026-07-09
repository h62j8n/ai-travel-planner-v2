import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { FlaggedTripDto } from './dto/flagged-trip.dto';

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
  @ApiOkResponse({ type: FlaggedTripDto, isArray: true })
  getFlaggedTrips(): Promise<FlaggedTripDto[]> {
    return this.adminService.getFlaggedTrips();
  }
}
