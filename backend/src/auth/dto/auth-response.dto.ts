import { ApiProperty } from '@nestjs/swagger';
import type { UserRole } from '../../users/entities/user.entity';

export class AuthUserDto {
  @ApiProperty({ example: 'a1b2c3d4-...' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'user', enum: ['user', 'admin'] })
  role: UserRole;

  @ApiProperty({ example: '2026-07-08T10:00:00.000Z' })
  createdAt: Date;
}

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT access token (Bearer)' })
  access_token: string;

  @ApiProperty({ example: 'Bearer' })
  token_type: string;

  @ApiProperty({ example: 3600, description: '초 단위 만료 시간' })
  expires_in: number;

  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto;
}
