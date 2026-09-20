import { describe, expect, it } from 'vitest';
import { extractCards, extractJsonObject } from '../src/modules/agentic/card-extractor';
import { stripJsonFromNarrative } from '../src/modules/agentic/agentic.service';
import {
  resolveThinkingConfig,
  retiredOn,
  DEFAULT_GEMINI_MODEL,
} from '../src/modules/agentic/providers/gemini.provider';

/**
 * Regression for the amoxicillin card that reached the clinical UI as raw
 * JSON. gemini-2.5-flash spends thinking tokens out of maxOutputTokens, ran
 * out mid-`detail`, and returned a fragment with an unterminated code fence.
 * Nothing downstream recognised it: the extractor found no balanced object
 * and the narrative stripper needed a closing fence, so `{"cards":[…` was
 * rendered verbatim under "AI-assisted overview · unverified".
 *
 * Reproduced verbatim from the reported response.
 */
const TRUNCATED = `\`\`\`json
{
  "cards": [
    {
      "summary": "Prescribe amoxicillin 560 mg twice daily for 5 days",
      "indicator": "info",
      "detail": "For community-acquired pneumonia in a 14 kg child, oral amoxicillin 40 mg/kg twice daily for 5 days is recommended.`;

describe('truncated LLM output', () => {
  it('never renders raw JSON as narrative prose', () => {
    expect(stripJsonFromNarrative(TRUNCATED)).toBe('');
  });

  it('strips an unterminated fence but keeps real prose before it', () => {
    const mixed = `Amoxicillin is first line here.\n\n\`\`\`json\n{"cards": [{"summary": "cut off`;
    expect(stripJsonFromNarrative(mixed)).toBe('Amoxicillin is first line here.');
  });

  it('leaves an ordinary prose answer untouched', () => {
    const prose = 'Consider amoxicillin; confirm the weight before dosing.';
    expect(stripJsonFromNarrative(prose)).toBe(prose);
  });

  it('salvages the completed fields of a cut-off card', () => {
    const json = extractJsonObject(TRUNCATED) as { cards?: Array<Record<string, unknown>> };
    expect(json).not.toBeNull();
    expect(json.cards?.[0]?.summary).toBe('Prescribe amoxicillin 560 mg twice daily for 5 days');
    expect(json.cards?.[0]?.indicator).toBe('info');
  });

  it('still drops a salvaged card that cites nothing', () => {
    // The citation guard is upstream of truncation: recovering a fragment
    // must not smuggle an uncited dose past it.
    const { cards } = extractCards(TRUNCATED, new Date().toISOString(), 0);
    expect(cards).toEqual([]);
  });

  it('keeps a salvaged card whose citations survived the cut', () => {
    const cut = `\`\`\`json
{"cards":[{"summary":"Check renal function","indicator":"warning","confidence":0.9,
"citations":[{"kind":"drug","id":"metformin","label":"Metformin"}],
"detail":"Reduce the dose when eGFR falls below`;
    const { cards } = extractCards(cut, new Date().toISOString(), 0);
    expect(cards).toHaveLength(1);
    expect(cards[0].summary).toBe('Check renal function');
  });

  it('parses well-formed output exactly as before', () => {
    const ok = `\`\`\`json\n{"cards":[{"summary":"Fine","indicator":"info","confidence":0.9,"citations":[{"kind":"drug","id":"x"}]}]}\n\`\`\``;
    const { cards } = extractCards(ok, new Date().toISOString(), 0);
    expect(cards).toHaveLength(1);
  });
});

describe('gemini thinking config', () => {
  it('disables thinking on 2.5, which bills it against the output cap', () => {
    expect(resolveThinkingConfig('gemini-2.5-flash')).toEqual({ thinkingBudget: 0 });
  });

  it('uses thinkingLevel on 3.x, which rejects a token budget', () => {
    expect(resolveThinkingConfig('gemini-3.5-flash')).toEqual({ thinkingLevel: 'low' });
    expect(resolveThinkingConfig('gemini-3.1-pro')).toEqual({ thinkingLevel: 'low' });
  });

  it('sends no thinkingConfig to models that would reject it', () => {
    expect(resolveThinkingConfig('gemini-2.0-flash')).toBeNull();
    expect(resolveThinkingConfig('gemini-1.5-pro')).toBeNull();
  });
});

describe('retired gemini models', () => {
  it('knows the shut-down date of the old default', () => {
    expect(retiredOn('gemini-2.0-flash')).toBe('2026-06-01');
  });

  it('does not ship a default that Google has already retired', () => {
    expect(retiredOn(DEFAULT_GEMINI_MODEL)).toBeUndefined();
  });
});
