import { Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * prompt_templates 테이블 매핑 엔티티 (ERD §3.6)
 * 관리자 전용 AI 프롬프트 템플릿 관리(PRD §6.6, §9 /api/admin/prompt-templates)
 * TODO: 실제 컬럼(name, content, version, is_active, created_at, updated_at)은
 * 다음 단계에서 구현
 */
@Entity('prompt_templates')
export class PromptTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;
}
