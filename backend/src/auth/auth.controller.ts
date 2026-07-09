import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '회원가입 (이메일/비밀번호, 성공 시 즉시 JWT 발급)',
  })
  @ApiResponse({
    status: 201,
    description: '회원가입 성공, JWT 및 사용자 정보 반환',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR - 입력값 형식 오류',
  })
  @ApiResponse({
    status: 409,
    description: 'VALIDATION_ERROR - 이미 가입된 이메일',
  })
  signup(@Body() dto: SignupDto): Promise<AuthResponseDto> {
    return this.authService.signup(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '로그인 (이메일/비밀번호)' })
  @ApiResponse({
    status: 200,
    description: '로그인 성공, JWT 및 사용자 정보 반환',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'AUTH_ERROR - 이메일 또는 비밀번호 불일치',
  })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '로그아웃 (서버 측 강제 무효화 미지원 — 실제 처리는 클라이언트 sessionStorage 삭제)',
  })
  @ApiResponse({ status: 200, description: '로그아웃 처리 확인' })
  @ApiResponse({ status: 401, description: 'AUTH_ERROR - 인증 필요' })
  logout(): { message: string } {
    return this.authService.logout();
  }
}
