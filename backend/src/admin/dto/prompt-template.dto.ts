import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { PromptTemplate } from '../entities/prompt-template.entity';

/**
 * GET /api/admin/prompt-templates, GET/PUT /api/admin/prompt-templates/{id} 공용 응답 DTO
 * (ERD §3.6 prompt_templates, PRD §6.6/§9, WBS Phase 4.5).
 * 프론트 frontend/src/types/admin.ts의 PromptTemplate과 필드명을 그대로 맞춘다
 * (updated_at은 snake_case로 직렬화 — 프론트 계약).
 */
export class PromptTemplateDto {
  @ApiProperty({ example: 'a1b2c3d4-...', description: '템플릿 식별자' })
  id: string;

  @ApiProperty({
    example: 'initial_generation',
    description: '템플릿 이름(고유, 수정 불가)',
  })
  name: string;

  @ApiProperty({
    example: '당신은 여행 일정 플래너입니다...',
    description: '프롬프트 본문',
  })
  content: string;

  @ApiProperty({ example: 1, description: '버전(content 변경 시 자동 +1)' })
  version: number;

  @ApiProperty({ example: '2026-07-08T10:00:00.000Z' })
  updated_at: string;

  static fromEntity(entity: PromptTemplate): PromptTemplateDto {
    const dto = new PromptTemplateDto();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.content = entity.content;
    dto.version = entity.version;
    dto.updated_at = new Date(entity.updatedAt).toISOString();
    return dto;
  }
}

/**
 * PUT /api/admin/prompt-templates/{id} 요청 바디 (ERD §3.6, PRD §6.6/§9).
 * name/id/created_at은 URL 경로/DB 값으로 고정되어 수정 불가하며, 바디에서도 받지 않는다.
 * content 변경 시 서버가 version을 자동으로 +1 한다(버전 관리 요구 — ERD §3.6 "version").
 */
export class UpdatePromptTemplateDto {
  @ApiProperty({
    example: '당신은 여행 일정 플래너입니다...(수정된 본문)',
    description: '수정할 프롬프트 본문(필수)',
  })
  @IsString({ message: 'content는 문자열이어야 합니다.' })
  @MinLength(1, { message: 'content는 비어 있을 수 없습니다.' })
  content: string;

  @ApiPropertyOptional({
    example: true,
    description: '현재 사용 여부(생략 시 기존 값 유지)',
  })
  @IsOptional()
  @IsBoolean({ message: 'is_active는 boolean이어야 합니다.' })
  is_active?: boolean;
}
