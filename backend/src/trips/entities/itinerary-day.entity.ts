import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Trip } from './trip.entity';
import { ItineraryActivity } from './itinerary-activity.entity';

/**
 * itinerary_days 테이블 매핑 엔티티 (ERD §3.3)
 */
@Entity('itinerary_days')
@Unique('UQ_itinerary_days_trip_day', ['tripId', 'dayNumber'])
export class ItineraryDay {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'trip_id' })
  tripId: string;

  @ManyToOne(() => Trip, (trip) => trip.itineraryDays, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @Column({ type: 'int', name: 'day_number' })
  dayNumber: number;

  @Column({ type: 'text', nullable: true })
  theme: string | null;

  @Index()
  @Column({ type: 'boolean', name: 'route_warning_flagged', default: false })
  routeWarningFlagged: boolean;

  @Column({ type: 'text', name: 'route_warning_reason', nullable: true })
  routeWarningReason: string | null;

  @Column({
    type: 'timestamptz',
    name: 'last_modified_at',
    nullable: true,
  })
  lastModifiedAt: Date | null;

  @OneToMany(() => ItineraryActivity, (activity) => activity.itineraryDay)
  activities: ItineraryActivity[];
}
