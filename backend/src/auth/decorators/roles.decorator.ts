import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../users/entities/user.entity';

export const ROLES_KEY = 'roles';

/**
 * 관리자 API 등 역할 기반 인가가 필요한 핸들러에 붙인다.
 * 반드시 JwtAuthGuard 이후에 RolesGuard가 실행되도록 함께 사용한다.
 * 예: @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
