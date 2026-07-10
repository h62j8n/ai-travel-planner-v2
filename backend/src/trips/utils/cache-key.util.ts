import { createHash } from 'node:crypto';
import { CreateTripDto } from '../dto/create-trip.dto';

/**
 * ai_response_cache.cache_key 생성 (PRD §6.8, §8.1, ERD §3.7).
 * "동일 조건(목적지+기간+예산+취향 해시)"을 판단하기 위해, 요청 필드를 정규화한 뒤 해시한다.
 * - destination: 공백 트림 + 소문자 변환(대소문자/양끝 공백 차이로 캐시 미스가 나지 않도록)
 * - preferences: 정렬(선택 순서가 달라도 같은 조건으로 취급)
 * 최초 생성 요청에만 사용하며, 재조정(PATCH .../reorder) 요청에는 적용하지 않는다.
 */
export function buildTripCacheKey(dto: CreateTripDto): string {
  const normalized = {
    destination: dto.destination.trim().toLowerCase(),
    start_date: dto.start_date,
    end_date: dto.end_date,
    budget_level: dto.budget_level.trim(),
    preferences: [...dto.preferences].map((p) => p.trim()).sort(),
  };

  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
