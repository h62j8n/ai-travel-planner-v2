/**
 * 관리자 화면(품질 모니터링 / 인기 목적지 통계 / 프롬프트 템플릿 관리)용 타입 스켈레톤.
 * PRD 6.5, 6.6, 9절 참고. 실제 API 연동 전이므로 최소 형태만 정의한다.
 */

export interface FlaggedTripDay {
  trip_id: string;
  destination: string;
  day: number;
  reason: string | null;
  flagged_at: string;
}

export interface DestinationStat {
  destination: string;
  trip_count: number;
}

export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  version: number;
  updated_at: string;
}
