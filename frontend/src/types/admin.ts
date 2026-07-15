/**
 * 관리자 화면(품질 모니터링 / 인기 목적지 통계 / 프롬프트 템플릿 관리)용 타입 스켈레톤.
 * PRD 6.5, 6.6, 9절 참고. 실제 API 연동 전이므로 최소 형태만 정의한다.
 */

import type { Trip } from './trip';

export interface FlaggedTripDay {
  trip_id: string;
  destination: string;
  day: number;
  reason: string | null;
  flagged_at: string;
}

/**
 * GET /admin/flagged/:tripId (WBS 4.3) 응답 스키마.
 * 사용자용 GET /trips/:tripId(TripResponseDto)와 1:1 동일한 스키마이므로 별도 정의하지 않고
 * Trip을 그대로 재사용한다.
 */
export type FlaggedTripDetail = Trip;

/** GET /admin/stats/destinations 쿼리 파라미터 `period`. 기본값은 'all'. */
export type DestinationStatsPeriod = 'all' | 'month' | 'week';

/** GET /admin/stats/destinations 응답의 items[] 원소 1건. */
export interface DestinationStatItem {
  rank: number;
  destination: string;
  count: number;
  lastCreatedAt: string;
}

/** GET /admin/stats/destinations 응답 스키마 (frontend-developer/backend-developer 계약). */
export interface DestinationStatsResponse {
  period: DestinationStatsPeriod;
  items: DestinationStatItem[];
}

export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  version: number;
  updated_at: string;
}
