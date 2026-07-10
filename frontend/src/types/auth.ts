/**
 * backend/src/auth/dto/auth-response.dto.ts (AuthResponseDto) 기준 타입.
 * POST /auth/signup, POST /auth/login 응답 형태와 일치시킨다.
 */

export type UserRole = 'user' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  user: AuthUser;
}

export interface SignupInput {
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

/** backend/src/common/filters/all-exceptions.filter.ts 기준 에러 응답 형태 */
export interface ApiErrorPayload {
  error: string;
  message: string;
}
