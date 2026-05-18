import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, trustProxy: true }),
  );

  await app.register(helmet as never);
  await app.register(rateLimit as never, {
    max: 1000,
    timeWindow: '1 minute',
  });

  const corsOrigins = process.env.CORS_ORIGINS?.split(',') ?? true;
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.setGlobalPrefix('api', {
    exclude: [
      '/health',
      '/metadata',
      '/cds-services',
      '/cds-services/*splat',
      '/docs',
      '/openapi.json',
    ],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('VedaMD API')
    .setDescription(
      'Open-source, stateless Clinical Decision Support API. CDS Hooks + REST/JSON. ' +
        'VedaMD never stores patient data — records remain with your EMR.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, doc, {
    jsonDocumentUrl: 'openapi.json',
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`VedaMD API listening on :${port}`, 'Bootstrap');
}

bootstrap();
