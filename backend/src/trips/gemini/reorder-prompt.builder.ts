import { GeneratedActivity } from '../interfaces/generated-itinerary.interface';
import { RouteWarningIssueFact } from '../route-warning/route-warning-judge.util';

/**
 * 부분 재조정(재생성) 프롬프트 템플릿 버전.
 * 최초 생성 프롬프트(itinerary-prompt.builder.ts)와 동일하게, 이후 prompt_templates 테이블로
 * 옮겨 관리자 화면에서 조회/수정할 때(PRD §6.6, WBS 4.5)를 대비해 문자열 템플릿과 버전
 * 식별자를 한 곳에 모아둔다. 시간 재산정용/사유 생성용을 별도 버전으로 관리한다(두 프롬프트가
 * 서로 다른 Gemini 호출이므로 독립적으로 개정될 수 있어야 한다).
 */
export const REORDER_TIME_PROMPT_VERSION = 'reorder-time-v1';
export const REORDER_REASON_PROMPT_VERSION = 'reorder-reason-v1';

export interface ReorderTimePromptInput {
  destination: string;
  activityTimeStart: string; // "HH:MM"
  activityTimeEnd: string; // "HH:MM"
  dayNumber: number;
  theme: string | null;
  /** new_activity_order 순서로 이미 정렬되어 전달된다(이 순서를 절대 바꾸지 않는다). */
  activities: GeneratedActivity[];
}

/**
 * PRD §6.3 "변경된 day와 new_activity_order만 AI에 전달하고, 응답도 그 day 하나만 받는다"를
 * 스키마 차원에서 강제한다. id + time만 요청해 (a) AI가 title/description/category/location/
 * estimated_cost/tips 등 다른 필드를 건드릴 여지를 애초에 주지 않고 (b) 최초 생성 대비 응답
 * 토큰을 최소화한다(WBS 3.3, PRD §7 실비용 $10 이내 제약).
 */
export function buildReorderTimeResponseSchema(activityCount: number) {
  const safeCount = Math.max(1, activityCount);

  return {
    type: 'OBJECT',
    properties: {
      activities: {
        type: 'ARRAY',
        minItems: safeCount,
        maxItems: safeCount,
        items: {
          type: 'OBJECT',
          properties: {
            id: {
              type: 'STRING',
              description: '아래 활동 목록의 id를 그대로 반환(추가/변형 금지)',
            },
            time: {
              type: 'STRING',
              description: '24시간제 HH:MM 형식으로 재산정한 시작 시각',
            },
          },
          required: ['id', 'time'],
        },
      },
    },
    required: ['activities'],
  };
}

function formatActivityForPrompt(
  activity: GeneratedActivity,
  index: number,
): string {
  const parts = [
    `${index + 1}. id=${activity.activityKey}`,
    `title="${activity.title}"`,
    `category="${activity.category}"`,
  ];
  if (activity.durationMinutes !== null) {
    parts.push(`duration_minutes=${activity.durationMinutes}`);
  }
  if (activity.location) {
    parts.push(`location="${activity.location}"`);
  }
  return parts.join(', ');
}

/**
 * 부분 재조정(시간 재산정) 프롬프트 (PRD §6.3, WBS 3.3).
 * - 대상 day 하나(활동 목록은 new_activity_order 순서로 이미 정렬된 상태)만 담는다.
 * - "순서를 바꾸지 마라", "time 외 필드는 건드리지 마라", "다른 day는 언급하지 마라"를
 *   명시적으로 반복 강조해 핵심 불변 규칙(변경 요청한 day 외에는 절대 손대지 않음) 위반을
 *   프롬프트 단계에서부터 예방한다(응답 검증은 reorder-response-parser.ts가 2차로 강제).
 */
