import { Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * users 테이블 매핑 엔티티 (ERD §3.1)
 * TODO: 실제 컬럼(email, password_hash, role, created_at) 및 관계는 다음 단계에서 구현
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;
}
