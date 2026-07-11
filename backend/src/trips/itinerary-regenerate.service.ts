import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import { GeneratedActivity } from './interfaces/generated-itinerary.interface';
import { NominatimClientService } from './geocoding/nominatim-client.service';
import { LatLon } from './geocoding/haversine.util';
import {
  GeminiApiError,
  GeminiClientService,
} from './gemini/gemini-client.service';
import {
  RegenerateDayPromptOtherDay,
  buildRegenerateDayPrompt,
  buildRegenerateDayResponseSchema,
} from './gemini/regenerate-day-prompt.builder';
import {
  RegenerateDayValidationError,
  RegeneratedActivity,
  RegeneratedDay,
  parseAndValidateRegenerateDayResponse,
} from './gemini/regenerate-day-response-parser';
import { computeGenerationBudget } from './gemini/generation-budget.util';
import {
  buildRouteWarningReasonPrompt,
  buildRouteWarningReasonResponseSchema,
} from './gemini/reorder-prompt.builder';
import { parseAndValidateReasonResponse } from './gemini/reorder-response-parser';
import { computeReorderReasonBudget } from './gemini/reorder-budget.util';
import {
  RouteWarningIssueFact,
  judgeRouteWarning,
} from './route-warning/route-warning-judge.util';

/**
 * 일자별 활동 교체(PRD §6.3.2, §9, WBS 2.8) AI 오케스트레이션 서비스.
 *
 * backend-developer의 PATCH /trips/:id/regenerate-day 컨트롤러/서비스가 이 인터페이스에
 * 의존해 병렬로 구현되므로, 필드명/타입을 임의로 바꾸지 않는다(이 파일은 backend-developer가
 * 만든 스텁을 ai-specialist가 실제 구현으로 교체한 것 — export 시그니처는 스텁과 동일).
 */
export interface RegenerateDayInput {
  destination: string;
  budgetLevel: string;
  activityTimeStart: string;
  activityTimeEnd: string;
  companion: string;
  preferences: string[];
  durationDays: number;
  targetDay: { dayNumber: number; theme: string };
  otherDays: Array<{
    dayNumber: number;
    theme: string;
    activities: Array<{ title: string; location: string }>;
  }>;
}

export interface RegenerateDayResult {
  theme: string;
  routeWarning: { flagged: boolean; reason: string | null };
  activities: Array<{
    id: string;
    time: string;
    title: string;
    description: string;
    category: string;
    durationMinutes: number;
    location: string;
    estimatedCost: number;
    tips: string | null;
  }>;
}

/**
 * 이 서비스는 "대상 day 하나"의 새 활동만 생성해 반환한다. 다른 day의 활동은 프롬프트에
 * "참고용 컨텍스트"로만 전달되고(다른 day를 새로 만들라는 지시나 응답 스키마 자체가 없음),
 * 응답에도 절대 나타나지 않는다 — CLAUDE.md 핵심 불변 규칙("변경 요청한 day 외 나머지 day는
 * 절대 수정하지 않는다")의 1차 방어선이다. 다른 day의 DB row를 실제로 건드리지 않는 persist
 * 로직은 backend-developer 영역이며, 이 서비스는 애초에 다른 day 데이터를 반환하지 않는
 * 방식으로 구조적으로 그 규칙을 뒷받침한다.
 *
 * ItineraryReorderService(순서 변경 전용)와 달리, 이 서비스는 활동을 "새로 생성"하므로
 * time뿐 아니라 title/description/category/location/duration_minutes/estimated_cost/tips까지
 * 모두 AI가 한 번에 채운다(reorder는 id+time만 요청). 처리 순서:
 * 1. Gemini에게 대상 day의 theme+activities 전체를 새로 생성받는다(다른 day는 참고용
 *    컨텍스트로만 전달, 중복 방지 지시 포함). 응답 검증(regenerate-day-response-parser.ts)은
 *    스키마/시간대 위반뿐 아니라 다른 day와 location이 완전히 겹치는 경우도 hard-fail로
 *    간주한다. 1회 실패 시 재시도, 재시도도 실패하면 GENERATION_FAILED로 실패시킨다
 *    (itinerary-generator.service.ts와 동일 패턴, PRD §10).
 * 2. 새로 생성된 각 활동의 location을 Nominatim으로 지오코딩(순차 호출).
 * 3. Haversine 기반 동선 판정(rule-based, flagged 결정). flagged=true인 경우에만 그
 *    판정 근거를 Gemini에 전달해 자연어 reason을 생성한다(flagged=false면 AI 호출 없이
 *    reason:null, PRD §7 비용 절감) — ItineraryReorderService와 동일한 판정 파이프라인을
 *    재사용한다(route-warning-judge.util.ts, reorder-prompt.builder.ts의 reason 생성 프롬프트).
 */
@Injectable()
export class ItineraryRegenerateService {
  private readonly logger = new Logger(ItineraryRegenerateService.name);

  constructor(
    private readonly nominatimClient: NominatimClientService,
    private readonly geminiClient: GeminiClientService,
  ) {}

