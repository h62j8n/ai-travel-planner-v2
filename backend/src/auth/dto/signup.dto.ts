import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class SignupDto {
  @ApiProperty({
    example: 'user@example.com',
    description: '로그인에 사용할 이메일(중복 불가)',
  })
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  email: string;

  @ApiProperty({
    example: 'password123',
    minLength: 8,
    maxLength: 72,
    description: '비밀번호(최소 8자, bcrypt 제약상 최대 72바이트)',
  })
  @IsString()
  @MinLength(8, { message: '비밀번호는 최소 8자 이상이어야 합니다.' })
  @MaxLength(72, { message: '비밀번호는 최대 72자까지 가능합니다.' })
  password: string;
}
