import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { AppException } from '../common/exceptions/app.exception';
import { parseDurationToSeconds } from '../common/utils/duration.util';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

const BCRYPT_SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 이메일/비밀번호 기반 자체 회원가입만 지원(소셜 로그인/이메일 인증은 비목표).
   * 성공 시 즉시 로그인 처리된 JWT를 함께 반환한다.
   */
  async signup(dto: SignupDto): Promise<AuthResponseDto> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new AppException(
        'VALIDATION_ERROR',
        '이미 가입된 이메일입니다.',
        HttpStatus.CONFLICT,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const user = await this.usersService.createUser(
      dto.email,
      passwordHash,
      'user',
    );

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw this.invalidCredentialsError();
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw this.invalidCredentialsError();
    }

    return this.buildAuthResponse(user);
  }

  /**
   * JWT는 서버 측 강제 무효화를 지원하지 않는다(토큰 테이블 없음, PRD §15 결정 로그).
   * 실제 로그아웃 처리는 클라이언트가 sessionStorage에서 토큰을 제거하는 방식이므로,
   * 서버는 상태 확인용 200 응답만 반환하면 충분하다.
   */
  logout(): { message: string } {
    return { message: '로그아웃되었습니다.' };
  }

  private invalidCredentialsError(): AppException {
    return new AppException(
      'AUTH_ERROR',
      '이메일 또는 비밀번호가 올바르지 않습니다.',
      HttpStatus.UNAUTHORIZED,
    );
  }

  private buildAuthResponse(user: User): AuthResponseDto {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '1h');

    return {
      access_token: this.jwtService.sign(payload),
      token_type: 'Bearer',
      expires_in: parseDurationToSeconds(expiresIn),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    };
  }
}
