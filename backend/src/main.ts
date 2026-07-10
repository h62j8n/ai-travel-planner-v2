import './crypto-polyfill';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // PRD §9: 모든 API는 /api 프리픽스를 갖는다 (예: /api/auth/signup, /api/trips)
  app.setGlobalPrefix('api');

  // 프론트엔드(Vite dev server)에서의 요청을 허용. Authorization: Bearer 헤더 방식이므로
  // 쿠키 기반 인증에 필요한 credentials는 사용하지 않는다.
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // PRD §9 에러 응답 형식 { error, message } 통일
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('AI 여행 일정 플래너 API')
    .setDescription(
      'AI 여행 일정 플래너 백엔드 API 문서 (PRD §9 API 계약 기준)',
    )
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
