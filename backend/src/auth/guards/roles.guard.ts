import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../../common/exceptions/app.exception';
import { UserRole } from '../../users/entities/user.entity';
import { RequestWithUser } from '../interfaces/request-with-user.interface';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * @Roles(...) 로 지정된 역할만 통과시키는 가드.
 * 반드시 JwtAuthGuard 뒤에 붙여 req.user가 채워진 상태에서 동작해야 한다.
 * 예: GET /admin/flagged-trips 등 admin 전용 API에서 사용(PRD §6.6, §10 - 403 FORBIDDEN).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user || !requiredRoles.includes(user.role)) {
      throw new AppException(
        'FORBIDDEN',
        '접근 권한이 없습니다. 관리자 계정으로 로그인해주세요.',
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
