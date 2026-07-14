import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { config } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({ origin: config().WEB_ORIGIN, credentials: true });
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'dev/receiver/:mode'] });
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('HookRelay API')
      .setDescription('Publish events and inspect signed webhook deliveries.')
      .setVersion('1.0')
      .addCookieAuth('hookrelay_session')
      .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'api-key')
      .build(),
  );
  SwaggerModule.setup('docs', app, document);
  const server = app.getHttpAdapter().getInstance();
  server.get(
    '/health',
    (_request: unknown, response: { json: (body: unknown) => void }) =>
      response.json({ status: 'ok' }),
  );
  await app.listen(config().API_PORT, '0.0.0.0');
}

void bootstrap();
