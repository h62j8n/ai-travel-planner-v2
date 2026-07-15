import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * 환경변수 기반 TypeORM(Supabase Postgres) 연결 설정.
 * 실제 접속 정보는 .env 에서 주입하며, 저장소에는 .env.example 로 placeholder만 관리한다.
 * 엔티티/컬럼의 실제 구현은 다음 단계에서 진행하고, 이 단계에서는 연결 설정만 구성한다.
 */
export const getTypeOrmConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: configService.get<string>('DB_HOST'),
  port: configService.get<number>('DB_PORT', 5432),
  username: configService.get<string>('DB_USERNAME'),
  password: configService.get<string>('DB_PASSWORD'),
  database: configService.get<string>('DB_DATABASE'),
  ssl:
    configService.get<string>('DB_SSL', 'true') === 'true'
      ? { rejectUnauthorized: false }
      : false,
  autoLoadEntities: true,
  synchronize: configService.get<string>('DB_SYNCHRONIZE', 'false') === 'true',
});
