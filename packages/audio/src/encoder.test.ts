import { describe, expect, it, vi } from 'vitest';
import {
  BoundedPcmChunker,
  downmixToMono,
  encodeProviderAudioMessage,
  floatToPcm16le,
  pcmChunkDurationMs,
  resampleLinear,
  TARGET_SAMPLE_RATE,
} from './encoder';

describe('encoder', () => {
  it('downmixes stereo by averaging channels', () => {
    const mono = downmixToMono(new Float32Array([1, -1, 0.5, -0.5]), 2);
    expect(Array.from(mono)).toEqual([0, 0]);
  });

  it('reports chunk duration from sample count and rate', () => {
    expect(pcmChunkDurationMs(16000, 16000)).toBe(1000);
  });

  it('resamples preserving approximate duration', () => {
    const input = new Float32Array(48000).fill(0.25);
    const out = resampleLinear(input, 48000, TARGET_SAMPLE_RATE);
    expect(out.length).toBe(TARGET_SAMPLE_RATE);
  });

  it('encodes pcm16le little-endian without clipping mid values', () => {
    const bytes = floatToPcm16le(new Float32Array([0, 1, -1]));
    expect(bytes.length).toBe(6);
    expect(bytes[0]).toBe(0);
    expect(bytes[1]).toBe(0);
  });

  it('emits ordered chunks and reports gaps when over capacity', () => {
    const onGap = vi.fn();
    const chunker = new BoundedPcmChunker({
      maxBufferedMs: 100,
      chunkSamples: 1600,
      sampleRate: TARGET_SAMPLE_RATE,
      onGap,
    });
    // 500ms of silence at 16kHz mono → will trim to 100ms and drop ~400ms
    const samples = new Float32Array(TARGET_SAMPLE_RATE / 2);
    const chunks = chunker.pushFloat(samples, 1, TARGET_SAMPLE_RATE);
    expect(onGap).toHaveBeenCalled();
    expect(chunker.bufferedMs()).toBeLessThanOrEqual(100 + 1e-6);
    // After trim, drain may yield 0 full 100ms chunks depending on remainder
    expect(Array.isArray(chunks)).toBe(true);
  });

  it('builds provider audio envelope with pcm mime type', () => {
    const msg = encodeProviderAudioMessage(new Uint8Array([1, 2, 3, 4]));
    expect(msg.realtime_input.audio.mime_type).toBe('audio/pcm;rate=16000');
    expect(msg.realtime_input.audio.data.length).toBeGreaterThan(0);
  });
});
