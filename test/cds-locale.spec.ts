import { describe, expect, it } from 'vitest';
import { resolveCardCopy, resolveLang } from '../src/modules/cds/locale';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const BASE_RULE: CdsRule = {
  id: 'test-rule',
  hook: 'patient-view',
  type: 'imci-fever-under5',
  title: 't',
  description: 'd',
  references: [],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown> = {}): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'x', context };
}

describe('cds locale helper', () => {
  it('defaults to en when no context.lang is set', () => {
    expect(resolveLang(req())).toBe('en');
  });

  it('reads context.lang and lowercases it', () => {
    expect(resolveLang(req({ lang: 'SW' }))).toBe('sw');
    expect(resolveLang(req({ lang: 'en-KE' }))).toBe('en-ke');
  });

  it('rejects nonsense lang values and falls back to en', () => {
    expect(resolveLang(req({ lang: '' }))).toBe('en');
    expect(resolveLang(req({ lang: 42 }))).toBe('en');
    expect(resolveLang(req({ lang: 'x'.repeat(50) }))).toBe('en');
  });

  it('returns the English defaults with placeholders interpolated when no locale override exists', () => {
    const out = resolveCardCopy(
      BASE_RULE,
      req(),
      { summary: 'Hello {{name}}', detail: '{{count}} found' },
      { name: 'world', count: 3 },
    );
    expect(out.summary).toBe('Hello world');
    expect(out.detail).toBe('3 found');
    expect(out.lang).toBe('en');
  });

  it('uses the locale override when context.lang matches a key', () => {
    const rule: CdsRule = {
      ...BASE_RULE,
      localeMessages: {
        sw: { summary: 'Habari {{name}}', detail: 'Vimepatikana {{count}}' },
      },
    };
    const out = resolveCardCopy(
      rule,
      req({ lang: 'sw' }),
      { summary: 'Hello {{name}}', detail: '{{count}} found' },
      { name: 'world', count: 3 },
    );
    expect(out.summary).toBe('Habari world');
    expect(out.detail).toBe('Vimepatikana 3');
    expect(out.lang).toBe('sw');
  });

  it('falls back to English if the requested locale is not in localeMessages', () => {
    const rule: CdsRule = {
      ...BASE_RULE,
      localeMessages: { fr: { summary: 'Bonjour', detail: '' } },
    };
    const out = resolveCardCopy(
      rule,
      req({ lang: 'sw' }),
      { summary: 'Hello', detail: 'World' },
      {},
    );
    expect(out.summary).toBe('Hello');
    expect(out.detail).toBe('World');
  });

  it('renders missing template vars as empty strings without throwing', () => {
    const out = resolveCardCopy(
      BASE_RULE,
      req(),
      { summary: '{{a}}-{{missing}}-{{b}}', detail: '{{x}}' },
      { a: 1, b: 2 },
    );
    expect(out.summary).toBe('1--2');
    expect(out.detail).toBe('');
  });
});
