import apiClient from './client';
import type { Trip, TripCreateInput } from '../types/trip';

/**
 * backend/src/trips/trips.controller.ts 계약 (PRD 9절):
 * POST /trips -> PRD 8.3 출력 데이터 스펙(Trip, trip_id 포함, revision=1)
 * 동일 조건이 ai_response_cache에 있으면 캐시 결과를 그대로 반환받는다(호출부는 신경쓸 필요 없음).
 * 에러 메시지 추출은 api/authApi.ts의 extractErrorMessage를 그대로 재사용한다.
 */
export async function createTrip(input: TripCreateInput): Promise<Trip> {
  const { data } = await apiClient.post<Trip>('/trips', input);
  return data;
}