  async regenerateDay(input: RegenerateDayInput): Promise<RegenerateDayResult> {
    const regeneratedDay = await this.regenerateDayContent(input);

    const activitiesAsGenerated: GeneratedActivity[] =
      this.toGeneratedActivities(regeneratedDay.activities);

    const coordsByActivityKey = await this.geocodeActivities(
      regeneratedDay.activities,
      input.destination,
    );

    const judgement = judgeRouteWarning(
      activitiesAsGenerated,
      coordsByActivityKey,
    );

    // flagged=false면 AI를 호출하지 않고 곧바로 reason:null로 처리한다(PRD §7 비용 절감).
    const reason = judgement.flagged
      ? await this.resolveRouteWarningReason(
          input.destination,
          input.targetDay.dayNumber,
          judgement.issues,
          judgement.fallbackReason,
        )
      : null;

    return {
      theme: regeneratedDay.theme,
      routeWarning: { flagged: judgement.flagged, reason },
      activities: regeneratedDay.activities,
    };
  }

  private toGeneratedActivities(
    activities: RegeneratedActivity[],
  ): GeneratedActivity[] {
    return activities.map((activity) => ({
      activityKey: activity.id,
      time: activity.time,
      title: activity.title,
      description: activity.description,
      category: activity.category,
      durationMinutes: activity.durationMinutes,
      location: activity.location,
      estimatedCost: activity.estimatedCost,
      tips: activity.tips,
    }));
  }

  /**
   * 활동 개수만큼 "순차적으로" Nominatim을 호출한다(동시 요청 폭주 금지, WBS 3.5와 동일 정책).
   * 같은 location 문자열이 반복되면 캐시해 중복 호출을 피한다. 실패한 활동은 좌표 없이(null)
   * 결과 맵에 남겨 판정 단계에서 자연스럽게 제외되도록 한다(전체 요청을 실패시키지 않음).
   */
  private async geocodeActivities(
    activities: RegeneratedActivity[],
    destination: string,
  ): Promise<Map<string, LatLon | null>> {
    const coordsByActivityKey = new Map<string, LatLon | null>();
    const coordsByLocation = new Map<string, LatLon | null>();

    for (const activity of activities) {
      const location = activity.location?.trim();
      if (!location) {
        coordsByActivityKey.set(activity.id, null);
        continue;
      }

      if (coordsByLocation.has(location)) {
        coordsByActivityKey.set(
          activity.id,
          coordsByLocation.get(location) ?? null,
        );
        continue;
      }

      let coords: LatLon | null = null;
      try {
        coords = await this.nominatimClient.geocode(location, destination);
      } catch (error) {
        this.logger.warn(
          `지오코딩 중 예상치 못한 오류(location="${location}"): ${String(error)}. 이 활동은 판정에서 제외합니다.`,
        );
        coords = null;
      }

      coordsByLocation.set(location, coords);
      coordsByActivityKey.set(activity.id, coords);
    }

    return coordsByActivityKey;
  }

