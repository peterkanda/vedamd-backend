import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ValidationPipe } from '@nestjs/common';
import { AgenticEvaluateDto } from '../src/modules/agentic/agentic.dto';

/**
 * The same pipe options as src/main.ts. `LabDto.value` had no validator
 * decorator, so the whitelist treated it as an unknown property and every
 * request that sent a lab result was rejected with a 400.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
  forbidUnknownValues: true,
});
const validate = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: AgenticEvaluateDto });

describe('AgenticEvaluateDto', () => {
  it.each([88, 'positive', '<0.5'])('accepts a lab with value %s', async (value) => {
    await expect(
      validate({ question: 'q', labs: [{ name: 'Creatinine', value, unit: 'umol/L' }] }),
    ).resolves.toBeDefined();
  });

  it('rejects a lab with no value', async () => {
    await expect(validate({ question: 'q', labs: [{ name: 'Creatinine' }] })).rejects.toThrow();
  });

  it('rejects minConfidence outside 0..1 (e.g. 60 meant as a percentage)', async () => {
    await expect(validate({ question: 'q', minConfidence: 60 })).rejects.toThrow();
    await expect(validate({ question: 'q', minConfidence: 0.6 })).resolves.toBeDefined();
  });
});
