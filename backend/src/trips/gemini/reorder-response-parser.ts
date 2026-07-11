import { GeneratedActivity } from '../interfaces/generated-itinerary.interface';

/**
 * 재조정 응답 스키마 불일치(필드 누락/타입 불일치) 또는 프롬프트 위반(활동 집합/순서가
 * 요청과 다름, 활동 시간대 범위 이탈 등)을 나타내는 에러.
 * ItineraryReorderService가 이 에러 타입으로 "API 호출 실패"와 "검증 실패"를 구분해
 * 재시도 로직을 분기한다(PRD §6.3 "프롬프트 위반으로 간주해 재시도", §10).
 */
export class ReorderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReorderValidationError';
  }
}

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function fail(message: string): never {
  throw new ReorderValidationError(message);
}

function parseHHMMToMinutes(value: string): number {
  const [hourStr, minuteStr] = value.split(':');
  const hour = Number.parseInt(hourStr, 10);
  const minute = Number.parseInt(minuteStr, 10);
  return hour * 60 + minute;
}

export interface ReorderedActivityTime {
  activityKey: string;
  time: string;
}

/**
 * 시간 재산정 응답을 파싱/검증한다.
 * PRD §6.3 "응답 검증 단계에서 요청하지 않은 day의 activities가 원본과 다르면 프롬프트
 * 위반으로 간주해 재시도"의 재조정(단일 day 내부) 버전으로, 여기서는
 * "응답의 활동 id 집합/순서가 요청한 것과 정확히 같지 않으면 위반"으로 적용한다.
 * 위반 시 ReorderValidationError를 던져 호출부(ItineraryReorderService)가 1회 재시도한다.
 */
export function parseAndValidateReorderTimeResponse(
  rawText: string,
  expectedActivities: GeneratedActivity[],
  activityTimeStart: string,
  activityTimeEnd: string,
): ReorderedActivityTime[] {
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
  if (!Array.isArray(obj.activities)) {
    fail('activities 필드는 배열이어야 합니다.');
  }

  const rawActivities = obj.activities as unknown[];
  if (rawActivities.length !== expectedActivities.length) {
    fail(
      `activities 배열 길이(${rawActivities.length})가 요청한 활동 개수(${expectedActivities.length})와 일치하지 않습니다.`,
    );
  }

  const startMinutes = parseHHMMToMinutes(activityTimeStart);
  const endMinutes = parseHHMMToMinutes(activityTimeEnd);

  const validated: ReorderedActivityTime[] = rawActivities.map(
    (rawActivity, index) => {
      if (typeof rawActivity !== 'object' || rawActivity === null) {
        fail(`activity ${index + 1}: 항목이 객체가 아닙니다.`);
      }
      const activity = rawActivity as Record<string, unknown>;

      if (typeof activity.id !== 'string' || activity.id.trim() === '') {
        fail(`activity ${index + 1}: id는 비어있지 않은 문자열이어야 합니다.`);
      }
      if (
        typeof activity.time !== 'string' ||
        !TIME_REGEX.test(activity.time)
      ) {
        fail(
          `activity ${index + 1}(id=${String(activity.id)}): time은 HH:MM(24시간제) 형식이어야 합니다.`,
        );
      }

      const timeMinutes = parseHHMMToMinutes(activity.time);
      if (timeMinutes < startMinutes || timeMinutes > endMinutes) {
        fail(
          `activity ${index + 1}(id=${activity.id}): time(${activity.time})이 활동 시간대(${activityTimeStart}~${activityTimeEnd}) 범위를 벗어났습니다.`,
        );
      }

      return { activityKey: activity.id, time: activity.time };
    },
  );

  // 응답의 활동 id "순서"가 요청한 순서(new_activity_order 그대로)와 정확히 같은지 검증한다.
  // 순서가 다르면 곧 AI가 순서를 재배열했다는 뜻이므로 프롬프트 위반으로 간주한다.
  const expectedKeysInOrder = expectedActivities.map(
    (activity) => activity.activityKey,
  );
  const actualKeysInOrder = validated.map((entry) => entry.activityKey);
  const sameOrder = expectedKeysInOrder.every(
    (key, index) => key === actualKeysInOrder[index],
  );
  if (!sameOrder) {
    fail(
      `응답의 활동 id 순서가 요청한 순서와 다릅니다(기대=${expectedKeysInOrder.join(',')}, 실제=${actualKeysInOrder.join(',')}).`,
    );
  }

  return validated;
}

/**
 * 검증된 time을 원본 활동에 적용한다. time을 제외한 모든 필드는 원본 그대로(얕은 복사)
 * 유지되어, AI가 다른 필드를 바꿨더라도 애초에 응답 스키마에 없어 반영될 수 없다는 점을
 * 코드로도 한 번 더 보장한다.
 */
export function applyReorderedTimes(
  activities: GeneratedActivity[],
  times: ReorderedActivityTime[],
): GeneratedActivity[] {
  const timeByKey = new Map(
    times.map((entry) => [entry.activityKey, entry.time]),
  );
  return activities.map((activity) => ({
    ...activity,
    time: timeByKey.get(activity.activityKey) ?? activity.time,
  }));
}

/** 동선 판정 사유(reason) 응답을 파싱/검증한다. */
export function parseAndValidateReasonResponse(rawText: string): string {
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
  if (typeof obj.reason !== 'string' || obj.reason.trim() === '') {
    fail('reason 필드는 비어있지 않은 문자열이어야 합니다.');
  }

  return obj.reason.trim();
}
