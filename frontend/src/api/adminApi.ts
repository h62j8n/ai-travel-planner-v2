import apiClient from './client';
import type {
  DestinationStatsPeriod,
  DestinationStatsResponse,
  FlaggedTripDay,
  FlaggedTripDetail,
} from '../types/admin';

/**
 * 관리자 전용 API (WBS 4.3, PRD 6.5, 6.6).
 * role!=admin이면 백엔드가 403을 반환하며, 프론트 접근 가드는 RequireAdmin(router 레벨)이
 * 이미 담당하므로 여기서는 별도 처리를 하지 않는다.
 */

/**
 * GET /admin/flagged-trips:
 * route_warning.flagged=true로 판정된 (trip, day) 조합을 day 단위 flat 리스트로 내려준다.
 * 같은 trip에 flagged day가 여러 개면 trip_id가 중복되는 row로 내려오므로, 화면에서 trip_id
 * 기준으로 그룹핑해서 표시한다.
 */
export async function getFlaggedTrips(): Promise<FlaggedTripDay[]> {
  const { data } = await apiClient.get<FlaggedTripDay[]>('/admin/flagged-trips');
  return data;
}

/**
 * GET /admin/flagged/:tripId:
 * 사용자용 GET /trips/:tripId와 동일한 스키마(days/activities 포함 전체 상세)를 반환한다.
 * 관리자 열람 전용 조회이므로 프론트에서는 읽기 전용으로만 표시한다.
 */
export async function getFlaggedTripDetail(tripId: string): Promise<FlaggedTripDetail> {
  const { data } = await apiClient.get<FlaggedTripDetail>(`/admin/flagged/${tripId}`);
  return data;
}

/**
 * GET /admin/stats/destinations?period=all|month|week:
 * 목적지별 여행 생성(POST /trips) 건수를 집계해 count 내림차순 rank가 매겨진 리스트로 내려준다.
 * period는 POST /trips 시각(created_at) 기준 집계이며, 기본값은 'all'(전체 기간)이다.
 */
export async function getDestinationStats(
  period: DestinationStatsPeriod = 'all',
): Promise<DestinationStatsResponse> {
  const { data } = await apiClient.get<DestinationStatsResponse>('/admin/stats/destinations', {
    params: { period },
  });
  return data;
}
