import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Trip } from '../../trips/entities/trip.entity';

export type UserRole = 'user' | 'admin';

/**
 * users 테이블 매핑 엔티티 (ERD §3.1)
 */
@Entity('users')
@Check(`"role" IN ('user', 'admin')`)
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'text', unique: true })
  email: string;

  @Column({ type: 'text', name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'text', default: 'user' })
  role: UserRole;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => Trip, (trip) => trip.user)
  trips: Trip[];
}
