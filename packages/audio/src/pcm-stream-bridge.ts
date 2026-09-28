/**
 * Builds a MediaStream whose audio track is fed from PCM16 LE chunks (process loopback).
 * Prefers MediaStreamTrackGenerator; falls back to a muted oscillator placeholder if unavailable
 * (PCM is still accepted for a future direct path — generator is required for monitor attach).
 */
type AudioTrackGenerator = {
  writable: WritableStream<AudioData>;
} & MediaStreamTrack;

export function createPcmMediaStreamBridge(): {
  stream: MediaStream;
  pushPcm16le: (pcm: Uint8Array, sampleRate: number, channels: number) => void;
  stop: () => void;
} {
  const GeneratorCtor = (
    globalThis as unknown as {
      MediaStreamTrackGenerator?: new (init: { kind: 'audio' }) => AudioTrackGenerator;
    }
  ).MediaStreamTrackGenerator;

  if (!GeneratorCtor || typeof AudioData === 'undefined') {
    // Fallback: empty silent track — attachPcmPipeline still needs a track; levels stay flat
    // until Electron provides AudioData (Chromium does).
    const ctx = new AudioContext({ sampleRate: 48000 });
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const dest = ctx.createMediaStreamDestination();
    osc.connect(gain);
    gain.connect(dest);
    osc.start();
    return {
      stream: dest.stream,
      pushPcm16le: () => {},
      stop: () => {
        try {
          osc.stop();
        } catch {
          /* ignore */
        }
        void ctx.close();
      },
    };
  }

  const track = new GeneratorCtor({ kind: 'audio' });
  const writer = track.writable.getWriter();
  const stream = new MediaStream([track]);
  let stopped = false;
  let framesWritten = 0;

  return {
    stream,
    pushPcm16le: (pcm, sampleRate, channels) => {
      if (stopped || pcm.byteLength === 0) return;
      const ch = Math.max(1, channels | 0);
      const frameCount = Math.floor(pcm.byteLength / 2 / ch);
      if (frameCount <= 0) return;

      // Convert interleaved s16le → planar float32 for AudioData
      const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
      const planar = new Float32Array(frameCount * ch);
      for (let i = 0; i < frameCount; i += 1) {
        for (let c = 0; c < ch; c += 1) {
          const s = view.getInt16((i * ch + c) * 2, true);
          planar[c * frameCount + i] = Math.max(-1, Math.min(1, s / 32768));
        }
      }

      try {
        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate,
          numberOfFrames: frameCount,
          numberOfChannels: ch,
          timestamp: Math.round((framesWritten * 1_000_000) / sampleRate),
          data: planar,
        });
        framesWritten += frameCount;
        void writer.write(audioData).catch(() => {
          audioData.close();
        });
      } catch {
        /* drop on backpressure / closed */
      }
    },
    stop: () => {
      stopped = true;
      void writer.close().catch(() => {});
      for (const t of stream.getTracks()) t.stop();
    },
  };
}
