/** Compute a 0–1 activity level from time-domain PCM samples. */
export function levelFromTimeDomain(samples: Uint8Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const centered = ((samples[i] ?? 128) - 128) / 128;
    sum += centered * centered;
  }
  const rms = Math.sqrt(sum / samples.length);
  return Math.min(1, rms * 3);
}

export interface ActivityMeterHandle {
  getLevel: () => number;
  stop: () => void;
}

/**
 * Monitors playback audio from a MediaStream (never opens a microphone).
 * Call from the same user-gesture turn after capture starts when possible.
 */
export function createActivityMeter(stream: MediaStream): ActivityMeterHandle {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new AudioCtx();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const buffer = new Uint8Array(analyser.fftSize);

  return {
    getLevel: () => {
      analyser.getByteTimeDomainData(buffer);
      return levelFromTimeDomain(buffer);
    },
    stop: () => {
      try {
        source.disconnect();
      } catch {
        /* already disconnected */
      }
      void context.close();
    },
  };
}
