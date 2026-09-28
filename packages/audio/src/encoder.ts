// Target provider format: mono PCM s16le @ 16 kHz (Gemini Live realtime audio).
export const TARGET_SAMPLE_RATE = 16_000;
export const TARGET_CHANNELS = 1;

/** Linear resample Float32 mono PCM from inputRate → outputRate. */
export function resampleLinear(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate <= 0 || outputRate <= 0) return new Float32Array(0);
  if (inputRate === outputRate) return new Float32Array(input);
  const outLength = Math.max(0, Math.round((input.length * outputRate) / inputRate));
  const output = new Float32Array(outLength);
  if (input.length === 0 || outLength === 0) return output;
  const ratio = input.length / outLength;
  for (let i = 0; i < outLength; i += 1) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = src - i0;
    const a = input[i0] ?? 0;
    const b = input[i1] ?? 0;
    output[i] = a + (b - a) * t;
  }
  return output;
}

/** Clamp float samples to [-1, 1] and encode little-endian signed 16-bit PCM. */
export function floatToPcm16le(input: Float32Array): Uint8Array {
  const out = new Uint8Array(input.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < input.length; i += 1) {
    const s = Math.max(-1, Math.min(1, input[i] ?? 0));
    const v = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
    view.setInt16(i * 2, v, true);
  }
  return out;
}

export function downmixToMono(interleaved: Float32Array, channels: number): Float32Array {
  if (channels <= 1) {
    return new Float32Array(interleaved);
  }
  const frames = Math.floor(interleaved.length / channels);
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    let sum = 0;
    for (let c = 0; c < channels; c += 1) {
      sum += interleaved[i * channels + c] ?? 0;
    }
    mono[i] = sum / channels;
  }
  return mono;
}

export function pcmChunkDurationMs(sampleCount: number, sampleRate: number): number {
  if (sampleRate <= 0) return 0;
  return (sampleCount / sampleRate) * 1000;
}

export interface PcmChunkerOptions {
  /** Max queued PCM duration before oldest data is dropped. */
  maxBufferedMs: number;
  sampleRate: number;
  /** Emit size in PCM samples (not bytes). Default ~100ms at 16kHz = 1600. */
  chunkSamples: number;
  onGap?: (droppedMs: number) => void;
}

/**
 * Bounded PCM queue. Converts float interleaved frames → mono 16kHz s16le chunks.
 * Does not accept WebM blobs.
 */
export class BoundedPcmChunker {
  private readonly opts: PcmChunkerOptions;
  private queue = new Float32Array(0);
  private droppedMsTotal = 0;

  constructor(opts: Partial<PcmChunkerOptions> = {}) {
    this.opts = {
      maxBufferedMs: opts.maxBufferedMs ?? 2000,
      sampleRate: opts.sampleRate ?? TARGET_SAMPLE_RATE,
      chunkSamples: opts.chunkSamples ?? Math.floor(TARGET_SAMPLE_RATE / 10),
      onGap: opts.onGap,
    };
  }

  /** Push float PCM (interleaved) at the given channel count and sample rate. */
  pushFloat(interleaved: Float32Array, channels: number, inputRate: number): Uint8Array[] {
    const mono = downmixToMono(interleaved, channels);
    const resampled = resampleLinear(mono, inputRate, this.opts.sampleRate);
    this.append(resampled);
    this.trim();
    return this.drain();
  }

  private append(next: Float32Array): void {
    const merged = new Float32Array(this.queue.length + next.length);
    merged.set(this.queue, 0);
    merged.set(next, this.queue.length);
    this.queue = merged;
  }

  private trim(): void {
    const maxSamples = Math.floor((this.opts.maxBufferedMs / 1000) * this.opts.sampleRate);
    if (this.queue.length <= maxSamples) return;
    const drop = this.queue.length - maxSamples;
    const droppedMs = pcmChunkDurationMs(drop, this.opts.sampleRate);
    this.droppedMsTotal += droppedMs;
    this.opts.onGap?.(droppedMs);
    this.queue = this.queue.slice(drop);
  }

  private drain(): Uint8Array[] {
    const chunks: Uint8Array[] = [];
    while (this.queue.length >= this.opts.chunkSamples) {
      const slice = this.queue.slice(0, this.opts.chunkSamples);
      this.queue = this.queue.slice(this.opts.chunkSamples);
      chunks.push(floatToPcm16le(slice));
    }
    return chunks;
  }

  reset(): void {
    this.queue = new Float32Array(0);
  }

  getDroppedMsTotal(): number {
    return this.droppedMsTotal;
  }

  bufferedMs(): number {
    return pcmChunkDurationMs(this.queue.length, this.opts.sampleRate);
  }
}

export function encodeProviderAudioMessage(pcm16le: Uint8Array): {
  realtime_input: { audio: { mime_type: string; data: string } };
} {
  let binary = '';
  for (let i = 0; i < pcm16le.length; i += 1) {
    binary += String.fromCharCode(pcm16le[i] ?? 0);
  }
  const data = typeof btoa === 'function' ? btoa(binary) : Buffer.from(pcm16le).toString('base64');
  return {
    realtime_input: {
      audio: {
        mime_type: `audio/pcm;rate=${TARGET_SAMPLE_RATE}`,
        data,
      },
    },
  };
}
