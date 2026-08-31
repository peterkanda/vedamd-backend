import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import compress from '@fastify/compress';
import { AppModule } from './app.module';
import { applyApiPrefix, swaggerConfig } from './openapi.config';
import { REDIS, type MaybeRedis } from './common/cache';
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

  // Response compression. Content payloads are large (conditions ≈ 4.6 MB,
  // drugs ≈ 1.4 MB) and ship as JSON; gzip/brotli cuts the wire size by
  // ~85-90%. Only compresses above a threshold so tiny CDS-card responses
  // aren't penalised by the compression overhead. Brotli preferred when the
  // client advertises it, gzip/deflate otherwise.
  await app.register(compress as never, {
    global: true,
    threshold: 1024,
    encodings: ['br', 'gzip', 'deflate'],
  });

  // Per-IP rate limit. When REDIS_URL is set we back the limiter with the
  // shared ioredis client so the limit holds ACROSS pods (the in-memory
  // default counts per-process, letting an N-pod deployment serve N× the
  // intended rate). Falls back to in-memory when Redis is absent.
  const redis = app.get<MaybeRedis>(REDIS, { strict: false });
  await app.register(rateLimit as never, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 1000),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? '1 minute',
    cache: 10_000,
    ...(redis ? { redis } : {}),
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
  Logger.log(`VedaMD API listening on :${port} (bodyLimit=${bodyLimit} bytes)`, 'Bootstrap');
}

bootstrap();
