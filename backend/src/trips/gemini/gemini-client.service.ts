import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Gemini API 호출 자체의 실패(네트워크 오류/타임아웃/HTTP 오류/키 미설정 등)를 나타낸다.
 * ItineraryGeneratorService는 이 에러 타입으로 "AI 호출 실패"와 "파싱 실패"
 * (ItineraryValidationError)를 구분해 재시도 로직을 분기한다(PRD §10).
 */
export class GeminiApiError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'GeminiApiError';
  }
}

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
/**
 * gemini-2.0-flash 계열(-001 포함)과 gemini-2.5-flash-lite는 이 프로젝트 키에서
 * 이미 서비스 종료(404 NOT_FOUND)되어 있음을 실제 API 호출로 확인했다(2026-07-10).
 * gemini-2.5-flash는 호출 자체는 되지만 "thinking" 모델이라 기본적으로 추론 토큰이
 * maxOutputTokens 예산의 상당 부분을 소비해, 일자 수가 늘어나면 JSON 출력이 완성되기 전에
 * 잘려 파싱이 실패하는 문제가 실측으로 재현되었다(1일 일정도 thinkingBudget 미설정 시 재현).
 * 반면 gemini-3.1-flash-lite는 (a) 실제 generateContent 호출이 200으로 성공하고
 * (b) thinking 토큰 소비가 없거나 미미해 기존 토큰 예산(generation-budget.util.ts) 안에서
 * 1~7일 일정 모두 정상 완주(STOP)함을 실측으로 확인했다(2026-07-10, 1/3/5/7일 케이스).
 * lite 등급이라 비용도 더 낮아 실비용 제약(총 $10)에도 유리해 기본값으로 채택한다.
 */
const DEFAULT_MODEL = 'gemini-3.1-flash-lite';

export interface GenerateContentOptions {
  prompt: string;
  responseSchema: unknown;
  maxOutputTokens: number;
  timeoutMs: number;
  temperature?: number;
}

/**
 * Gemini generateContent REST API 호출을 담당하는 저수준 클라이언트(WBS 2.2).
 * - 비용 절감을 위해 gemini-3.1-flash-lite(저비용 lite 등급, 실측으로 호출 성공 확인된 모델)를
 *   기본값으로 사용한다. 실제 모델명/무료티어 한도는 Gemini 쪽 모델 서비스 종료/개편이 잦으므로
 *   주기적으로 Google AI Studio(ListModels)에서 재확인 필요(WBS 6.4, PRD 12.4 비고).
 * - thinkingConfig.thinkingBudget=0으로 "thinking"(추론) 단계를 비활성화한다. thinking 모델은
 *   추론 토큰이 maxOutputTokens 예산을 상당 부분 소비해 JSON 출력이 중간에 잘릴 수 있고,
 *   추론 토큰도 과금 대상이라 비용 측면에서도 불리하다(gemini-2.5-flash로 실측 재현/확인).
 * - Node 18 전역 fetch만 사용하고 별도 SDK는 추가하지 않는다(최소 의존성).
 * - 이 클래스는 HTTP 호출/타임아웃만 책임지고, JSON 파싱/스키마 검증은
 *   itinerary-response-parser.ts에서 별도로 수행한다(관심사 분리 + 재시도 분기).
 */
@Injectable()
export class GeminiClientService {
  private readonly logger = new Logger(GeminiClientService.name);

  constructor(private readonly configService: ConfigService) {}

  private get apiKey(): string | undefined {
    return this.configService.get<string>('GEMINI_API_KEY');
  }

  private get model(): string {
    return this.configService.get<string>('GEMINI_MODEL', DEFAULT_MODEL);
  }

  /**
   * 프롬프트 + JSON 스키마로 Gemini generateContent를 호출하고, 생성된 텍스트(JSON 문자열)를 반환한다.
   * 네트워크 오류/타임아웃/HTTP 오류/응답 형식 이상은 모두 GeminiApiError로 통일해 던진다.
   */
  async generateContent(options: GenerateContentOptions): Promise<string> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw new GeminiApiError(
        'GEMINI_API_KEY가 설정되지 않았습니다. .env에 GEMINI_API_KEY를 추가해주세요.',
      );
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(
      () => controller.abort(),
      options.timeoutMs,
    );

    try {
      const response = await fetch(
        `${GEMINI_API_BASE_URL}/models/${this.model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: options.prompt }],
              },
            ],
            generationConfig: {
              temperature: options.temperature ?? 0.4,
              maxOutputTokens: options.maxOutputTokens,
              responseMimeType: 'application/json',
              responseSchema: options.responseSchema,
              // thinking(추론) 토큰이 출력 예산을 잠식해 JSON이 잘리는 문제를 막고
              // 불필요한 추론 과금을 피하기 위해 thinking을 명시적으로 끈다.
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new GeminiApiError(
          `Gemini API 호출 실패 (status=${response.status}): ${errorBody.slice(0, 500)}`,
        );
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
          finishReason?: string;
        }>;
        promptFeedback?: { blockReason?: string };
      };

      if (data.promptFeedback?.blockReason) {
        throw new GeminiApiError(
          `Gemini가 요청을 차단했습니다(blockReason=${data.promptFeedback.blockReason}).`,
        );
      }

      const text = data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('');

      if (!text || text.trim() === '') {
        throw new GeminiApiError(
          'Gemini 응답에서 텍스트를 찾을 수 없습니다(빈 candidates).',
        );
      }

      return text;
    } catch (error) {
      if (error instanceof GeminiApiError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GeminiApiError(
          `Gemini API 호출이 타임아웃(${options.timeoutMs}ms)되었습니다.`,
          { cause: error },
        );
      }
      throw new GeminiApiError(
        `Gemini API 호출 중 네트워크 오류가 발생했습니다: ${String(error)}`,
        { cause: error },
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
