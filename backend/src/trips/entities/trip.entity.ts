import { Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * trips 테이블 매핑 엔티티 (ERD §3.2)
 * TODO: 실제 컬럼(user_id, destination, start_date, end_date, duration_days,
 * budget_level, preferences, summary, revision, created_at, updated_at) 및
 * 관계(User, ItineraryDay, TripRevision)는 다음 단계에서 구현
 */
@Entity('trips')
export class Trip {
  @PrimaryGeneratedColumn('uuid')
  id: string;
}
