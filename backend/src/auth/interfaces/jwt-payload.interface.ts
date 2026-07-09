import { UserRole } from '../../users/entities/user.entity';

/**
 * JWT access token에 담기는 payload.
 * DB에 토큰을 저장하지 않으므로(ERD §1, PRD §15) payload 자체가 인가 판단의 근거가 된다.
 */
export interface JwtPayload {
  sub: string; // user.id
  email: string;
  role: UserRole;
}
