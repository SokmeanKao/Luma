import { describe, expect, it } from 'vitest';
import { TranscriptAssembler } from './transcript';

describe('TranscriptAssembler', () => {
  it('revises partial text in place and does not duplicate finals', () => {
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
});
