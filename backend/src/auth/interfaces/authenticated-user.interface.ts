import { UserRole } from '../../users/entities/user.entity';

/**
 * JwtStrategy.validate()의 반환값이자 req.user에 주입되는 타입.
 * 이후 컨트롤러에서 @CurrentUser() 데코레이터로 꺼내 쓴다.
 */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
}
