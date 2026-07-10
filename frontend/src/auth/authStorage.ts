import type { AuthResponse, AuthUser } from '../types/auth';

/**
 * JWT/사용자 정보 저장소.
 * CLAUDE.md 핵심 불변 규칙: JWT는 반드시 sessionStorage에 저장한다 (localStorage 금지).
 * 로그아웃 시 반드시 비운다.
 */
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

export function saveSession(auth: AuthResponse): void {
  sessionStorage.setItem(TOKEN_KEY, auth.access_token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(auth.user));
}

export function clearSession(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}
