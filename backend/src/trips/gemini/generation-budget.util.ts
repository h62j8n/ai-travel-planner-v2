/**
 * duration_days 비례 동적 max_tokens/타임아웃 계산 (PRD §10, WBS 2.2/2.3).
 * 일수가 늘어날수록 응답(JSON)이 길어지므로, 잘림(truncation)으로 인한 파싱 실패와
 * 불필요하게 긴 타임아웃 대기를 모두 줄이기 위해 duration_days에 비례해 산정한다.
 *
 * 토큰/타임아웃 산식은 실비용 제약(PRD §7, 총 $10 이내)을 고려해 보수적으로 잡되,
 * 하루 평균 3~5개 활동(제목/설명/팁 포함)을 JSON으로 담기에 충분한 여유를 둔다.
 */

const BASE_MAX_OUTPUT_TOKENS = 500;
const TOKENS_PER_DAY = 420;
const MAX_OUTPUT_TOKENS_CAP = 8192;

const BASE_TIMEOUT_MS = 15_000;
const TIMEOUT_PER_DAY_MS = 4_000;
const TIMEOUT_MS_CAP = 60_000;

/** 파싱 실패로 재시도할 때, 잘림 가능성을 줄이기 위해 토큰 여유를 늘리는 배수. */
const RETRY_TOKEN_MULTIPLIER = 1.5;

export interface GenerationBudget {
  maxOutputTokens: number;
  timeoutMs: number;
}

export function computeGenerationBudget(
  durationDays: number,
  options: { isRetry?: boolean } = {},
): GenerationBudget {
  const safeDurationDays = Math.max(1, durationDays);

  let maxOutputTokens = Math.min(
    BASE_MAX_OUTPUT_TOKENS + TOKENS_PER_DAY * safeDurationDays,
    MAX_OUTPUT_TOKENS_CAP,
  );

  if (options.isRetry) {
    maxOutputTokens = Math.min(
      Math.round(maxOutputTokens * RETRY_TOKEN_MULTIPLIER),
      MAX_OUTPUT_TOKENS_CAP,
    );
  }

  const timeoutMs = Math.min(
    BASE_TIMEOUT_MS + TIMEOUT_PER_DAY_MS * safeDurationDays,
    TIMEOUT_MS_CAP,
  );

  return { maxOutputTokens, timeoutMs };
}
