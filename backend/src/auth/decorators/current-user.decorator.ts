import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { RequestWithUser } from '../interfaces/request-with-user.interface';

/**
 * JwtAuthGuard 통과 후 req.user에 담긴 인증 사용자 정보를 꺼내는 파라미터 데코레이터.
 * 예: signup/login 이후 trips 컨트롤러에서 소유자 확인 등에 사용.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);
