import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ItineraryDay } from './itinerary-day.entity';
import { TripRevision } from './trip-revision.entity';

/**
 * trips 테이블 매핑 엔티티 (ERD §3.2)
 */
@Entity('trips')
export class Trip {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (user) => user.trips, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index()
  @Column({ type: 'text' })
  destination: string;

  @Column({ type: 'date', name: 'start_date' })
  startDate: string;

  @Column({ type: 'date', name: 'end_date' })
  endDate: string;

  @Column({ type: 'int', name: 'duration_days' })
  durationDays: number;

  @Column({ type: 'varchar', length: 30, name: 'budget_level' })
  budgetLevel: string;

  @Column('text', { array: true })
  preferences: string[];

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'int', default: 1 })
  revision: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => ItineraryDay, (day) => day.trip)
  itineraryDays: ItineraryDay[];

  @OneToMany(() => TripRevision, (revision) => revision.trip)
  tripRevisions: TripRevision[];
}
