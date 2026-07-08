import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * prompt_templates 테이블 매핑 엔티티 (ERD §3.6)
 * 관리자 전용 AI 프롬프트 템플릿 관리(PRD §6.6, §9 /api/admin/prompt-templates)
 * FK 관계 없이 독립적으로 운영된다.
 */
@Entity('prompt_templates')
export class PromptTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  name: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
