import { BoundedPcmChunker } from './encoder';

export type OriginalMonitorOptions = {
  /** Gain multiplier while translation is actively playing (relative to user volume). */
  duckRatio?: number;
  duckDownMs?: number;
  duckUpMs?: number;
  /** Delay before restoring original after translation stops (avoids flicker between chunks). */
  holdoffMs?: number;
  maxBufferedMs?: number;
  onGap?: (droppedMs: number) => void;
};

/**
 * Captured-tab monitor + PCM tap for Gemini.
 * Provider PCM is taken before monitor gain, so ducking never weakens recognition audio.
 * Only attach monitoring when local tab playback is suppressed (otherwise you'd double audio).
 */
export function createOriginalAudioMonitor(opts: OriginalMonitorOptions = {}) {
  const duckRatioDefault = opts.duckRatio ?? 0.2;
  const duckDownMs = opts.duckDownMs ?? 150;
  const duckUpMs = opts.duckUpMs ?? 400;
  const holdoffMs = opts.holdoffMs ?? 320;

  let ctx: AudioContext | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let processor: ScriptProcessorNode | null = null;
  let silentGain: GainNode | null = null;
  let monitorGain: GainNode | null = null;
  let chunker: BoundedPcmChunker | null = null;
  let sendAudio: ((bytes: Uint8Array) => void) | null = null;
  let shouldSend = () => true;

  let userVolume = 1;
  let duckEnabled = true;
  let duckRatio = duckRatioDefault;
  let translationPlaying = false;
  let unduckTimer: ReturnType<typeof setTimeout> | null = null;
  let monitorEnabled = false;

  function clearUnduckTimer() {
    if (unduckTimer != null) {
      clearTimeout(unduckTimer);
      unduckTimer = null;
    }
  }

  function desiredGain(): number {
    if (!monitorEnabled) return 0;
    if (translationPlaying && duckEnabled) {
      return Math.max(0, Math.min(1, userVolume * duckRatio));
    }
    return Math.max(0, Math.min(1, userVolume));
  }

  function rampMonitor(towardDuck: boolean) {
    if (!ctx || !monitorGain || !monitorEnabled) return;
    const now = ctx.currentTime;
    const duration = (towardDuck ? duckDownMs : duckUpMs) / 1000;
    try {
      monitorGain.gain.cancelScheduledValues(now);
      monitorGain.gain.setValueAtTime(monitorGain.gain.value, now);
      monitorGain.gain.linearRampToValueAtTime(desiredGain(), now + Math.max(0.01, duration));
    } catch {
      monitorGain.gain.value = desiredGain();
    }
  }

  function applyImmediate() {
    if (!ctx || !monitorGain) return;
    const now = ctx.currentTime;
    try {
      monitorGain.gain.cancelScheduledValues(now);
      monitorGain.gain.setValueAtTime(desiredGain(), now);
    } catch {
      monitorGain.gain.value = desiredGain();
    }
  }

  return {
    async unlock(): Promise<void> {
      if (!ctx) return;
      if (ctx.state === 'suspended') await ctx.resume();
    },

    /**
     * @param monitor Whether to play captured audio to speakers (only when local tab playback is suppressed).
     */
    attach(args: {
      stream: MediaStream;
      monitor: boolean;
      onSendAudio: (bytes: Uint8Array) => void;
      isSending: () => boolean;
    }): void {
      this.detach();
      sendAudio = args.onSendAudio;
      shouldSend = args.isSending;
      monitorEnabled = args.monitor;

      chunker = new BoundedPcmChunker({
        maxBufferedMs: opts.maxBufferedMs ?? 1500,
        onGap: opts.onGap,
      });

      ctx = new AudioContext();
      sourceNode = ctx.createMediaStreamSource(args.stream);
      const channels = Math.max(1, args.stream.getAudioTracks()[0]?.getSettings().channelCount ?? 1);
      processor = ctx.createScriptProcessor(4096, channels, 1);
      silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      monitorGain = ctx.createGain();
      monitorGain.gain.value = monitorEnabled ? desiredGain() : 0;

      processor.onaudioprocess = (ev) => {
        if (!shouldSend()) return;
        const input = ev.inputBuffer;
        const ch = input.numberOfChannels;
        const frames = input.length;
        const interleaved = new Float32Array(frames * ch);
        for (let c = 0; c < ch; c += 1) {
          const data = input.getChannelData(c);
          for (let i = 0; i < frames; i += 1) {
            interleaved[i * ch + c] = data[i] ?? 0;
          }
        }
        const chunks = chunker?.pushFloat(interleaved, ch, input.sampleRate) ?? [];
        for (const bytes of chunks) sendAudio?.(bytes);
      };

      // PCM tap path (always silent to destination so the processor runs).
      sourceNode.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(ctx.destination);

      // Monitor path — only audible when local playback is suppressed.
      if (monitorEnabled) {
        sourceNode.connect(monitorGain);
        monitorGain.connect(ctx.destination);
      }
    },

    setVolume(v: number): void {
      userVolume = Math.max(0, Math.min(1, v));
      // Volume changes apply smoothly but quickly when not mid-duck transition.
      if (translationPlaying && duckEnabled) {
        rampMonitor(true);
      } else {
        applyImmediate();
      }
    },

    getVolume(): number {
      return userVolume;
    },

    setDuckEnabled(next: boolean): void {
      duckEnabled = next;
      if (translationPlaying) {
        rampMonitor(next);
      } else {
        applyImmediate();
      }
    },

    isDuckEnabled(): boolean {
      return duckEnabled;
    },

    setDuckRatio(ratio: number): void {
      duckRatio = Math.max(0.05, Math.min(0.5, ratio));
      if (translationPlaying && duckEnabled) rampMonitor(true);
    },

    getDuckRatio(): number {
      return duckRatio;
    },

    /** Call when translated voice starts/stops actually playing (not merely when chunks arrive). */
    setTranslationPlaying(active: boolean): void {
      if (active) {
        clearUnduckTimer();
        if (!translationPlaying) {
          translationPlaying = true;
          rampMonitor(true);
        }
        return;
      }
      clearUnduckTimer();
      unduckTimer = setTimeout(() => {
        unduckTimer = null;
        translationPlaying = false;
        rampMonitor(false);
      }, holdoffMs);
    },

    isMonitoring(): boolean {
      return monitorEnabled;
    },

    detach(): void {
      clearUnduckTimer();
      translationPlaying = false;
      try {
        processor?.disconnect();
      } catch {
        /* ignore */
      }
      try {
        sourceNode?.disconnect();
      } catch {
        /* ignore */
      }
      try {
        silentGain?.disconnect();
      } catch {
        /* ignore */
      }
      try {
        monitorGain?.disconnect();
      } catch {
        /* ignore */
      }
      processor = null;
      sourceNode = null;
      silentGain = null;
      monitorGain = null;
      chunker?.reset();
      chunker = null;
      sendAudio = null;
      if (ctx) {
        void ctx.close().catch(() => undefined);
      }
      ctx = null;
      monitorEnabled = false;
    },
  };
}

export type OriginalAudioMonitor = ReturnType<typeof createOriginalAudioMonitor>;
