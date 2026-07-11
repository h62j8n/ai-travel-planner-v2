import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import { GeneratedActivity } from './interfaces/generated-itinerary.interface';
import { ReorderedDayResult } from './interfaces/reorder-result.interface';
import { NominatimClientService } from './geocoding/nominatim-client.service';
import { LatLon } from './geocoding/haversine.util';
import {
  GeminiApiError,
  GeminiClientService,
} from './gemini/gemini-client.service';
import {
  buildReorderTimePrompt,
  buildReorderTimeResponseSchema,
  buildRouteWarningReasonPrompt,
  buildRouteWarningReasonResponseSchema,
} from './gemini/reorder-prompt.builder';
import {
  ReorderValidationError,
  applyReorderedTimes,
  parseAndValidateReasonResponse,
  parseAndValidateReorderTimeResponse,
} from './gemini/reorder-response-parser';
import {
  computeReorderReasonBudget,
  computeReorderTimeBudget,
} from './gemini/reorder-budget.util';
import {
  RouteWarningIssueFact,
  judgeRouteWarning,
} from './route-warning/route-warning-judge.util';

// trips.service.ts가 ReorderedDayResult/RouteWarningResult를 이 파일 경로에서
// import하고 있어(backend-developer 작성 코드) 하위호환을 위해 재노출한다.
// 원본(canonical) 정의는 interfaces/reorder-result.interface.ts.
export type {
  ReorderedDayResult,
  RouteWarningResult,
} from './interfaces/reorder-result.interface';

export interface ReorderDayInput {
  destination: string;
  activityTimeStart: string; // "HH:MM"
  activityTimeEnd: string; // "HH:MM"
  dayNumber: number;
  theme: string | null;
  /** new_activity_order 순서로 이미 정렬되어 전달된다(내용은 원본 그대로, 순서만 변경됨). */
  activities: GeneratedActivity[];
}

/**
 * 일자 단위 부분 재조정(PRD §6.3, §6.5, WBS 3.3~3.6) 오케스트레이션.
 *
 * 이 서비스는 오직 "그 day 하나"만 입력받고 반환한다. 다른 day 데이터는 애초에
 * 이 서비스로 전달되지 않으므로(TripsService가 이 day의 activities만 넘김), 구조적으로
 * 다른 day를 건드릴 수 없다 — CLAUDE.md 핵심 불변 규칙("변경 요청한 day 외 나머지 day는
 * 절대 수정하지 않는다")의 1차 방어선이다. 2차 방어선은 매 Gemini 호출 응답에 대한 스키마/
 * 활동 집합·순서 검증(reorder-response-parser.ts)이고, 3차 방어선은 반환 직전
 * activityKey 집합 재검증(assertSameActivityKeySet, 아래)이다.
 *
 * 처리 순서:
 * 1. 각 활동의 location을 Nominatim으로 지오코딩(순차 호출, 실패 시 해당 활동만 제외).
 *    time과 무관한 단계라 시간 재산정(2)보다 먼저 수행해도 결과에 영향이 없다.
 * 2. Gemini에게 "이 day의 활동 목록(순서 고정)"만 전달해 time만 재산정받는다
 *    (reorder-prompt.builder.ts / reorder-response-parser.ts). 1회 실패 시 재시도,
 *    재시도도 실패하면 GENERATION_FAILED로 재조정 전체를 실패시킨다(itinerary-generator
 *    .service.ts와 동일 패턴, PRD §10).
 * 3. 재산정된 time과 지오코딩 좌표로 Haversine 기반 동선 판정(rule-based, flagged 결정).
 *    flagged=true인 경우에만 그 판정 근거를 Gemini에 전달해 자연어 reason을 생성한다
 *    (flagged=false면 AI 호출 없이 reason:null, PRD §7 비용 절감).
 * 4. 반환 직전 activityKey 집합이 입력과 정확히 일치하는지 검증(불일치 시 GENERATION_FAILED).
 */
@Injectable()
export class ItineraryReorderService {
  private readonly logger = new Logger(ItineraryReorderService.name);

  constructor(
    private readonly nominatimClient: NominatimClientService,
    private readonly geminiClient: GeminiClientService,
  ) {}

