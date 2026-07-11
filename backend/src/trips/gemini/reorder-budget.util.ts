/**
 * 재조정(부분 재생성) 시 max_tokens/타임아웃 계산 (PRD §7 실비용 $10 이내, WBS 3.3/3.6).
 *
 * 최초 생성(generation-budget.util.ts)은 duration_days(전체 일수)에 비례해 예산을 잡지만,
 * 재조정은 항상 "day 1개"만 다루고 응답 스키마도 id+time(또는 reason 한 줄)만 요청하도록
 * 최소화되어 있어(reorder-prompt.builder.ts) 활동 "개수" 기준의 훨씬 작은 예산으로 충분하다.
 * 반복 호출(사용자가 드래그를 여러 번 시도할 수 있음) 지점이라는 점에서도 예산을 보수적으로
 * 작게 잡는 것이 비용 절감에 유리하다.
 */

const TIME_BASE_MAX_OUTPUT_TOKENS = 60;
const TIME_TOKENS_PER_ACTIVITY = 25;
const TIME_MAX_OUTPUT_TOKENS_CAP = 800;

const TIME_BASE_TIMEOUT_MS = 8_000;
const TIME_TIMEOUT_PER_ACTIVITY_MS = 800;
const TIME_TIMEOUT_MS_CAP = 20_000;

/** 파싱/검증 실패로 재시도할 때, 잘림 가능성을 줄이기 위해 토큰 여유를 늘리는 배수. */
const RETRY_TOKEN_MULTIPLIER = 1.5;

export interface ReorderBudget {
  maxOutputTokens: number;
  timeoutMs: number;
}

/** 시간 재산정 호출(항상 1회 발생)의 예산을 활동 개수에 비례해 계산한다. */
export function computeReorderTimeBudget(
  activityCount: number,
  options: { isRetry?: boolean } = {},
): ReorderBudget {
  const safeCount = Math.max(1, activityCount);

  let maxOutputTokens = Math.min(
    TIME_BASE_MAX_OUTPUT_TOKENS + TIME_TOKENS_PER_ACTIVITY * safeCount,
    TIME_MAX_OUTPUT_TOKENS_CAP,
  );
  if (options.isRetry) {
    maxOutputTokens = Math.min(
      Math.round(maxOutputTokens * RETRY_TOKEN_MULTIPLIER),
      TIME_MAX_OUTPUT_TOKENS_CAP,
    );
  }

  const timeoutMs = Math.min(
    TIME_BASE_TIMEOUT_MS + TIME_TIMEOUT_PER_ACTIVITY_MS * safeCount,
    TIME_TIMEOUT_MS_CAP,
  );

  return { maxOutputTokens, timeoutMs };
}

/** 동선 판정 사유(reason)는 1~2문장 고정 길이라 활동 개수와 무관한 작은 고정 예산으로 충분하다.
 * flagged=true인 day에서만(전체 재조정 요청 중 일부에서만) 호출되므로 총 비용 기여도가 작다. */
const REASON_MAX_OUTPUT_TOKENS = 150;
const REASON_MAX_OUTPUT_TOKENS_RETRY = 220;
const REASON_TIMEOUT_MS = 8_000;

export function computeReorderReasonBudget(
  options: { isRetry?: boolean } = {},
): ReorderBudget {
  return {
    maxOutputTokens: options.isRetry
      ? REASON_MAX_OUTPUT_TOKENS_RETRY
      : REASON_MAX_OUTPUT_TOKENS,
    timeoutMs: REASON_TIMEOUT_MS,
  };
}
