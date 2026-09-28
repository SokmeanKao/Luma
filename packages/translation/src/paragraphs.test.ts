import { describe, expect, it } from 'vitest';
import {
  groupTranscriptParagraphs,
  shouldStartNewParagraph,
  PARAGRAPH_SOFT_CHARS,
} from './paragraphs';
import type { TranscriptUpdate } from './types';

function seg(
  partial: Partial<TranscriptUpdate> & Pick<TranscriptUpdate, 'segmentId' | 'translatedText'>,
): TranscriptUpdate {
  return {
    sessionId: 's',
    revision: 1,
    final: true,
    captureTimestamp: 1,
    ...partial,
  };
}

describe('shouldStartNewParagraph', () => {
  it('does not break on short finalized turns', () => {
    expect(
      shouldStartNewParagraph(
        { sessionId: 's', originalText: '안녕하세요.', translatedText: 'Hello.' },
        { sessionId: 's' },
      ),
    ).toBe(false);
  });

  it('breaks across sessions', () => {
    expect(
      shouldStartNewParagraph(
        { sessionId: 's1', originalText: 'Hi.', translatedText: 'Hi.' },
        { sessionId: 's2' },
      ),
    ).toBe(true);
  });

  it('breaks after soft length at a sentence end', () => {
    const body = 'A'.repeat(PARAGRAPH_SOFT_CHARS - 1);
    expect(
      shouldStartNewParagraph(
        { sessionId: 's', originalText: '', translatedText: `${body}.` },
        { sessionId: 's' },
      ),
    ).toBe(true);
  });

  it('does not break mid-sentence even when long', () => {
    const body = 'A'.repeat(PARAGRAPH_SOFT_CHARS + 40);
    expect(
      shouldStartNewParagraph(
        { sessionId: 's', originalText: '', translatedText: body },
        { sessionId: 's' },
      ),
    ).toBe(false);
  });
});

describe('groupTranscriptParagraphs', () => {
  it('merges many short provider turns into one paragraph', () => {
    const entries = [
      seg({ segmentId: '1', originalText: '안녕하세요.', translatedText: 'Hello.' }),
      seg({ segmentId: '2', originalText: '회의를 시작하겠습니다.', translatedText: "Let's start the meeting." }),
      seg({ segmentId: '3', originalText: '질문이 있으신가요?', translatedText: 'Any questions?' }),
    ];
    const paras = groupTranscriptParagraphs(entries);
    expect(paras).toHaveLength(1);
    expect(paras[0]?.translatedText).toBe("Hello. Let's start the meeting. Any questions?");
    expect(paras[0]?.originalText).toBe('안녕하세요. 회의를 시작하겠습니다. 질문이 있으신가요?');
    expect(paras[0]?.segmentIds).toEqual(['1', '2', '3']);
  });

  it('keeps an open streaming segment provisional', () => {
    const paras = groupTranscriptParagraphs([
      seg({ segmentId: '1', translatedText: 'Hello.', final: true }),
      seg({ segmentId: '2', translatedText: 'We are still', final: false }),
    ]);
    expect(paras).toHaveLength(1);
    expect(paras[0]?.final).toBe(false);
    expect(paras[0]?.translatedText).toBe('Hello. We are still');
  });

  it('starts a new paragraph after soft length at sentence end', () => {
    const first = `${'Word '.repeat(50).trim()}.`; // ~250 chars with spaces
    expect(first.length).toBeGreaterThan(PARAGRAPH_SOFT_CHARS);
    const paras = groupTranscriptParagraphs([
      seg({ segmentId: '1', translatedText: first, final: true }),
      seg({ segmentId: '2', translatedText: 'Next topic begins here.', final: true }),
    ]);
    expect(paras.length).toBeGreaterThanOrEqual(2);
    expect(paras[0]?.translatedText).toBe(first);
    expect(paras[1]?.translatedText).toBe('Next topic begins here.');
  });

  it('groups a long stream of short turns into a few readable paragraphs', () => {
    const entries = Array.from({ length: 24 }, (_, i) =>
      seg({
        segmentId: String(i + 1),
        translatedText: `Sentence number ${i + 1} about the product roadmap and customer needs.`,
        originalText: `문장 ${i + 1}은 제품 로드맵과 고객 요구에 관한 내용입니다.`,
        captureTimestamp: i + 1,
      }),
    );
    const paras = groupTranscriptParagraphs(entries);
    expect(paras.length).toBeGreaterThan(1);
    expect(paras.length).toBeLessThan(entries.length / 2);
    expect(paras.every((p) => p.segmentIds.length >= 1)).toBe(true);
    expect(paras[0]?.translatedText.includes('Sentence number 1')).toBe(true);
    // Completed paragraphs stay intact; later text does not rewrite earlier paragraphs.
    const first = paras[0]!.translatedText;
    expect(paras.slice(1).every((p) => !p.translatedText.startsWith(first))).toBe(true);
  });
});
