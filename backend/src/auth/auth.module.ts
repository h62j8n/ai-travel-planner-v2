import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          // JWT_EXPIRES_IN은 "30m"/"1h" 같은 자유 형식 문자열이므로
          // @nestjs/jwt(jsonwebtoken)의 좁은 리터럴 타입과 맞추기 위해 캐스팅한다.
          expiresIn: configService.get<string>(
            'JWT_EXPIRES_IN',
            '1h',
          ) as unknown as number,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  // JwtModule/PassportModule을 export해 trips/admin 모듈에서도
  // JwtAuthGuard/RolesGuard를 그대로 재사용할 수 있게 한다.
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
