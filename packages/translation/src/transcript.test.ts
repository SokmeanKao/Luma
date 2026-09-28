import { describe, expect, it } from 'vitest';
import { TranscriptAssembler, mergeTranscriptText } from './transcript';

describe('mergeTranscriptText', () => {
  it('replaces cumulative revisions', () => {
    expect(mergeTranscriptText('Hel', 'Hello')).toBe('Hello');
    expect(mergeTranscriptText('Hello', 'Hello.')).toBe('Hello.');
  });

  it('keeps longer text when a shorter stale cumulative arrives', () => {
    expect(mergeTranscriptText('Hello there', 'Hello')).toBe('Hello there');
  });

  it('ignores exact duplicates', () => {
    expect(mergeTranscriptText('Hello', 'Hello')).toBe('Hello');
  });

  it('appends incremental deltas', () => {
    expect(mergeTranscriptText('Hello.', "Let's start")).toBe("Hello. Let's start");
  });

  it('does not insert a space before punctuation deltas', () => {
    expect(mergeTranscriptText('Hello', '.')).toBe('Hello.');
  });
});

describe('TranscriptAssembler', () => {
  it('revises partial text in place and locks finals', () => {
    const a = new TranscriptAssembler({ maxEntries: 100 });
    a.apply({
      sessionId: 's',
      segmentId: '1',
      revision: 1,
      translatedText: 'Hel',
      final: false,
      captureTimestamp: 1,
    });
    a.apply({
      sessionId: 's',
      segmentId: '1',
      revision: 2,
      translatedText: 'Hello',
      final: true,
      captureTimestamp: 2,
    });
    a.apply({
      sessionId: 's',
      segmentId: '1',
      revision: 3,
      translatedText: 'Hello again',
      final: false,
      captureTimestamp: 3,
    });
    const entries = a.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.translatedText).toBe('Hello');
    expect(entries[0]?.final).toBe(true);
  });

  it('keeps three consecutive finalized sentences visible', () => {
    const a = new TranscriptAssembler({ maxEntries: 100 });
    for (const [id, text] of [
      ['1', 'Hello.'],
      ['2', "Let's start the meeting."],
      ['3', 'Any questions?'],
    ] as const) {
      a.apply({
        sessionId: 's',
        segmentId: id,
        revision: 1,
        translatedText: text.slice(0, 3),
        final: false,
        captureTimestamp: Number(id),
      });
      a.apply({
        sessionId: 's',
        segmentId: id,
        revision: 2,
        translatedText: text,
        final: true,
        captureTimestamp: Number(id),
      });
    }
    const entries = a.list();
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.translatedText)).toEqual([
      'Hello.',
      "Let's start the meeting.",
      'Any questions?',
    ]);
  });

  it('merges cumulative revisions within one segment without duplicating rows', () => {
    const a = new TranscriptAssembler({ maxEntries: 100 });
    a.apply({
      sessionId: 's',
      segmentId: '1',
      revision: 1,
      translatedText: 'Hello',
      final: false,
      captureTimestamp: 1,
    });
    a.apply({
      sessionId: 's',
      segmentId: '1',
      revision: 2,
      translatedText: 'Hello. Let’s start',
      final: false,
      captureTimestamp: 2,
    });
    a.apply({
      sessionId: 's',
      segmentId: '1',
      revision: 3,
      translatedText: 'Hello. Let’s start the meeting today.',
      final: true,
      captureTimestamp: 3,
    });
    expect(a.list()).toHaveLength(1);
    expect(a.list()[0]?.translatedText).toBe('Hello. Let’s start the meeting today.');
  });

  it('appends deltas within one segment', () => {
    const a = new TranscriptAssembler({ maxEntries: 100 });
    a.apply({
      sessionId: 's',
      segmentId: '1',
      revision: 1,
      translatedText: 'Hello.',
      final: false,
      captureTimestamp: 1,
    });
    a.apply({
      sessionId: 's',
      segmentId: '1',
      revision: 2,
      translatedText: "Let's start",
      final: false,
      captureTimestamp: 2,
    });
    expect(a.list()).toHaveLength(1);
    expect(a.list()[0]?.translatedText).toBe("Hello. Let's start");
  });

  it('isolates segments by session id', () => {
    const a = new TranscriptAssembler({ maxEntries: 100 });
    a.apply({
      sessionId: 's1',
      segmentId: '1',
      revision: 1,
      translatedText: 'One',
      final: true,
      captureTimestamp: 1,
    });
    a.apply({
      sessionId: 's2',
      segmentId: '1',
      revision: 1,
      translatedText: 'Two',
      final: true,
      captureTimestamp: 2,
    });
    expect(a.list()).toHaveLength(2);
    expect(a.list().map((e) => e.translatedText)).toEqual(['One', 'Two']);
  });

  it('ignores duplicate events with identical content', () => {
    const a = new TranscriptAssembler({ maxEntries: 100 });
    const u = {
      sessionId: 's',
      segmentId: '1',
      revision: 1,
      translatedText: 'Hello',
      final: false,
      captureTimestamp: 1,
    };
    expect(a.apply(u)).not.toBeNull();
    expect(a.apply(u)).toBeNull();
    expect(a.list()).toHaveLength(1);
  });

  it('keeps original and translation on the same segment and retains prior paragraphs', () => {
    const a = new TranscriptAssembler({ maxEntries: 100 });
    a.apply({
      sessionId: 's',
      segmentId: '1',
      revision: 1,
      originalText: '안녕하세요',
      translatedText: '',
      final: false,
      captureTimestamp: 1,
    });
    a.apply({
      sessionId: 's',
      segmentId: '1',
      revision: 2,
      originalText: '안녕하세요.',
      translatedText: 'Hello.',
      final: true,
      captureTimestamp: 2,
    });
    a.apply({
      sessionId: 's',
      segmentId: '2',
      revision: 1,
      originalText: '회의를 시작하겠습니다.',
      translatedText: "Let's start the meeting.",
      final: true,
      captureTimestamp: 3,
    });
    const entries = a.list();
    expect(entries).toHaveLength(2);
    expect(entries[0]?.originalText).toBe('안녕하세요.');
    expect(entries[0]?.translatedText).toBe('Hello.');
    expect(entries[1]?.originalText).toBe('회의를 시작하겠습니다.');
    expect(entries[1]?.translatedText).toBe("Let's start the meeting.");
  });

  it('bounds retention by dropping oldest entries', () => {
    const a = new TranscriptAssembler({ maxEntries: 2 });
    a.apply({
      sessionId: 's',
      segmentId: '1',
      revision: 1,
      translatedText: 'A',
      final: true,
      captureTimestamp: 1,
    });
    a.apply({
      sessionId: 's',
      segmentId: '2',
      revision: 1,
      translatedText: 'B',
      final: true,
      captureTimestamp: 2,
    });
    a.apply({
      sessionId: 's',
      segmentId: '3',
      revision: 1,
      translatedText: 'C',
      final: true,
      captureTimestamp: 3,
    });
    expect(a.list().map((e) => e.translatedText)).toEqual(['B', 'C']);
  });
});
