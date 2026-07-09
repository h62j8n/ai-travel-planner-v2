import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiErrorCode } from '../exceptions/api-error-code';

interface ErrorPayload {
  error: ApiErrorCode;
  message: string;
}

// HttpStatus는 숫자 enum이지만, exception.getStatus()는 plain number를 반환하므로
// 비교 시 enum-vs-number 타입 불일치 린트 경고를 피하기 위해 number로 캐스팅해 둔다.
const INTERNAL_SERVER_ERROR_STATUS: number = HttpStatus.INTERNAL_SERVER_ERROR;

// ApiErrorCode 유니온에 실제로 속한 값들의 집합.
// NestJS 내장 ValidationPipe/HttpException이 채워 넣는 `error` 필드는
// 'Bad Request', 'Unauthorized' 같은 HTTP reason phrase일 수 있으므로,
// 이 목록에 포함된 값일 때만 신뢰하고 그 외에는 status 기반 기본값으로 폴백한다.
const API_ERROR_CODES: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>([
  'VALIDATION_ERROR',
  'GENERATION_FAILED',
  'AUTH_ERROR',
  'FORBIDDEN',
  'STORAGE_ERROR',
  'NOT_FOUND',
  'INTERNAL_ERROR',
]);

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return (
    typeof value === 'string' && API_ERROR_CODES.has(value as ApiErrorCode)
  );
}

const STATUS_TO_ERROR_CODE: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'AUTH_ERROR',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'STORAGE_ERROR',
};

/**
 * PRD §9 에러 응답 형식 통일: `{ "error": "...", "message": "..." }`
 *
 * NestJS 기본 예외(BadRequestException 등)와 class-validator의 ValidationPipe가
 * 던지는 `{ statusCode, message, error }` 형태, 그리고 AppException이 던지는
 * `{ error, message }` 형태를 모두 위 스펙으로 정규화해서 응답한다.
 * auth 뿐 아니라 trips/admin 등 전체 컨트롤러에 공통 적용되는 전역 필터다.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const { status, payload } = this.resolve(exception);

    if (status >= INTERNAL_SERVER_ERROR_STATUS) {
      this.logger.error(
        `Unhandled exception: ${payload.message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(payload);
  }

  private resolve(exception: unknown): {
    status: number;
    payload: ErrorPayload;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'object' && res !== null) {
        const candidate = res as Partial<ErrorPayload> & {
          message?: string | string[];
        };
        return {
          status,
          payload: {
            error: isApiErrorCode(candidate.error)
              ? candidate.error
              : this.defaultCodeFor(status),
            message:
              this.normalizeMessage(candidate.message) ?? exception.message,
          },
        };
      }

      return {
        status,
        payload: {
          error: this.defaultCodeFor(status),
          message: typeof res === 'string' ? res : exception.message,
        },
      };
    }

    this.logger.error(
      'Unexpected non-HTTP exception',
      exception instanceof Error ? exception.stack : String(exception),
    );
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      payload: {
        error: 'INTERNAL_ERROR',
        message: '서버 오류가 발생했습니다.',
      },
    };
  }

  private normalizeMessage(
    message: string | string[] | undefined,
  ): string | undefined {
    if (Array.isArray(message)) {
      return message.join(' ');
    }
    return message;
  }

  private defaultCodeFor(status: number): ApiErrorCode {
    return STATUS_TO_ERROR_CODE[status] ?? 'INTERNAL_ERROR';
  }
}
