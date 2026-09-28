import { pcm16leDurationMs } from './pcm-mime';

export type PlayablePcmChunk = {
  pcm: Uint8Array;
  sampleRate: number;
  mimeType: string;
  generationId: number;
  sessionId: string;
};

export type TranslatedAudioPlayerOptions = {
  /** Max queued+playing duration before flush at segment boundary. */
  maxQueuedMs?: number;
  onGap?: (reason: string) => void;
  /** Fires when audible translation starts/stops (queue drained + no active source). */
  onPlayingChange?: (playing: boolean) => void;
};

/**
 * Sequential PCM s16le playback with bounded queue.
 * unlock() must run from a user gesture (Start translation).
 */
export function createTranslatedAudioPlayer(opts: TranslatedAudioPlayerOptions = {}) {
  const maxQueuedMs = opts.maxQueuedMs ?? 4000;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let volume = 1;
  let muted = false;
  let enabled = false;
  let generationId = -1;
  let sessionId = '';
  let epoch = 0;
  let nextStartAt = 0;
  let queuedMs = 0;
  let playedChunks = 0;
  let activeSource: AudioBufferSourceNode | null = null;
  let playingNotified = false;
  const queue: Array<{
    buffer: AudioBuffer;
    durationMs: number;
    generationId: number;
    sessionId: string;
    epoch: number;
  }> = [];
  let pumping = false;

  function notifyPlaying(next: boolean) {
    if (playingNotified === next) return;
    playingNotified = next;
    opts.onPlayingChange?.(next);
  }

  function ensureGraph(): AudioContext {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : volume;
      master.connect(ctx.destination);
    }
    return ctx;
  }

  function applyGainImmediate() {
    if (!master || !ctx) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(muted ? 0 : volume, ctx.currentTime);
  }

  function pcmToBuffer(audioCtx: AudioContext, pcm: Uint8Array, sampleRate: number): AudioBuffer {
    const samples = Math.floor(pcm.byteLength / 2);
    const buffer = audioCtx.createBuffer(1, Math.max(1, samples), sampleRate);
    const channel = buffer.getChannelData(0);
    const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    for (let i = 0; i < samples; i += 1) {
      channel[i] = view.getInt16(i * 2, true) / 0x8000;
    }
    return buffer;
  }

  function stopActiveWithRamp() {
    if (!ctx || !master || !activeSource) {
      activeSource = null;
      return;
    }
    const now = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + 0.008);
    } catch {
      /* ignore */
    }
    try {
      activeSource.stop(now + 0.01);
    } catch {
      /* ignore */
    }
    activeSource = null;
    // Restore target gain after ramp window for future starts.
    window.setTimeout(() => applyGainImmediate(), 20);
  }

  function flushInternal(reason: string, reportGap: boolean) {
    epoch += 1;
    queue.length = 0;
    queuedMs = 0;
    pumping = false;
    stopActiveWithRamp();
    nextStartAt = ctx ? ctx.currentTime : 0;
    notifyPlaying(false);
    if (reportGap && reason) opts.onGap?.(reason);
  }

  function pump() {
    if (pumping || !enabled || !ctx || !master) return;
    const item = queue.shift();
    if (!item) {
      if (!activeSource) notifyPlaying(false);
      return;
    }
    if (item.epoch !== epoch || item.generationId !== generationId || item.sessionId !== sessionId) {
      queuedMs = Math.max(0, queuedMs - item.durationMs);
      pump();
      return;
    }
    pumping = true;
    queuedMs = Math.max(0, queuedMs - item.durationMs);
    const source = ctx.createBufferSource();
    source.buffer = item.buffer;
    source.connect(master);
    const startAt = Math.max(ctx.currentTime, nextStartAt);
    nextStartAt = startAt + item.buffer.duration;
    activeSource = source;
    notifyPlaying(true);
    const capturedEpoch = epoch;
    source.onended = () => {
      if (activeSource === source) activeSource = null;
      pumping = false;
      if (capturedEpoch !== epoch) return;
      if (queue.length === 0) notifyPlaying(false);
      pump();
    };
    try {
      source.start(startAt);
    } catch {
      activeSource = null;
      pumping = false;
      if (queue.length === 0) notifyPlaying(false);
      pump();
    }
  }

  return {
    async unlock(): Promise<void> {
      const audioCtx = ensureGraph();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      applyGainImmediate();
    },

    setSession(nextGenerationId: number, nextSessionId: string): void {
      if (nextGenerationId !== generationId || nextSessionId !== sessionId) {
        flushInternal('session_changed', false);
      }
      generationId = nextGenerationId;
      sessionId = nextSessionId;
    },

    setEnabled(next: boolean): void {
      if (!next && enabled) {
        flushInternal('voice_disabled', false);
      }
      enabled = next;
    },

    isEnabled(): boolean {
      return enabled;
    },

    setVolume(v: number): void {
      volume = Math.max(0, Math.min(1, v));
      applyGainImmediate();
    },

    setMuted(next: boolean): void {
      muted = next;
      applyGainImmediate();
    },

    getVolume(): number {
      return volume;
    },

    isMuted(): boolean {
      return muted;
    },

    enqueue(chunk: PlayablePcmChunk): void {
      if (!enabled) return;
      if (chunk.generationId !== generationId || chunk.sessionId !== sessionId) return;
      if (chunk.pcm.byteLength < 2) return;

      const audioCtx = ensureGraph();
      const durationMs = pcm16leDurationMs(chunk.pcm.byteLength, chunk.sampleRate);
      if (durationMs <= 0) return;

      if (queuedMs + durationMs > maxQueuedMs) {
        flushInternal('playback_queue_overflow', true);
        if (chunk.generationId !== generationId || chunk.sessionId !== sessionId) return;
      }

      const buffer = pcmToBuffer(audioCtx, chunk.pcm, chunk.sampleRate);
      queue.push({
        buffer,
        durationMs,
        generationId: chunk.generationId,
        sessionId: chunk.sessionId,
        epoch,
      });
      queuedMs += durationMs;
      playedChunks += 1;
      pump();
    },

    /** Immediate stop: clear queue, invalidate callbacks, brief gain ramp. */
    flush(reason = 'flush'): void {
      flushInternal(reason, reason === 'playback_queue_overflow');
    },

    getContextState(): AudioContextState | 'none' {
      return ctx?.state ?? 'none';
    },

    getQueuedCount(): number {
      return queue.length + (activeSource ? 1 : 0);
    },

    getPlayedCount(): number {
      return playedChunks;
    },

    async close(): Promise<void> {
      flushInternal('close', false);
      enabled = false;
      try {
        await ctx?.close();
      } catch {
        /* ignore */
      }
      ctx = null;
      master = null;
    },
  };
}

export type TranslatedAudioPlayer = ReturnType<typeof createTranslatedAudioPlayer>;
