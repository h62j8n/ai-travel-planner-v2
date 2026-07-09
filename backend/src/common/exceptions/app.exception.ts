import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiErrorCode } from './api-error-code';

/**
 * PRD §9 에러 응답 형식 `{ error, message }`을 강제하기 위한 공통 예외 클래스.
 * 서비스 레이어에서 의미 있는 에러 코드를 명시적으로 던지고 싶을 때 사용한다.
 * (예: 이메일 중복가입 → VALIDATION_ERROR, 로그인 실패 → AUTH_ERROR)
 */
export class AppException extends HttpException {
  constructor(
    errorCode: ApiErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ error: errorCode, message }, status);
  }
}