  async reorderDay(input: ReorderDayInput): Promise<ReorderedDayResult> {
    const coordsByActivityKey = await this.geocodeActivities(
      input.activities,
      input.destination,
    );

    const timedActivities = await this.reassignTimes(input);

    const judgement = judgeRouteWarning(timedActivities, coordsByActivityKey);

    // flagged=false면 AI를 호출하지 않고 곧바로 reason:null로 처리한다(PRD §7 비용 절감).
    const reason = judgement.flagged
      ? await this.resolveRouteWarningReason(
          input.destination,
          input.dayNumber,
          judgement.issues,
          judgement.fallbackReason,
        )
      : null;

    this.assertSameActivityKeySet(input.activities, timedActivities);

    return {
      theme: input.theme,
      activities: timedActivities,
      routeWarning: { flagged: judgement.flagged, reason },
    };
  }

  /**
   * 활동 개수만큼 "순차적으로" Nominatim을 호출한다(동시 요청 폭주 금지, WBS 3.5).
   * 같은 location 문자열이 day 안에서 반복되면(예: 같은 숙소가 아침/저녁에 모두 등장)
   * 캐시해 중복 호출을 피한다. 실패한 활동은 좌표 없이(null) 결과 맵에 남겨
   * 판정 단계에서 자연스럽게 제외되도록 한다(전체 재조정을 실패시키지 않음).
   */
  private async geocodeActivities(
    activities: GeneratedActivity[],
    destination: string,
  ): Promise<Map<string, LatLon | null>> {
    const coordsByActivityKey = new Map<string, LatLon | null>();
    const coordsByLocation = new Map<string, LatLon | null>();

    for (const activity of activities) {
      const location = activity.location?.trim();
      if (!location) {
        coordsByActivityKey.set(activity.activityKey, null);
        continue;
      }

      if (coordsByLocation.has(location)) {
        coordsByActivityKey.set(
          activity.activityKey,
          coordsByLocation.get(location) ?? null,
        );
        continue;
      }

      let coords: LatLon | null = null;
      try {
        coords = await this.nominatimClient.geocode(location, destination);
      } catch (error) {
        // NominatimClientService는 실패를 삼키고 null을 반환하도록 설계되어 있지만,
        // 예상치 못한 예외까지 이 경로에서 전체 재조정을 실패시키지 않도록 방어적으로 처리한다.
        this.logger.warn(
          `지오코딩 중 예상치 못한 오류(location="${location}"): ${String(error)}. 이 활동은 판정에서 제외합니다.`,
        );
        coords = null;
      }

      coordsByLocation.set(location, coords);
      coordsByActivityKey.set(activity.activityKey, coords);
    }

    return coordsByActivityKey;
  }

