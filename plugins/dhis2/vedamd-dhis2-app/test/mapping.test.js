import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, coercions } from '../app/mapping.js';

const mapping = [
  { uid: 'SEX', field: 'sex', coerce: 'text', values: { Male: 'male', Female: 'female' } },
  { uid: 'AGE', field: 'ageYears', coerce: 'number', min: 0, max: 130 },
  { uid: 'SBP', field: 'systolicMmHg', coerce: 'number', min: 40, max: 300 },
  { uid: 'MEDS', field: 'medications', coerce: 'list' },
  { uid: 'PREG', field: 'pregnant', coerce: 'boolean' },
];

describe('buildContext', () => {
  test('maps attributes and data values to VedaMD fields', () => {
    const { context } = buildContext({
      attributes: [{ attribute: 'SEX', value: 'Female' }, { attribute: 'AGE', value: '34' }],
      dataValues: [{ dataElement: 'SBP', value: '168' }],
      mapping,
    });
    assert.deepEqual(context, { sex: 'female', ageYears: 34, systolicMmHg: 168 });
  });

  test('event data wins over the enrolment attribute', () => {
    // The reading taken at this visit is the current one.
    const { context } = buildContext({
      attributes: [{ attribute: 'SBP', value: '120' }],
      dataValues: [{ dataElement: 'SBP', value: '168' }],
      mapping,
    });
    assert.equal(context.systolicMmHg, 168);
  });

  test('drops values outside physiological bounds', () => {
    const { context } = buildContext({
      dataValues: [{ dataElement: 'SBP', value: '0' }, { dataElement: 'AGE', value: '999' }],
      mapping,
    });
    assert.equal(context.systolicMmHg, undefined);
    assert.equal(context.ageYears, undefined);
  });

  test('drops an option-set value with no VedaMD equivalent', () => {
    // Sending an unrecognised sex through would be worse than omitting it.
    const { context } = buildContext({
      attributes: [{ attribute: 'SEX', value: 'Unknown' }],
      mapping,
    });
    assert.equal(context.sex, undefined);
  });

  test('splits a multi-value medication field', () => {
    const { context } = buildContext({
      dataValues: [{ dataElement: 'MEDS', value: 'warfarin, ibuprofen' }],
      mapping,
    });
    assert.deepEqual(context.medications, ['warfarin', 'ibuprofen']);
  });

  test('coerces DHIS2 boolean spellings', () => {
    assert.equal(coercions.boolean('true'), true);
    assert.equal(coercions.boolean('1'), true);
    assert.equal(coercions.boolean('0'), false);
    assert.equal(coercions.boolean('maybe'), null);
  });

  test('reports uids the deployment sent but nobody mapped', () => {
    const { unmapped } = buildContext({
      dataValues: [{ dataElement: 'UNKNOWN_UID', value: '5' }],
      mapping,
    });
    assert.deepEqual(unmapped, ['UNKNOWN_UID']);
  });

  test('skips empty values rather than sending nulls', () => {
    const { context } = buildContext({
      dataValues: [{ dataElement: 'SBP', value: '' }, { dataElement: 'AGE', value: null }],
      mapping,
    });
    assert.deepEqual(context, {});
  });
});

describe('validateMapping', () => {
  test('accepts the verified demo example', async () => {
    const { EXAMPLE_MAPPING, validateMapping } = await import('../app/mapping.js');
    assert.deepEqual(validateMapping(EXAMPLE_MAPPING), []);
  });

  test('rejects an empty mapping — there is no silent default', async () => {
    const { validateMapping } = await import('../app/mapping.js');
    assert.equal(validateMapping([]).length, 1);
    assert.equal(validateMapping(null).length, 1);
  });

  test('rejects malformed uids, unknown fields and unknown coercions', async () => {
    const { validateMapping } = await import('../app/mapping.js');
    const problems = validateMapping([
      { uid: 'short', field: 'ageYears' },
      { uid: 'cejWyOfXge6', field: 'patientName' },
      { uid: 'qrur9Dvnyt5', field: 'ageYears', coerce: 'eval' },
    ]);
    assert.equal(problems.length, 3);
  });
});

describe('evaluate (bridge client)', () => {
  test('posts to the configured service and returns cards', async () => {
    const { evaluate } = await import('../app/vedamd.js');
    let seen;
    const cards = await evaluate({
      bridgeUrl: 'https://bridge.test/',
      service: 'vedamd-patient-view',
      context: { ageYears: 40 },
      fetchImpl: async (url, init) => {
        seen = { url, body: JSON.parse(init.body) };
        return { ok: true, json: async () => ({ cards: [{ summary: 'x' }] }) };
      },
    });
    assert.equal(seen.url, 'https://bridge.test/cds-services/vedamd-patient-view');
    assert.deepEqual(seen.body.context, { ageYears: 40 });
    assert.ok(seen.body.hookInstance);
    assert.equal(cards.length, 1);
  });

  test('throws on a non-OK bridge response so the UI can say so', async () => {
    const { evaluate } = await import('../app/vedamd.js');
    await assert.rejects(
      evaluate({ bridgeUrl: 'https://b', context: {}, fetchImpl: async () => ({ ok: false, status: 502 }) }),
      /502/,
    );
  });
});
