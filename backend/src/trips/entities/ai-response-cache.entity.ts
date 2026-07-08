import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * ai_response_cache 테이블 매핑 엔티티 (ERD §3.7)
 * FK 관계 없이 독립적으로 운영되며, 최초 일정 생성(POST /api/trips) 요청의
 * AI 응답 캐싱에 사용 (PRD §6.8). 재조정 요청에는 적용하지 않음.
 */
@Entity('ai_response_cache')
export class AiResponseCache {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'text', name: 'cache_key', unique: true })
  cacheKey: string;

  @Column({ type: 'jsonb', name: 'request_params' })
  requestParams: unknown;

  @Column({ type: 'jsonb', name: 'response_json' })
  responseJson: unknown;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'expires_at', nullable: true })
  expiresAt: Date | null;
}
