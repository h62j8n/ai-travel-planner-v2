import { CreateTripDto } from '../dto/create-trip.dto';

/**
 * 최초 일정 생성 프롬프트 템플릿 버전.
 * PRD §6.6 "AI 프롬프트 템플릿 조회/수정/버전 관리"(WBS 4.5, Phase 4/관리자 화면)에서
 * 이 템플릿을 조회/수정 대상으로 다룰 예정이다. 지금 단계(WBS 2.2/2.3)에서는 DB 연동 없이
 * 코드 상수로 고정하되, 문자열 템플릿과 버전 식별자를 한 곳에 모아두어
 * 이후 prompt_templates 테이블로 옮길 때 최소 변경으로 이관할 수 있도록 설계했다.
 */
export const INITIAL_ITINERARY_PROMPT_VERSION = 'initial-itinerary-v1';

/**
 * PRD §8.3 출력 스키마 중 AI가 책임지는 부분만 요청한다.
 * last_modified/route_warning/meta/trip_id/duration_days 등은 백엔드가 채우거나
 * 고정값(Phase 3 이전 route_warning stub)으로 처리하므로 스키마에서 의도적으로 제외한다.
 */
export function buildItineraryResponseSchema(durationDays: number) {
  const safeDurationDays = Math.max(1, durationDays);

  return {
    type: 'OBJECT',
    properties: {
      summary: {
        type: 'STRING',
        nullable: true,
        description: '전체 여행 일정 한 줄 요약',
      },
      days: {
        type: 'ARRAY',
        minItems: safeDurationDays,
        maxItems: safeDurationDays,
        items: {
          type: 'OBJECT',
          properties: {
            day: {
              type: 'INTEGER',
              description: '1부터 시작하는 일차 번호',
            },
            theme: {
              type: 'STRING',
              nullable: true,
              description: '해당 일차의 테마(예: 도착 및 시내 탐방)',
            },
            activities: {
              type: 'ARRAY',
              minItems: 1,
              items: {
                type: 'OBJECT',
                properties: {
                  id: {
                    type: 'STRING',
                    description:
                      '활동 고유 id, 형식: d{일차}-a{순번} (예: d1-a1, d1-a2)',
                  },
                  time: {
                    type: 'STRING',
                    nullable: true,
                    description: '24시간제 HH:MM 형식 시작 시각',
                  },
                  title: { type: 'STRING' },
                  description: { type: 'STRING', nullable: true },
                  category: {
                    type: 'STRING',
                    description: '예: 유명 관광지, 맛집, 카페, 액티비티 등',
                  },
                  duration_minutes: { type: 'INTEGER', nullable: true },
                  location: {
                    type: 'STRING',
                    nullable: true,
                    description:
                      '지오코딩(Nominatim)에 사용할 수 있는 장소명/주소',
                  },
                  estimated_cost: {
                    type: 'INTEGER',
                    nullable: true,
                    description: '1인 기준 예상 비용(현지 통화 정수, 모르면 0)',
                  },
                  tips: { type: 'STRING', nullable: true },
                },
                required: ['id', 'title', 'category'],
              },
            },
          },
          required: ['day', 'activities'],
        },
      },
    },
    required: ['days'],
  };
}

/**
 * 최초 일정 생성 프롬프트 (PRD §6.2, §8.1→§8.3 매핑).
 * 부분 재생성 프롬프트(PRD §6.3, WBS 3.3)는 별도 파일에서 다룬다(이번 작업 범위 아님).
 */
export function buildItineraryPrompt(
  dto: CreateTripDto,
  durationDays: number,
): string {
  const preferencesText = dto.preferences.join(', ');

  return [
    '너는 여행 일정을 설계하는 전문 플래너다.',
    '아래 조건에 맞는 여행 일정을 JSON으로만 생성해라. 마크다운 코드블록이나 설명 문장 없이 JSON 객체만 출력해라.',
    '',
    `- 목적지: ${dto.destination}`,
    `- 여행 기간: ${dto.start_date} ~ ${dto.end_date} (총 ${durationDays}일)`,
    `- 예산 수준: ${dto.budget_level}`,
    `- 취향/선호: ${preferencesText}`,
    '',
    '요구사항:',
    `1. days 배열은 정확히 ${durationDays}개여야 하고, day 값은 1부터 ${durationDays}까지 순서대로 하나씩 채워야 한다.`,
    '2. 각 일차(day)는 오전 → 오후 → 저녁 순서로 지리적으로 합리적인 동선이 되도록 활동을 배치해라(같은 지역/인접 지역 위주로 이동 최소화).',
    '3. 각 활동의 id는 "d{일차}-a{순번}" 형식으로 일차 내에서 1부터 순번을 매겨라(예: 1일차는 d1-a1, d1-a2, ...).',
    '4. time은 24시간제 HH:MM 형식, duration_minutes는 분 단위 정수, estimated_cost는 1인 기준 예상 비용(현지 통화 정수, 확실하지 않으면 0)으로 채워라.',
    '5. location에는 지오코딩이 가능하도록 구체적인 장소명 또는 주소를 적어라.',
    `6. 예산 수준(${dto.budget_level})과 취향(${preferencesText})을 활동 선택에 실제로 반영해라.`,
    '7. 응답은 주어진 JSON 스키마를 그대로 따르고, 스키마에 없는 필드(route_warning, last_modified, meta 등)는 포함하지 마라.',
  ].join('\n');
}
