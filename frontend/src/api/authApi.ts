import { isAxiosError } from 'axios';

import apiClient from './client';
import type {
  ApiErrorPayload,
  AuthResponse,
  LoginInput,
  SignupInput,
} from '../types/auth';

/**
 * backend/src/auth/auth.controller.ts 계약:
 * POST /auth/signup, POST /auth/login -> AuthResponseDto
 * POST /auth/logout -> { message: string } (Bearer 토큰 필요)
 */

export async function signup(input: SignupInput): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/signup', input);
  return data;
}

export async function login(input: LoginInput): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/login', input);
  return data;
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout');
}

/**
 * 백엔드 AllExceptionsFilter가 반환하는 `{ error, message }` 형태에서
 * 사용자에게 그대로 노출할 메시지를 추출한다.
 */
export function extractErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<ApiErrorPayload>(error)) {
    return error.response?.data?.message ?? fallback;
  }
  return fallback;
}
