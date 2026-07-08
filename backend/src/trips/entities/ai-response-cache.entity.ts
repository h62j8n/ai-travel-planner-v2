import { Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * ai_response_cache 테이블 매핑 엔티티 (ERD §3.7)
 * FK 관계 없이 독립적으로 운영되며, 최초 일정 생성(POST /api/trips) 요청의
 * AI 응답 캐싱에 사용 (PRD §6.8). 재조정 요청에는 적용하지 않음.
 * TODO: 실제 컬럼(cache_key, request_params, response_json, created_at,
 * expires_at)은 다음 단계에서 구현
 */
@Entity('ai_response_cache')
export class AiResponseCache {
  @PrimaryGeneratedColumn('uuid')
  id: string;
}
