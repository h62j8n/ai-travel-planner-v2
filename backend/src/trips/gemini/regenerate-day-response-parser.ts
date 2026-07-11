import { Logger } from '@nestjs/common';
import { RegenerateDayPromptOtherDay } from './regenerate-day-prompt.builder';

/**
 * 스키마 불일치(필드 누락/타입 불일치) 또는 프롬프트 위반(활동 시간대 범위 이탈 등)을
 * 나타내는 에러. ItineraryRegenerateService가 이 에러 타입으로 "API 호출 실패"와
 * "검증 실패"를 구분해 재시도 로직을 분기한다(PRD §6.3.2, §10과 동일 패턴).
 */
export class RegenerateDayValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegenerateDayValidationError';
  }
}

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const logger = new Logger('RegenerateDayResponseParser');

function fail(message: string): never {
  throw new RegenerateDayValidationError(message);
}

function parseHHMMToMinutes(value: string): number {
  const [hourStr, minuteStr] = value.split(':');
  const hour = Number.parseInt(hourStr, 10);
  const minute = Number.parseInt(minuteStr, 10);
  return hour * 60 + minute;
}

export interface RegenerateDayResponseContext {
  /** 새 활동 id(`d{dayNumber}-a{n}`) 부여에 사용하는 대상 day 번호. */
  dayNumber: number;
  activityTimeStart: string; // "HH:MM"
  activityTimeEnd: string; // "HH:MM"
  /** 다른 day와의 장소/제목 중복 체크에 사용한다. location 완전 일치는 hard-fail(재시도) 사유가 되고, title만 일치하는 경우는 참고용 경고 로그로만 남긴다(아래 checkDuplicateOverlap 주석 참고). */
  otherDays: RegenerateDayPromptOtherDay[];
}

export interface RegeneratedActivity {
  id: string;
  time: string;
  title: string;
  description: string;
  category: string;
  durationMinutes: number;
  location: string;
  estimatedCost: number;
  tips: string | null;
}

export interface RegeneratedDay {
  theme: string;
  activities: RegeneratedActivity[];
}

