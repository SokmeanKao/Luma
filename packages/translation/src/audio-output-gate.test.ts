import { describe, expect, it, vi } from 'vitest';
import { audioFilterDecision, createTranslatedAudioOutputGate } from './audio-output-gate';

describe('audioFilterDecision', () => {
  it('is pending when detection is unknown', () => {
    expect(audioFilterDecision({ selectedSource: 'ko' })).toBe('pending');
  });

  it('plays matching language', () => {
    expect(audioFilterDecision({ selectedSource: 'ko', detectedSource: 'ko-KR' })).toBe('play');
  });

  it('suppresses non-matching language', () => {
    expect(audioFilterDecision({ selectedSource: 'ko', detectedSource: 'en' })).toBe('suppress');
  });
});

describe('createTranslatedAudioOutputGate', () => {
  it('buffers then plays after matching language', () => {
    const played: number[] = [];
    const discarded: string[] = [];
    const gate = createTranslatedAudioOutputGate({
      pendingTimeoutMs: 5000,
      onPlay: (c) => played.push(c.pcm.length),
      onDiscard: (r) => discarded.push(r),
    });
    gate.setSession(1, 's1');
    gate.setSelectedSource('ko');
    gate.pushAudio({
      pcm: new Uint8Array(100),
      sampleRate: 24000,
      mimeType: 'audio/pcm;rate=24000',
      generationId: 1,
      sessionId: 's1',
    });
    expect(played).toHaveLength(0);
    gate.noteInputLanguage('ko');
    expect(played).toEqual([100]);
    expect(discarded).toHaveLength(0);
  });

  it('discards pending when language mismatches', () => {
    const played: number[] = [];
    const discarded: string[] = [];
    const gate = createTranslatedAudioOutputGate({
      onPlay: (c) => played.push(c.pcm.length),
      onDiscard: (r) => discarded.push(r),
    });
    gate.setSession(1, 's1');
    gate.setSelectedSource('ko');
    gate.pushAudio({
      pcm: new Uint8Array(50),
      sampleRate: 24000,
      mimeType: 'audio/pcm;rate=24000',
      generationId: 1,
      sessionId: 's1',
    });
    gate.noteInputLanguage('en');
    expect(played).toHaveLength(0);
    expect(discarded).toContain('language_filtered');
  });

  it('discards on timeout when language never arrives', async () => {
    vi.useFakeTimers();
    const discarded: string[] = [];
    const gate = createTranslatedAudioOutputGate({
      pendingTimeoutMs: 200,
      onPlay: () => undefined,
      onDiscard: (r) => discarded.push(r),
    });
    gate.setSession(1, 's1');
    gate.setSelectedSource('ko');
    gate.pushAudio({
      pcm: new Uint8Array(40),
      sampleRate: 24000,
      mimeType: 'audio/pcm;rate=24000',
      generationId: 1,
      sessionId: 's1',
    });
    await vi.advanceTimersByTimeAsync(250);
    expect(discarded).toContain('language_decision_timeout');
    vi.useRealTimers();
  });

  it('rejects stale generation', () => {
    const discarded: string[] = [];
    const gate = createTranslatedAudioOutputGate({
      onPlay: () => undefined,
      onDiscard: (r) => discarded.push(r),
    });
    gate.setSession(2, 's1');
    gate.noteInputLanguage('ko');
    gate.pushAudio({
      pcm: new Uint8Array(10),
      sampleRate: 24000,
      mimeType: 'audio/pcm;rate=24000',
      generationId: 1,
      sessionId: 's1',
    });
    expect(discarded).toContain('stale_generation');
  });
});
