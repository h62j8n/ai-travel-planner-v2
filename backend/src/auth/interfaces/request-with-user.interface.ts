import { Request } from 'express';
import { AuthenticatedUser } from './authenticated-user.interface';

/**
 * JwtAuthGuard 통과 후 req.user가 채워진 Express Request 타입.
 * CurrentUser 데코레이터, RolesGuard 등에서 재사용한다.
 */
export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}
