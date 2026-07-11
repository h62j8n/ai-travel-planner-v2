import { GeneratedActivity } from '../interfaces/generated-itinerary.interface';

/**
 * 재조정 시 활동 순서(new_activity_order)에 맞춰 time만 재산정한다(PRD §6.3, §8.3).
 *
 * 규칙 기반(rule-based)으로 구현하고 Gemini는 호출하지 않는다. 근거:
 * - "활동 내용은 그대로, 순서만 바뀐 상태"에서 시작 시각을 다시 배치하는 문제는
 *   duration_minutes 누적 + activity_time_start~end 범위 배분만으로 결정적으로 풀리는
 *   순수 계산 문제라 AI 판단이 필요하지 않다.
 * - 드래그 재조정은 사용자가 반복적으로 누를 수 있는 액션이라, 매번 Gemini를 호출하면
 *   최초 생성보다 총 호출 빈도가 훨씬 커질 수 있다. PRD §7 "실비용 총 $10 이내" 제약상
 *   반복 호출 지점은 최대한 규칙 기반으로 대체하는 것이 안전하다(캐시가 적용되지 않는
 *   구간이라는 점도 CLAUDE.md 핵심 규칙에 명시되어 있어 더욱 그렇다).
 */

/** duration_minutes가 없는 활동에 적용하는 기본 소요 시간(분). */
const DEFAULT_DURATION_MINUTES = 60;
/** 활동 사이 이동/휴식 여유로 두는 기본 버퍼(분). 시간이 부족하면 비례해 줄어든다. */
const DEFAULT_BUFFER_MINUTES = 30;

function parseHHMMToMinutes(value: string): number {
  const [hourStr, minuteStr] = value.split(':');
  const hour = Number.parseInt(hourStr, 10);
  const minute = Number.parseInt(minuteStr, 10);
  return hour * 60 + minute;
}

function formatMinutesToHHMM(totalMinutes: number): string {
  const clamped = Math.max(0, Math.round(totalMinutes));
  const hour = Math.floor(clamped / 60) % 24;
  const minute = clamped % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * activities는 이미 new_activity_order 순서로 정렬되어 들어온다고 가정한다.
 * 반환값은 같은 순서/같은 개수의 새 배열이며, time 필드만 갱신되고 나머지 필드는
 * 원본 그대로(참조가 아닌 얕은 복사)다.
 */
export function reallocateActivityTimes(
  activities: GeneratedActivity[],
  activityTimeStart: string,
  activityTimeEnd: string,
): GeneratedActivity[] {
  if (activities.length === 0) {
    return [];
  }

  const startMinutes = parseHHMMToMinutes(activityTimeStart);
  const endMinutes = parseHHMMToMinutes(activityTimeEnd);
  const windowMinutes = Math.max(0, endMinutes - startMinutes);

  const durations = activities.map(
    (activity) => activity.durationMinutes ?? DEFAULT_DURATION_MINUTES,
  );
  const totalDurationMinutes = durations.reduce((sum, d) => sum + d, 0);
  const gapCount = Math.max(0, activities.length - 1);

  let bufferMinutes = DEFAULT_BUFFER_MINUTES;
  if (gapCount > 0) {
    const remaining = windowMinutes - totalDurationMinutes;
    if (remaining <= 0) {
      // 활동 시간대 안에 다 못 담을 만큼 활동/소요시간이 많음: 버퍼 없이 이어붙인다
      // (duration_minutes 등 활동 내용 자체는 손대지 않는다는 원칙을 지키기 위해
      // 소요시간을 임의로 줄이지 않고, 이동 여유만 0으로 줄인다).
      bufferMinutes = 0;
    } else {
      bufferMinutes = Math.min(DEFAULT_BUFFER_MINUTES, remaining / gapCount);
    }
  }

  let cursorMinutes = startMinutes;
  return activities.map((activity, index) => {
    const time = formatMinutesToHHMM(cursorMinutes);
    cursorMinutes += durations[index] + bufferMinutes;
    return {
      ...activity,
      time,
    };
  });
}
