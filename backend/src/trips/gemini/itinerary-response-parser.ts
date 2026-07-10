import {
  GeneratedActivity,
  GeneratedDay,
  GeneratedItinerary,
} from '../interfaces/generated-itinerary.interface';

/**
 * Gemini가 실제로 생성해야 하는 필드만 담은 raw 응답 형태(PRD §8.3 중 AI 책임 범위).
 * itinerary-prompt.builder.ts의 buildItineraryResponseSchema()와 1:1로 대응한다.
 */
export interface RawGeneratedActivity {
  id: string;
  time?: string | null;
  title: string;
  description?: string | null;
  category: string;
  duration_minutes?: number | null;
  location?: string | null;
  estimated_cost?: number | null;
  tips?: string | null;
}

export interface RawGeneratedDay {
  day: number;
  theme?: string | null;
  activities: RawGeneratedActivity[];
}

export interface RawGeneratedItinerary {
  summary?: string | null;
  days: RawGeneratedDay[];
}

/**
 * 스키마 불일치(필드 누락/타입 불일치 등)를 나타내는 에러.
 * ItineraryGeneratorService가 이 에러 타입으로 "API 호출 실패"와 "파싱 실패"를 구분해
 * 재시도 로직을 분기한다(PRD §10).
 */
export class ItineraryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ItineraryValidationError';
  }
}

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function fail(message: string): never {
  throw new ItineraryValidationError(message);
}

function isNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