function normalizeForDuplicateCheck(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * 새로 생성된 활동들이 다른 day의 장소/제목과 겹치는지 검사한다(PRD §6.3.2, WBS 2.8
 * QA 권고사항 반영). 판정 강도를 두 단계로 나눈다:
 *
 * - location 완전 일치(정규화 후) → hard-fail. 이 프롬프트는 location에 "지오코딩이
 *   가능한 구체적 장소명/주소"를 요구하므로(regenerate-day-prompt.builder.ts 요구사항 5),
 *   정규화 후 완전히 같은 문자열이 나왔다는 것은 사실상 동일한 장소를 다시 골랐다는
 *   강한 신호다. 오탐 위험이 낮으므로 fail()을 호출해 RegenerateDayValidationError를
 *   throw한다 — itinerary-regenerate.service.ts의 기존 1회 재시도 인프라(다른 검증
 *   실패와 동일한 경로)에 자연스럽게 편입되어, 재시도까지 실패하면 GENERATION_FAILED(503)로
 *   요청 전체가 실패한다(PRD §10 기존 패턴과 일관).
 * - title만 완전 일치하고 location은 다른 경우 → 경고 로그만 남기고 통과시킨다. title은
 *   스키마상 자유 문장이라("점심 식사", "카페에서 브런치" 등) 서로 다른 실제 장소를 가리키는
 *   활동끼리도 우연히 같은 표현을 쓸 수 있다 — 이 경우까지 hard-fail로 재시도를 유발하면
 *   정상적인 응답을 불필요하게 폐기해 비용만 소모하고 503 위험을 높이는 과잉 조치가 된다.
 */
function checkDuplicateOverlap(
  dayNumber: number,
  activities: RegeneratedActivity[],
  otherDays: RegenerateDayPromptOtherDay[],
): void {
  const otherLocationsBySource = new Map<
    string,
    { dayNumber: number; title: string; location: string }
  >();
  const otherTitles = new Set<string>();
  for (const day of otherDays) {
    for (const activity of day.activities) {
      if (activity.location.trim() !== '') {
        const normalizedLocation = normalizeForDuplicateCheck(
          activity.location,
        );
        if (!otherLocationsBySource.has(normalizedLocation)) {
          otherLocationsBySource.set(normalizedLocation, {
            dayNumber: day.dayNumber,
            title: activity.title,
            location: activity.location,
          });
        }
      }
      if (activity.title.trim() !== '') {
        otherTitles.add(normalizeForDuplicateCheck(activity.title));
      }
    }
  }

  for (const activity of activities) {
    const normalizedLocation = normalizeForDuplicateCheck(activity.location);
    const normalizedTitle = normalizeForDuplicateCheck(activity.title);

    const locationMatch = otherLocationsBySource.get(normalizedLocation);
    if (locationMatch) {
      fail(
        `day=${dayNumber} 새 활동("${activity.title}", location="${activity.location}")이 ${locationMatch.dayNumber}일차 활동("${locationMatch.title}", location="${locationMatch.location}")과 장소가 완전히 겹칩니다. 프롬프트 위반(중복 장소)으로 간주해 재생성을 요청합니다.`,
      );
    }

    if (otherTitles.has(normalizedTitle)) {
      logger.warn(
        `day=${dayNumber} 새 활동("${activity.title}", location="${activity.location}")의 제목이 다른 day의 활동 제목과 겹칩니다(장소는 다름). 참고용으로 로깅합니다(재시도하지 않음).`,
      );
    }
  }
}

/**
 * 일자별 활동 교체 응답을 파싱/검증한다(PRD §6.3.2, WBS 2.3/2.8).
 * activity id는 AI에게 요청하지 않고(스키마에서 제외), 여기서 기존 컨벤션(`d{day}-a{n}`)에
 * 맞춰 순번대로 새로 부여한다.
 */
export function parseAndValidateRegenerateDayResponse(
  rawText: string,
  context: RegenerateDayResponseContext,
): RegeneratedDay {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    fail(`AI 응답이 유효한 JSON이 아닙니다: ${String(error)}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    fail('AI 응답의 최상위 형태가 JSON 객체가 아닙니다.');
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.theme !== 'string' || obj.theme.trim() === '') {
    fail('theme 필드는 비어있지 않은 문자열이어야 합니다.');
  }

  if (!Array.isArray(obj.activities) || obj.activities.length === 0) {
    fail('activities 배열이 비어있거나 존재하지 않습니다.');
  }

  const startMinutes = parseHHMMToMinutes(context.activityTimeStart);
  const endMinutes = parseHHMMToMinutes(context.activityTimeEnd);

  const validatedActivities: RegeneratedActivity[] = (
    obj.activities as unknown[]
  ).map((rawActivity, index) => {
    if (typeof rawActivity !== 'object' || rawActivity === null) {
      fail(`activity ${index + 1}: 항목이 객체가 아닙니다.`);
    }
    const activity = rawActivity as Record<string, unknown>;

    if (typeof activity.title !== 'string' || activity.title.trim() === '') {
      fail(`activity ${index + 1}: title은 비어있지 않은 문자열이어야 합니다.`);
    }
    if (
      typeof activity.description !== 'string' ||
      activity.description.trim() === ''
    ) {
      fail(
        `activity ${index + 1}(title=${activity.title}): description은 비어있지 않은 문자열이어야 합니다.`,
      );
    }
    if (
      typeof activity.category !== 'string' ||
      activity.category.trim() === ''
    ) {
      fail(
        `activity ${index + 1}(title=${activity.title}): category는 비어있지 않은 문자열이어야 합니다.`,
      );
    }
    if (
      typeof activity.location !== 'string' ||
      activity.location.trim() === ''
    ) {
      fail(
        `activity ${index + 1}(title=${activity.title}): location은 비어있지 않은 문자열이어야 합니다.`,
      );
    }
    if (typeof activity.time !== 'string' || !TIME_REGEX.test(activity.time)) {
      fail(
        `activity ${index + 1}(title=${activity.title}): time은 HH:MM(24시간제) 형식이어야 합니다.`,
      );
    }
    const timeMinutes = parseHHMMToMinutes(activity.time);
    if (timeMinutes < startMinutes || timeMinutes > endMinutes) {
      fail(
        `activity ${index + 1}(title=${activity.title}): time(${activity.time})이 활동 시간대(${context.activityTimeStart}~${context.activityTimeEnd}) 범위를 벗어났습니다.`,
      );
    }
    if (
      typeof activity.duration_minutes !== 'number' ||
      !Number.isFinite(activity.duration_minutes) ||
      activity.duration_minutes <= 0
    ) {
      fail(
        `activity ${index + 1}(title=${activity.title}): duration_minutes는 0보다 큰 숫자여야 합니다.`,
      );
    }
    if (
      typeof activity.estimated_cost !== 'number' ||
      !Number.isFinite(activity.estimated_cost) ||
      activity.estimated_cost < 0
    ) {
      fail(
        `activity ${index + 1}(title=${activity.title}): estimated_cost는 0 이상의 숫자여야 합니다.`,
      );
    }
    if (
      activity.tips !== undefined &&
      activity.tips !== null &&
      typeof activity.tips !== 'string'
    ) {
      fail(
        `activity ${index + 1}(title=${activity.title}): tips는 문자열이거나 null이어야 합니다.`,
      );
    }

    return {
      id: `d${context.dayNumber}-a${index + 1}`,
      time: activity.time,
      title: activity.title,
      description: activity.description,
      category: activity.category,
      durationMinutes: Math.round(activity.duration_minutes),
      location: activity.location,
      estimatedCost: Math.round(activity.estimated_cost),
      tips: activity.tips ?? null,
    };
  });

  checkDuplicateOverlap(
    context.dayNumber,
    validatedActivities,
    context.otherDays,
  );

  return {
    theme: obj.theme.trim(),
    activities: validatedActivities,
  };
}
