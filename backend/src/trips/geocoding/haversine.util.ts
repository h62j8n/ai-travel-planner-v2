/**
 * Haversine 직선거리 계산 (PRD §6.5, §12.5, WBS 3.6).
 * 지구를 완전한 구로 근사하는 표준 Haversine 공식. 실제 도로/보행 경로 거리가 아니라
 * 직선거리이므로 동선 판정 룰(route-warning-judge.util.ts)에서는 이를 보수적인
 * 하한선으로만 사용한다(직선거리 기준으로도 비현실적이면 실제 이동은 더 나쁠 가능성이 큼).
 */

export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** 두 좌표 사이의 직선거리(km)를 반환한다. */
export function haversineDistanceKm(a: LatLon, b: LatLon): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));

  return EARTH_RADIUS_KM * c;
}
