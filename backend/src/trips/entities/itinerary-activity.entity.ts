import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ItineraryDay } from './itinerary-day.entity';

/**
 * itinerary_activities 테이블 매핑 엔티티 (ERD §3.4)
 */
@Entity('itinerary_activities')
@Unique('UQ_itinerary_activities_day_order', ['itineraryDayId', 'orderIndex'])
export class ItineraryActivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'itinerary_day_id' })
  itineraryDayId: string;

  @ManyToOne(() => ItineraryDay, (day) => day.activities, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'itinerary_day_id' })
  itineraryDay: ItineraryDay;

  @Column({ type: 'text', name: 'activity_key' })
  activityKey: string;

  @Column({ type: 'int', name: 'order_index' })
  orderIndex: number;

  @Column({ type: 'time', nullable: true })
  time: string | null;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text' })
  category: string;

  @Column({ type: 'int', name: 'duration_minutes', nullable: true })
  durationMinutes: number | null;

  @Column({ type: 'text', nullable: true })
  location: string | null;

  @Column({ type: 'int', name: 'estimated_cost', nullable: true })
  estimatedCost: number | null;

  @Column({ type: 'text', nullable: true })
  tips: string | null;
}
