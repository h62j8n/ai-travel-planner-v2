import { Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * itinerary_days 테이블 매핑 엔티티 (ERD §3.3)
 * TODO: 실제 컬럼(trip_id, day_number, theme, route_warning_flagged,
 * route_warning_reason, last_modified_at) 및 관계(Trip, ItineraryActivity)는
 * 다음 단계에서 구현
 */
@Entity('itinerary_days')
export class ItineraryDay {
  @PrimaryGeneratedColumn('uuid')
  id: string;
}
