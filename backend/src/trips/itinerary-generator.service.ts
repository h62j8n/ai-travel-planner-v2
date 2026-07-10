import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { CreateTripDto } from './dto/create-trip.dto';
import { GeneratedItinerary } from './interfaces/generated-itinerary.interface';
import { AppException } from '../common/exceptions/app.exception';
import {
  GeminiClientService,
  GeminiApiError,
} from './gemini/gemini-client.service';
import {
  buildItineraryPrompt,
  buildItineraryResponseSchema,
} from './gemini/itinerary-prompt.builder';
import {
  ItineraryValidationError,
  mapRawItineraryToGenerated,
  parseAndValidateItineraryResponse,
} from './gemini/itinerary-response-parser';
import { computeGenerationBudget } from './gemini/generation-budget.util';

/**
 * 최초 일정 생성(WBS 2.2 Gemini API 연동 / 2.3 파싱·검증).
 *
 * - TripsService.resolveItinerary()가 캐시 미스일 때 이 서비스의 generate()를 호출한다.
 *   반환값(GeneratedItinerary)은 그대로 ai_response_cache.response_json에 저장되므로,
 *   동일 입력(캐시 키가 같은 요청)에 대해 매번 AI를 새로 호출하는 것은 캐시 히트 이후에는
 *   발생하지 않는다(비용 절감은 캐시 레이어가 담당, 이 서비스는 캐시 미스 시의 생성만 책임짐).
 * - PRD §10: "AI 호출 실패/파싱 실패 → 구분해서 1회 재시도, duration_days 비례 동적
 *   max_tokens/타임아웃 적용". 아래 generate()는 호출 실패(GeminiApiError)와
 *   스키마 검증 실패(ItineraryValidationError)를 구분해 로깅하되, 재시도는 전체 한 번만
 *   수행한다(실패 원인과 무관하게 두 번째 시도에서도 실패하면 GENERATION_FAILED).
 * - route_warning(동선 판정)은 WBS 3.5/3.6(Phase 3) 범위이므로 이 단계에서는
 *   flagged:false/reason:null 고정값으로 응답한다(itinerary-response-parser.ts에서 처리).
 */
@Injectable()
export class ItineraryGeneratorService {
  private readonly logger = new Logger(ItineraryGeneratorService.name);

  constructor(private readonly geminiClient: GeminiClientService) {}

  async generate(
    dto: CreateTripDto,
    durationDays: number,
  ): Promise<GeneratedItinerary> {
    try {
      return await this.generateOnce(dto, durationDays, false);
    } catch (firstError) {
      this.logger.warn(
        `일정 생성 1차 시도 실패(${this.categorize(firstError)}), 1회 재시도합니다: ${String(
          firstError instanceof Error ? firstError.message : firstError,
        )}`,
      );

      try {
        return await this.generateOnce(dto, durationDays, true);
      } catch (secondError) {
        this.logger.error(
          `일정 생성 재시도도 실패했습니다(${this.categorize(secondError)}): ${String(
            secondError instanceof Error ? secondError.message : secondError,
          )}`,
          secondError instanceof Error ? secondError.stack : undefined,
        );

        throw new AppException(
          'GENERATION_FAILED',
          'AI 일정 생성에 실패했습니다. 잠시 후 다시 시도해주세요.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    }
  }

  private async generateOnce(
    dto: CreateTripDto,
    durationDays: number,
    isRetry: boolean,
  ): Promise<GeneratedItinerary> {
    const { maxOutputTokens, timeoutMs } = computeGenerationBudget(
      durationDays,
      { isRetry },
    );

    const prompt = buildItineraryPrompt(dto, durationDays);
    const responseSchema = buildItineraryResponseSchema(durationDays);

    const rawText = await this.geminiClient.generateContent({
      prompt,
      responseSchema,
      maxOutputTokens,
      timeoutMs,
    });

    const validated = parseAndValidateItineraryResponse(rawText, durationDays);
    const generated = mapRawItineraryToGenerated(validated);

    if (!generated.summary || generated.summary.trim() === '') {
      generated.summary = `${dto.destination} ${durationDays}일 일정 (${dto.budget_level}, ${dto.preferences.join(', ')})`;
    }

    return generated;
  }

  /** 로깅용: 실패 원인이 AI 호출 자체 문제인지 응답 스키마 문제인지 구분한다(PRD §10). */
  private categorize(
    error: unknown,
  ): 'API_CALL_FAILED' | 'VALIDATION_FAILED' | 'UNKNOWN' {
    if (error instanceof GeminiApiError) {
      return 'API_CALL_FAILED';
    }
    if (error instanceof ItineraryValidationError) {
      return 'VALIDATION_FAILED';
    }
    return 'UNKNOWN';
  }
}
