import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Trip } from './trip.entity';

/**
 * trip_revisions 테이블 매핑 엔티티 (ERD §3.5)
 */
@Entity('trip_revisions')
export class TripRevision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'trip_id' })
  tripId: string;

  @ManyToOne(() => Trip, (trip) => trip.tripRevisions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: Trip;

  @Column({ type: 'int', name: 'revision_number' })
  revisionNumber: number;

  @Column({ type: 'int', name: 'changed_day_number', nullable: true })
  changedDayNumber: number | null;

  @Column({ type: 'jsonb', name: 'days_snapshot' })
  daysSnapshot: unknown;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
