import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { AppModule } from './app.module';
import { applyApiPrefix, swaggerConfig } from './openapi.config';
import type { AppConfig } from './config/configuration';

async function bootstrap() {
  const bodyLimit = Number(process.env.HTTP_BODY_LIMIT_BYTES ?? 1_048_576);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, trustProxy: true, bodyLimit }),
  );
  const config = app.get(ConfigService<AppConfig, true>);

  await app.register(helmet as never, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'no-referrer' },
  });

  // Per-IP rate limit. For per-API-key limits, a separate guard reads
  // x-vedamd-key-id and decrements an account-scoped Redis counter.
  await app.register(rateLimit as never, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 1000),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? '1 minute',
    cache: 10_000,
    allowList: (process.env.RATE_LIMIT_ALLOWLIST ?? '').split(',').filter(Boolean),
  });

  const corsOrigins = process.env.CORS_ORIGINS?.split(',') ?? true;
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type', 'x-integrator-id', 'x-request-id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }),
  );

  applyApiPrefix(app);

  if (config.get('http.exposeDocs', { infer: true })) {
    const doc = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, doc, {
      jsonDocumentUrl: 'openapi.json',
      swaggerOptions: { persistAuthorization: true },
    });
  } else {
    Logger.warn('Swagger UI disabled (set HTTP_EXPOSE_DOCS=true to enable).', 'Bootstrap');
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  Logger.log(
    `VedaMD API listening on :${port} (bodyLimit=${bodyLimit} bytes)`,
    'Bootstrap',
  );
}

bootstrap();
