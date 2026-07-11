/**
 * 일자별 활동 교체(regenerate-day) 프롬프트 템플릿 버전 (PRD §6.3.2, WBS 2.2/2.8).
 * 최초 생성(itinerary-prompt.builder.ts), 부분 재조정(reorder-prompt.builder.ts)과 마찬가지로
 * 이후 prompt_templates 테이블로 옮겨 관리자 화면에서 조회/수정할 때(PRD §6.6, WBS 4.5)를
 * 대비해 문자열 템플릿과 버전 식별자를 한 곳에 모아둔다.
 */
export const REGENERATE_DAY_PROMPT_VERSION = 'regenerate-day-v1';

export interface RegenerateDayPromptOtherDayActivity {
  title: string;
  location: string;
}

export interface RegenerateDayPromptOtherDay {
  dayNumber: number;
  theme: string;
  activities: RegenerateDayPromptOtherDayActivity[];
}

export interface RegenerateDayPromptInput {
  destination: string;
  budgetLevel: string;
  activityTimeStart: string; // "HH:MM"
  activityTimeEnd: string; // "HH:MM"
  companion: string;
  preferences: string[];
  durationDays: number;
  targetDay: { dayNumber: number; theme: string };
  /** 대상 day를 제외한 나머지 day 전체(참고용 컨텍스트로만 프롬프트에 포함, 응답에는 나오지 않음). */
  otherDays: RegenerateDayPromptOtherDay[];
}

/**
 * PRD §8.3 출력 스키마 중 "하루(1개 day)"에 해당하는 부분만 요청한다.
 * 최초 생성 스키마(itinerary-prompt.builder.ts)와 달리 activity id는 스키마에 포함하지 않는다
 * — regenerate-day는 대상 day의 활동을 통째로 새로 만드는 것이라 AI가 기존 id 번호 규칙과
 * 충돌 없이 새 id를 매기도록 신경 쓰게 할 이유가 없고, 백엔드(regenerate-day-response-parser.ts)가
 * `d{targetDay}-a{n}` 형식으로 순번을 새로 부여하는 편이 훨씬 안전하다.
 * description/duration_minutes/location/estimated_cost도 최초 생성과 달리 필수(required)로
 * 요청한다 — 이 응답은 화면에 "완전히 교체된 새 활동"으로 그대로 노출되므로 최초 생성보다
 * 필드 완성도를 더 엄격히 요구한다(RegenerateDayResult 계약과 정합).
 */
export function buildRegenerateDayResponseSchema() {
  return {
    type: 'OBJECT',
    properties: {
      theme: {
        type: 'STRING',
        description: '이 day의 새 테마(한 줄, 예: 자연 속 힐링 코스)',
      },
      activities: {
        type: 'ARRAY',
        minItems: 1,
        maxItems: 8,
        items: {
          type: 'OBJECT',
          properties: {
            time: {
              type: 'STRING',
              description: '24시간제 HH:MM 형식 시작 시각',
            },
            title: { type: 'STRING' },
            description: { type: 'STRING' },
            category: {
              type: 'STRING',
              description: '예: 유명 관광지, 맛집, 카페, 액티비티 등',
            },
            duration_minutes: {
              type: 'INTEGER',
              description: '분 단위 정수',
            },
            location: {
              type: 'STRING',
              description: '지오코딩(Nominatim)에 사용할 수 있는 장소명/주소',
            },
            estimated_cost: {
              type: 'INTEGER',
              description:
                '1인 기준 예상 비용(현지 통화 정수, 확실하지 않으면 0)',
            },
            tips: { type: 'STRING', nullable: true },
          },
          required: [
            'time',
            'title',
            'description',
            'category',
            'duration_minutes',
            'location',
            'estimated_cost',
          ],
        },
      },
    },
    required: ['theme', 'activities'],
  };
}

function formatOtherDayForPrompt(day: RegenerateDayPromptOtherDay): string {
  const activityLines = day.activities
    .map(
      (activity, index) =>
        `   ${index + 1}) "${activity.title}" (location="${activity.location}")`,
    )
    .join('\n');

  return [`- ${day.dayNumber}일차 (테마: ${day.theme}):`, activityLines].join(
    '\n',
  );
}