export function buildReorderTimePrompt(input: ReorderTimePromptInput): string {
  const activityLines = input.activities
    .map((activity, index) => formatActivityForPrompt(activity, index))
    .join('\n');

  return [
    '너는 여행 일정의 활동 시간(time)만 재산정하는 도우미다.',
    '아래는 사용자가 드래그로 순서를 확정한 여행 일정 중 단 하루(1개 day)의 활동 목록이다.',
    '이 순서는 사용자가 이미 확정한 순서이므로 절대 순서를 바꾸지 마라(활동을 추가/삭제/재배열하지 마라).',
    'title/description/category/location/duration_minutes/estimated_cost/tips 등 time을 제외한 모든 필드는 이미 확정되어 있다. 참고만 하고 응답에 포함하거나 변경하지 마라.',
    '이 요청은 오직 아래 day 하나에 대한 것이다. 다른 day(다른 일차)에 대한 데이터나 언급은 요청에 없으니 응답에도 절대 포함하지 마라.',
    '',
    `- 여행지: ${input.destination}`,
    `- ${input.dayNumber}일차 테마: ${input.theme ?? '없음'}`,
    `- 활동 시간대: ${input.activityTimeStart} ~ ${input.activityTimeEnd} (이 범위를 벗어나는 time을 배정하지 마라)`,
    '',
    '활동 목록(이 순서를 그대로 유지):',
    activityLines,
    '',
    '요구사항:',
    '1. 응답은 주어진 JSON 스키마(id + time 배열)만 채워라. 스키마에 없는 필드는 포함하지 마라.',
    `2. 응답에 포함되는 id는 위 목록의 id와 정확히 같아야 하고(추가/누락 금지), 순서도 위 목록과 동일해야 한다(총 ${input.activities.length}개).`,
    `3. time은 24시간제 "HH:MM" 형식이며 반드시 활동 시간대(${input.activityTimeStart}~${input.activityTimeEnd}) 범위 안에서 배정해라.`,
    '4. 각 활동의 duration_minutes와 자연스러운 이동 여유를 고려해, 목록 순서대로 시간이 뒤로 갈수록 증가하도록(같은 시각 중복 금지, 역순 금지) 배정해라.',
  ].join('\n');
}

/**
 * 동선 판정 사유(reason) 생성 프롬프트 (PRD §6.5, WBS 3.6).
 * flagged=true로 이미 규칙 기반(Haversine) 판정이 끝난 뒤에만 호출한다(flagged=false면
 * 이 프롬프트/스키마 자체를 쓰지 않아 불필요한 AI 호출을 피한다, PRD §7).
 * AI는 "판정"을 하지 않고 이미 확정된 사실(issues)을 자연어로 옮기는 역할만 맡는다
 * (사실을 지어내지 못하도록 프롬프트에서 명시적으로 제약).
 */
export function buildRouteWarningReasonPrompt(input: {
  destination: string;
  dayNumber: number;
  issues: RouteWarningIssueFact[];
}): string {
  const issueLines = input.issues
    .map((issue, index) => {
      if (issue.kind === 'tight_schedule') {
        return `${index + 1}. [촉박한 이동] "${issue.fromTitle}" → "${issue.toTitle}": 약 ${issue.distanceKm.toFixed(1)}km, 배정된 이동 시간 ${issue.gapMinutes ?? 0}분`;
      }
      return `${index + 1}. [비효율적 왕복] "${issue.fromTitle}" → "${issue.viaTitle}" → "${issue.toTitle}"(다시 "${issue.fromTitle}" 근처로 복귀)`;
    })
    .join('\n');

  return [
    '너는 여행 동선 문제를 사용자에게 설명하는 도우미다.',
    '아래는 규칙 기반 계산으로 이미 확정된 동선 문제 사실이다. 새로운 사실을 지어내지 말고, 아래 사실만 근거로 사용자가 이해하기 쉬운 한국어 사유를 작성해라.',
    '',
    `- 여행지: ${input.destination}`,
    `- 대상 일차: ${input.dayNumber}일차`,
    '',
    '확정된 문제 사실:',
    issueLines,
    '',
    '요구사항:',
    '1. 응답은 주어진 JSON 스키마(reason 필드 하나)만 채워라.',
    '2. reason은 1~2문장, 100자 이내의 자연스러운 한국어로, 위 사실에 없는 내용을 추가하지 말고 작성해라.',
  ].join('\n');
}

export function buildRouteWarningReasonResponseSchema() {
  return {
    type: 'OBJECT',
    properties: {
      reason: {
        type: 'STRING',
        description: '동선 문제에 대한 1~2문장의 자연스러운 한국어 사유',
      },
    },
    required: ['reason'],
  };
}
