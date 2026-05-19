import { DocumentBuilder } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';

/**
 * Routes that live OUTSIDE the /api global prefix. Kept here so both
 * main.ts (live server) and scripts/generate-openapi.ts (snapshot)
 * apply the same prefix carve-outs.
 */
export const PUBLIC_PATH_EXCLUDES = [
  '/health',
  '/metadata',
  '/cds-services',
  '/cds-services/*splat',
  '/docs',
  '/openapi.json',
] as const;

export function applyApiPrefix(app: INestApplication): void {
  app.setGlobalPrefix('api', { exclude: [...PUBLIC_PATH_EXCLUDES] });
}

export const swaggerConfig = new DocumentBuilder()
  .setTitle('VedaMD API')
  .setDescription(
    'Open-source, stateless Clinical Decision Support API. CDS Hooks + REST/JSON. ' +
      'VedaMD never stores patient data — records remain with your EMR.',
  )
  .setVersion('0.1.0')
  .addBearerAuth()
  .build();
