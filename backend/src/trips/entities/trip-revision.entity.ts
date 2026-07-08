import { Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * trip_revisions 테이블 매핑 엔티티 (ERD §3.5)
 * TODO: 실제 컬럼(trip_id, revision_number, changed_day_number,
 * days_snapshot, created_at) 및 관계(Trip)는 다음 단계에서 구현
 */
@Entity('trip_revisions')
export class TripRevision {
  @PrimaryGeneratedColumn('uuid')
  id: string;
}
