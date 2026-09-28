import { describe, expect, it } from 'vitest';
import { parseProviderPcmMime, pcm16leDurationMs, pcm16leHasSignal } from './pcm-mime';

describe('parseProviderPcmMime', () => {
  it('parses audio/pcm;rate=24000', () => {
    expect(parseProviderPcmMime('audio/pcm;rate=24000')).toEqual({
      encoding: 's16le',
      sampleRate: 24000,
      mimeType: 'audio/pcm;rate=24000',
    });
  });

  it('parses L16 with spaces', () => {
    expect(parseProviderPcmMime('audio/L16; rate=16000')).toMatchObject({
      encoding: 's16le',
      sampleRate: 16000,
    });
  });

  it('rejects missing rate', () => {
    expect(parseProviderPcmMime('audio/pcm')).toBeNull();
  });

  it('rejects unknown encoding', () => {
    expect(parseProviderPcmMime('audio/pcm;rate=24000;encoding=mulaw')).toBeNull();
  });

  it('rejects non-pcm types', () => {
    expect(parseProviderPcmMime('audio/mpeg')).toBeNull();
  });
});

describe('pcm16leDurationMs', () => {
  it('computes duration from bytes', () => {
    expect(pcm16leDurationMs(4800, 24000)).toBeCloseTo(100, 5);
  });
});

describe('pcm16leHasSignal', () => {
  it('detects nonzero samples', () => {
    const silent = new Uint8Array(8);
    expect(pcm16leHasSignal(silent)).toBe(false);
    const tone = new Uint8Array(4);
    new DataView(tone.buffer).setInt16(0, 1200, true);
    expect(pcm16leHasSignal(tone)).toBe(true);
  });
});
