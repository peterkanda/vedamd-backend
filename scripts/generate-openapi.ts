/* eslint-disable no-console */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { applyApiPrefix, swaggerConfig } from '../src/openapi.config';

/**
 * Generate the OpenAPI 3 snapshot.
 *
 * Usage:
 *   npm run openapi:generate                  # writes docs/openapi.json
 *   npm run openapi:generate -- --check       # exits 1 if the committed
 *                                              snapshot differs from the
 *                                              freshly generated one
 *                                              (used by CI to prevent drift)
 *
 * Boots the Nest app with logging silenced and the global prefix applied
 * exactly as main.ts does, generates the document, and writes / compares.
 */
const argv = process.argv.slice(2);
const checkOnly = argv.includes('--check');
const outPath = resolve(process.cwd(), 'docs/openapi.json');

async function main() {
  Logger.overrideLogger(false);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { logger: false },
  );
  applyApiPrefix(app);
  await app.init();

  const doc = SwaggerModule.createDocument(app, swaggerConfig);
  const generated = JSON.stringify(doc, null, 2) + '\n';

  await app.close();

  if (checkOnly) {
    if (!existsSync(outPath)) {
      console.error(
        `docs/openapi.json is missing. Run \`npm run openapi:generate\` and commit the result.`,
      );
      process.exit(1);
    }
    const committed = readFileSync(outPath, 'utf8');
    if (committed !== generated) {
      console.error(
        `docs/openapi.json is out of date with the API surface. ` +
          `Run \`npm run openapi:generate\` and commit the result.`,
      );
      process.exit(1);
    }
    console.log(`docs/openapi.json matches the live API (${doc.paths ? Object.keys(doc.paths).length : 0} paths).`);
    return;
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, generated);
  console.log(`Wrote ${outPath} (${doc.paths ? Object.keys(doc.paths).length : 0} paths).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
