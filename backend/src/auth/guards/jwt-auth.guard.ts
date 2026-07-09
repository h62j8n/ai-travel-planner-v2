import { HttpStatus, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppException } from '../../common/exceptions/app.exception';

/**
 * 모든 인증 필요 API(trips, admin 등)에서 재사용하는 공통 JWT 인증 가드.
 * 실패 시 PRD §9 에러 포맷에 맞춰 AUTH_ERROR(401)로 통일한다.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(err: unknown, user: TUser | false): TUser {
    if (err || !user) {
      throw new AppException(
        'AUTH_ERROR',
        '인증이 필요합니다. 로그인 후 다시 시도해주세요.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return user;
  }
}