function isNullableNumber(value: unknown): value is number | null | undefined {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

/**
 * Gemini가 응답 텍스트(JSON 문자열)로 반환한 결과를 파싱하고 8.3 스키마와의
 * 정합성을 검증한다. 검증 실패 시 ItineraryValidationError를 던진다(호출부에서 1회 재시도).
 */
export function parseAndValidateItineraryResponse(
  rawText: string,
  durationDays: number,
): RawGeneratedItinerary {
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

  if (!isNullableString(obj.summary)) {
    fail('summary 필드는 문자열이거나 null이어야 합니다.');
  }

  if (!Array.isArray(obj.days)) {
    fail('days 필드는 배열이어야 합니다.');
  }

  const rawDays = obj.days as unknown[];
  if (rawDays.length !== durationDays) {
    fail(
      `days 배열 길이(${rawDays.length})가 duration_days(${durationDays})와 일치하지 않습니다.`,
    );
  }

  const validatedDays: RawGeneratedDay[] = rawDays.map((rawDay, dayIndex) => {
    if (typeof rawDay !== 'object' || rawDay === null) {
      fail(`day ${dayIndex + 1}: 일차 항목이 객체가 아닙니다.`);
    }
    const day = rawDay as Record<string, unknown>;

    if (typeof day.day !== 'number' || day.day !== dayIndex + 1) {
      fail(
        `day 필드는 1부터 순서대로 채워져야 합니다(기대값 ${dayIndex + 1}, 실제값 ${String(day.day)}).`,
      );
    }

    if (!isNullableString(day.theme)) {
      fail(`day ${dayIndex + 1}: theme 필드는 문자열이거나 null이어야 합니다.`);
    }

    if (!Array.isArray(day.activities) || day.activities.length === 0) {
      fail(
        `day ${dayIndex + 1}: activities 배열이 비어있거나 존재하지 않습니다.`,
      );
    }

    const validatedActivities: RawGeneratedActivity[] = (
      day.activities as unknown[]
    ).map((rawActivity, activityIndex) => {
      if (typeof rawActivity !== 'object' || rawActivity === null) {
        fail(
          `day ${dayIndex + 1} activity ${activityIndex + 1}: 활동 항목이 객체가 아닙니다.`,
        );
      }
      const activity = rawActivity as Record<string, unknown>;

      if (typeof activity.id !== 'string' || activity.id.trim() === '') {
        fail(
          `day ${dayIndex + 1} activity ${activityIndex + 1}: id는 비어있지 않은 문자열이어야 합니다.`,
        );
      }
      if (typeof activity.title !== 'string' || activity.title.trim() === '') {
        fail(
          `day ${dayIndex + 1} activity ${activityIndex + 1}: title은 비어있지 않은 문자열이어야 합니다.`,
        );
      }
      if (
        typeof activity.category !== 'string' ||
        activity.category.trim() === ''
      ) {
        fail(
          `day ${dayIndex + 1} activity ${activityIndex + 1}: category는 비어있지 않은 문자열이어야 합니다.`,
        );
      }
      if (
        activity.time !== undefined &&
        activity.time !== null &&
        (typeof activity.time !== 'string' || !TIME_REGEX.test(activity.time))
      ) {
        fail(
          `day ${dayIndex + 1} activity ${activityIndex + 1}: time은 HH:MM(24시간제) 형식이거나 null이어야 합니다.`,
        );
      }
      if (!isNullableString(activity.description)) {
        fail(
          `day ${dayIndex + 1} activity ${activityIndex + 1}: description은 문자열이거나 null이어야 합니다.`,
        );
      }
      if (!isNullableNumber(activity.duration_minutes)) {
        fail(
          `day ${dayIndex + 1} activity ${activityIndex + 1}: duration_minutes는 숫자이거나 null이어야 합니다.`,
        );
      }
      if (!isNullableString(activity.location)) {
        fail(
          `day ${dayIndex + 1} activity ${activityIndex + 1}: location은 문자열이거나 null이어야 합니다.`,
        );
      }
      if (!isNullableNumber(activity.estimated_cost)) {
        fail(
          `day ${dayIndex + 1} activity ${activityIndex + 1}: estimated_cost는 숫자이거나 null이어야 합니다.`,
        );
      }
      if (!isNullableString(activity.tips)) {
        fail(
          `day ${dayIndex + 1} activity ${activityIndex + 1}: tips는 문자열이거나 null이어야 합니다.`,
        );
      }

      return {
        id: activity.id,
        time: activity.time ?? null,
        title: activity.title,
        description: activity.description ?? null,
        category: activity.category,
        duration_minutes: activity.duration_minutes ?? null,
        location: activity.location ?? null,
        estimated_cost: activity.estimated_cost ?? null,
        tips: activity.tips ?? null,
      };
    });

    const seenIds = new Set<string>();
    for (const activity of validatedActivities) {
      if (seenIds.has(activity.id)) {
        fail(
          `day ${dayIndex + 1}: activity id가 중복되었습니다 (${activity.id}).`,
        );
      }
      seenIds.add(activity.id);
    }

    return {
      day: day.day,
      theme: day.theme ?? null,
      activities: validatedActivities,
    };
  });

  return {
    summary: obj.summary ?? null,
    days: validatedDays,
  };
}

/**
 * 검증된 raw 응답을 내부 계약 인터페이스(GeneratedItinerary, camelCase)로 변환한다.
 * route_warning은 Phase 3(WBS 3.5/3.6) 이전이므로 고정값(flagged: false, reason: null)을 채운다.
 */
export function mapRawItineraryToGenerated(
  raw: RawGeneratedItinerary,
): GeneratedItinerary {
  const days: GeneratedDay[] = raw.days.map((rawDay) => {
    const activities: GeneratedActivity[] = rawDay.activities.map(
      (rawActivity) => ({
        activityKey: rawActivity.id,
        time: rawActivity.time ?? null,
        title: rawActivity.title,
        description: rawActivity.description ?? null,
        category: rawActivity.category,
        durationMinutes: rawActivity.duration_minutes ?? null,
        location: rawActivity.location ?? null,
        estimatedCost: rawActivity.estimated_cost ?? null,
        tips: rawActivity.tips ?? null,
      }),
    );

    return {
      dayNumber: rawDay.day,
      theme: rawDay.theme ?? null,
      activities,
      routeWarningFlagged: false,
      routeWarningReason: null,
    };
  });

  return {
    summary: raw.summary ?? null,
    days,
  };
}