  /**
   * 시간 재산정(Gemini 호출) 1차 시도 실패 시 1회 재시도하고, 재시도도 실패하면
   * GENERATION_FAILED로 재조정 전체를 실패시킨다(itinerary-generator.service.ts와 동일
   * 패턴, PRD §10). 이 단계는 폴백(규칙 기반 재계산 등) 없이 하드 실패로 설계했다 —
   * 응답의 activityKey 집합/순서가 곧 "AI가 실제로 반영한 최종 활동 데이터"이므로, 여기서
   * 조용히 규칙 기반으로 대체하면 사용자에게 "AI가 자연스럽게 다시 짜준다"는 PRD §6.3의
   * 취지와 다른 결과가 아무 신호 없이 노출될 수 있다고 판단했다.
   */
  private async reassignTimes(
    input: ReorderDayInput,
  ): Promise<GeneratedActivity[]> {
    try {
      return await this.reassignTimesOnce(input, false);
    } catch (firstError) {
      this.logger.warn(
        `재조정 시간 재산정 1차 시도 실패(${this.categorize(firstError)}, day=${input.dayNumber}), 1회 재시도합니다: ${String(
          firstError instanceof Error ? firstError.message : firstError,
        )}`,
      );

      try {
        return await this.reassignTimesOnce(input, true);
      } catch (secondError) {
        this.logger.error(
          `재조정 시간 재산정 재시도도 실패했습니다(${this.categorize(secondError)}, day=${input.dayNumber}): ${String(
            secondError instanceof Error ? secondError.message : secondError,
          )}`,
          secondError instanceof Error ? secondError.stack : undefined,
        );

        throw new AppException(
          'GENERATION_FAILED',
          'AI 일정 재조정에 실패했습니다. 잠시 후 다시 시도해주세요.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    }
  }

  private async reassignTimesOnce(
    input: ReorderDayInput,
    isRetry: boolean,
  ): Promise<GeneratedActivity[]> {
    const { maxOutputTokens, timeoutMs } = computeReorderTimeBudget(
      input.activities.length,
      { isRetry },
    );

    const prompt = buildReorderTimePrompt(input);
    const responseSchema = buildReorderTimeResponseSchema(
      input.activities.length,
    );

    const rawText = await this.geminiClient.generateContent({
      prompt,
      responseSchema,
      maxOutputTokens,
      timeoutMs,
    });

    const validatedTimes = parseAndValidateReorderTimeResponse(
      rawText,
      input.activities,
      input.activityTimeStart,
      input.activityTimeEnd,
    );

    return applyReorderedTimes(input.activities, validatedTimes);
  }

  /**
   * flagged=true일 때만 호출된다(flagged=false는 이 함수 자체가 호출되지 않아 AI 호출을
   * 피한다, PRD §7). 시간 재산정과 별도 Gemini 호출로 분리한 이유: flagged 여부와 그 근거
   * (구간별 거리/이동 가능 시간)는 "재산정된 최종 time"에 의존하는 규칙 기반 판정 결과라서,
   * 시간이 아직 정해지지 않은 시점에는 계산할 수 없다 — 즉 한 번의 Gemini 호출 안에서
   * "아직 정해지지 않은 시간에 대한 판정 사유"를 함께 요청할 수 없는 순차적 의존관계다.
   * 대신 flagged인 day에서만 추가 호출이 발생하므로(대부분의 day는 flagged=false로
   * 예상) 총 호출 수 증가는 제한적이다.
   *
   * 사유 생성 자체가 재시도까지 실패해도 재조정 전체를 실패시키지 않는다(의도적 완화 —
   * 시간 재산정의 하드 실패 정책과 다름). flagged 여부는 이미 규칙 기반으로 확정되어 있고
   * route_warning은 CLAUDE.md 규칙상 사용자 화면에 즉시 노출되어야 하므로, AI의 "문장
   * 표현" 실패를 이유로 이미 확정된 시간 재산정 결과까지 폐기하는 것은 과도하다고 판단해
   * judgeRouteWarning이 함께 반환한 템플릿 문장(fallbackReason)으로 대체한다.
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
    if (error instanceof ReorderValidationError) {
      return 'VALIDATION_FAILED';
    }
    return 'UNKNOWN';
  }

  /**
   * 핵심 불변 규칙의 마지막 방어선: 반환할 activities의 activityKey 집합이 입력과
   * 정확히 일치하는지 검증한다(추가/누락 금지). reorder-response-parser.ts가 이미
   * Gemini 응답 단계에서 집합/순서를 검증하지만, 이 서비스 내부에서 activityKey를
   * 실수로 새로 만들거나 지우는 로직이 생기더라도 안전하도록 방어적으로 매 호출마다
   * 다시 검증한다.
   */
  private assertSameActivityKeySet(
    inputActivities: GeneratedActivity[],
    outputActivities: GeneratedActivity[],
  ): void {
    const inputKeys = new Set(
      inputActivities.map((activity) => activity.activityKey),
    );
    const outputKeys = new Set(
      outputActivities.map((activity) => activity.activityKey),
    );

    const sameSize = inputKeys.size === outputKeys.size;
    const sameMembers =
      sameSize && [...inputKeys].every((key) => outputKeys.has(key));

    if (!sameSize || !sameMembers) {
      this.logger.error(
        `재조정 결과의 activityKey 집합이 입력과 다릅니다(입력=${[...inputKeys].join(',')}, 출력=${[...outputKeys].join(',')}).`,
      );
      throw new AppException(
        'GENERATION_FAILED',
        '재조정 처리 중 활동 목록이 손상되어 실패했습니다. 다시 시도해주세요.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