/**
 * 일자별 활동 교체 프롬프트 (PRD §6.3.2, WBS 2.8).
 * - 부분 재조정(reorder-prompt.builder.ts)이 "순서만" 바꾸는 것과 달리, 이 프롬프트는
 *   대상 day의 활동을 전부 새로 만들라고 명시적으로 지시한다(기존 활동은 참고 없이 폐기).
 * - 다른 day들의 모든 활동(제목+장소)을 "참고용 컨텍스트"로만 프롬프트에 포함하고,
 *   "응답에는 절대 포함하지 마라"를 반복 명시해 핵심 불변 규칙(변경 요청한 day 외에는
 *   절대 손대지 않음)을 프롬프트 단계에서부터 강제한다 — 실제로 다른 day 데이터가
 *   응답 스키마 자체에 없으므로(buildRegenerateDayResponseSchema) 구조적으로도 다른 day를
 *   반환할 수 없다.
 * - 다른 day의 장소/경험과 중복되지 않게 만들라는 지시를 강하게 반복한다(PRD §6.3.2 핵심 요구).
 */
export function buildRegenerateDayPrompt(
  input: RegenerateDayPromptInput,
): string {
  const preferencesText = input.preferences.join(', ');
  const otherDaysText =
    input.otherDays.length > 0
      ? input.otherDays.map(formatOtherDayForPrompt).join('\n')
      : '(다른 일차 없음)';

  return [
    '너는 여행 일정을 설계하는 전문 플래너다.',
    '지금 요청은 활동 "순서"만 바꾸는 것이 아니다. 아래 여행 일정 중 특정 하루(1개 day)의 활동 목록 전체를 완전히 새로 생성(교체)하는 요청이다.',
    '이 day에 원래 있던 활동은 모두 폐기되었다고 간주하고, 처음부터 새로운 활동 구성으로 다시 만들어라.',
    '이 요청은 오직 아래 대상 day 하나에 대한 것이다. 다른 day(다른 일차)의 활동 데이터는 아래에 "참고용 컨텍스트"로만 제공되며, 그 day들은 이미 확정되어 변경되지 않는다 — 응답에는 대상 day의 theme/activities만 담고, 다른 day에 대한 내용은 절대 포함하지 마라.',
    '',
    `- 여행지: ${input.destination}`,
    `- 전체 여행 기간: 총 ${input.durationDays}일 중 ${input.targetDay.dayNumber}일차`,
    `- 예산 수준: ${input.budgetLevel}`,
    `- 활동 시간대: ${input.activityTimeStart} ~ ${input.activityTimeEnd}`,
    `- 동반인: ${input.companion}`,
    `- 취향/선호: ${preferencesText}`,
    `- 대상 일차(${input.targetDay.dayNumber}일차) 기존 테마(참고용, 유지하지 않아도 됨): ${input.targetDay.theme}`,
    '',
    '아래는 이미 확정되어 변경되지 않는 다른 일차들의 활동 목록이다(참고용 컨텍스트, 응답에 포함하지 마라):',
    otherDaysText,
    '',
    '요구사항:',
    `1. 응답은 오직 ${input.targetDay.dayNumber}일차 하나에 대한 theme과 activities만 채운다. 다른 일차를 언급하거나 포함하지 마라.`,
    '2. 매우 중요: 위에 나열된 다른 일차의 장소(location)와 활동(title)이 나타내는 경험(예: 같은 명소, 같은 상권, 사실상 동일한 체험)과 겹치지 않는 완전히 새로운 장소들로 구성해라. 목적지 내 다른 지역/다른 카테고리를 적극 활용해 다양성을 확보해라.',
    '3. 오전 → 오후 → 저녁 순서로 지리적으로 합리적인 동선이 되도록 활동을 배치해라(같은 지역/인접 지역 위주로 이동 최소화).',
    `4. time은 24시간제 HH:MM 형식으로, 반드시 활동 시간대(${input.activityTimeStart} ~ ${input.activityTimeEnd}) 범위 안에서만 배정해라. 목록 순서대로 시간이 뒤로 갈수록 증가하도록(같은 시각 중복 금지, 역순 금지) 배정해라. duration_minutes는 분 단위 정수, estimated_cost는 1인 기준 예상 비용(현지 통화 정수, 확실하지 않으면 0)으로 채워라.`,
    '5. location에는 지오코딩이 가능하도록 구체적인 장소명 또는 주소를 적어라.',
    `6. 예산 수준(${input.budgetLevel}), 동반인(${input.companion}), 취향(${preferencesText})을 활동 선택에 실제로 반영해라.`,
    '7. 활동 id는 응답에 포함하지 마라(백엔드가 자동으로 부여한다). 응답은 주어진 JSON 스키마를 그대로 따르고, 스키마에 없는 필드(day, route_warning, last_modified, meta 등)는 포함하지 마라.',
  ].join('\n');
}