  /**
   * 일자별 활동 교체(Gemini 호출) 1차 시도 실패 시 1회 재시도하고, 재시도도 실패하면
   * GENERATION_FAILED로 요청 전체를 실패시킨다(itinerary-generator.service.ts /
   * itinerary-reorder.service.ts와 동일 패턴, PRD §10). 폴백(부분 결과 등) 없이 하드
   * 실패로 설계했다 — 이 응답이 곧 화면에 노출될 "그 day의 최종 활동 데이터"이므로,
   * 검증 실패를 조용히 무시하면 프롬프트 위반(다른 day 데이터 유출, 시간대 범위 이탈,
   * 다른 day와의 장소 완전 중복 등)이 사용자에게 그대로 노출될 위험이 있다. 재시도까지
   * 장소 중복이 재현되는 경우도 동일하게 503으로 실패시킨다 — 다른 검증 실패와 다른
   * 예외를 두면 "일부 품질 문제는 그냥 통과시킨다"는 신뢰할 수 없는 신호가 되므로,
   * 일관되게 하드 실패 경로를 유지한다.
   */
  private async regenerateDayContent(
    input: RegenerateDayInput,
  ): Promise<RegeneratedDay> {
    try {
      return await this.regenerateDayContentOnce(input, false);
    } catch (firstError) {
      this.logger.warn(
        `일자별 활동 교체 1차 시도 실패(${this.categorize(firstError)}, day=${input.targetDay.dayNumber}), 1회 재시도합니다: ${String(
          firstError instanceof Error ? firstError.message : firstError,
        )}`,
      );

      try {
        return await this.regenerateDayContentOnce(input, true);
      } catch (secondError) {
        this.logger.error(
          `일자별 활동 교체 재시도도 실패했습니다(${this.categorize(secondError)}, day=${input.targetDay.dayNumber}): ${String(
            secondError instanceof Error ? secondError.message : secondError,
          )}`,
          secondError instanceof Error ? secondError.stack : undefined,
        );

        throw new AppException(
          'GENERATION_FAILED',
          'AI 일자별 활동 재생성에 실패했습니다. 잠시 후 다시 시도해주세요.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    }
  }

  private async regenerateDayContentOnce(
    input: RegenerateDayInput,
    isRetry: boolean,
  ): Promise<RegeneratedDay> {
    // regenerate-day는 항상 "day 1개"만 생성하므로, 최초 생성(전체 duration_days)과 동일한
    // 산식(generation-budget.util.ts)을 durationDays=1로 적용한다 — 한 day 분량의 활동
    // (title/description/category/location/duration_minutes/estimated_cost/tips)을 JSON으로
    // 담기에 충분한 예산이면서도(BASE_MAX_OUTPUT_TOKENS + TOKENS_PER_DAY*1) 별도 예산 유틸을
    // 새로 만들지 않아 실비용 제약(PRD §7)과 무관하게 유지보수 포인트를 줄인다.
    const { maxOutputTokens, timeoutMs } = computeGenerationBudget(1, {
      isRetry,
    });

    const otherDays: RegenerateDayPromptOtherDay[] = input.otherDays;

    const prompt = buildRegenerateDayPrompt({
      destination: input.destination,
      budgetLevel: input.budgetLevel,
      activityTimeStart: input.activityTimeStart,
      activityTimeEnd: input.activityTimeEnd,
      companion: input.companion,
      preferences: input.preferences,
      durationDays: input.durationDays,
      targetDay: input.targetDay,
      otherDays,
    });
    const responseSchema = buildRegenerateDayResponseSchema();

    const rawText = await this.geminiClient.generateContent({
      prompt,
      responseSchema,
      maxOutputTokens,
      timeoutMs,
    });

    return parseAndValidateRegenerateDayResponse(rawText, {
      dayNumber: input.targetDay.dayNumber,
      activityTimeStart: input.activityTimeStart,
      activityTimeEnd: input.activityTimeEnd,
      otherDays,
    });
  }

  /**
   * flagged=true일 때만 호출된다(flagged=false는 이 함수 자체가 호출되지 않아 AI 호출을
   * 피한다, PRD §7). ItineraryReorderService.resolveRouteWarningReason과 동일한 정책:
   * 사유 생성 자체가 재시도까지 실패해도 요청 전체를 실패시키지 않고, judgeRouteWarning이
   * 함께 반환한 템플릿 문장(fallbackReason)으로 대체한다 — flagged 여부는 이미 규칙
   * 기반으로 확정되어 있고 route_warning은 CLAUDE.md 규칙상 사용자 화면에 즉시 노출되어야
   * 하므로, AI의 "문장 표현" 실패를 이유로 이미 확정된 새 활동 결과까지 폐기하는 것은 과도하다.
   */
  private async resolveRouteWarningReason(
    destination: string,
    dayNumber: number,
    issues: RouteWarningIssueFact[],
    fallbackReason: string | null,
  ): Promise<string | null> {
    try {
      return await this.generateReasonOnce(
        destination,
        dayNumber,
        issues,
        false,
      );
    } catch (firstError) {
      this.logger.warn(
        `동선 판정 사유 생성 1차 시도 실패(${this.categorize(firstError)}, day=${dayNumber}), 1회 재시도합니다: ${String(
          firstError instanceof Error ? firstError.message : firstError,
        )}`,
      );

      try {
        return await this.generateReasonOnce(
          destination,
          dayNumber,
          issues,
          true,
        );
      } catch (secondError) {
        this.logger.warn(
          `동선 판정 사유 생성 재시도도 실패해 템플릿 문장으로 대체합니다(day=${dayNumber}): ${String(
            secondError instanceof Error ? secondError.message : secondError,
          )}`,
        );
        return fallbackReason;
      }
    }
  }

  private async generateReasonOnce(
    destination: string,
    dayNumber: number,
    issues: RouteWarningIssueFact[],
    isRetry: boolean,
  ): Promise<string> {
    const { maxOutputTokens, timeoutMs } = computeReorderReasonBudget({
      isRetry,
    });

    const prompt = buildRouteWarningReasonPrompt({
      destination,
      dayNumber,
      issues,
    });
    const responseSchema = buildRouteWarningReasonResponseSchema();

    const rawText = await this.geminiClient.generateContent({
      prompt,
      responseSchema,
      maxOutputTokens,
      timeoutMs,
    });

    return parseAndValidateReasonResponse(rawText);
  }

  /** 로깅용: 실패 원인이 AI 호출 자체 문제인지 응답 검증 문제인지 구분한다(PRD §10). */
  private categorize(
    error: unknown,
  ): 'API_CALL_FAILED' | 'VALIDATION_FAILED' | 'UNKNOWN' {
    if (error instanceof GeminiApiError) {
      return 'API_CALL_FAILED';
    }
    if (error instanceof RegenerateDayValidationError) {
      return 'VALIDATION_FAILED';
    }
    return 'UNKNOWN';
  }
}
