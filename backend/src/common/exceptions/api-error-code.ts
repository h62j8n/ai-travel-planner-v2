/**
 * PRD §9 API 계약에 명시된 에러 코드 전체 집합.
 * 모든 컨트롤러(auth/trips/admin 등)가 공통으로 사용한다.
 */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'GENERATION_FAILED'
  | 'AUTH_ERROR'
  | 'FORBIDDEN'
  | 'STORAGE_ERROR'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR';
