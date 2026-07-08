import { Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * itinerary_activities 테이블 매핑 엔티티 (ERD §3.4)
 * TODO: 실제 컬럼(itinerary_day_id, activity_key, order_index, time, title,
 * description, category, duration_minutes, location, estimated_cost, tips) 및
 * 관계(ItineraryDay)는 다음 단계에서 구현
 */
@Entity('itinerary_activities')
export class ItineraryActivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;
}
