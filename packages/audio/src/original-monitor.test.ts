import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOriginalAudioMonitor } from './original-monitor';

class FakeParam {
  value = 1;
  cancelScheduledValues = vi.fn();
  setValueAtTime = vi.fn((v: number) => {
    this.value = v;
  });
  linearRampToValueAtTime = vi.fn((v: number) => {
    this.value = v;
  });
}

class FakeGain {
  gain = new FakeParam();
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeProcessor {
  onaudioprocess: ((ev: {
    inputBuffer: {
      numberOfChannels: number;
      length: number;
      sampleRate: number;
      getChannelData: (c: number) => Float32Array;
    };
  }) => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeSource {
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeAudioContext {
  currentTime = 0;
  state: AudioContextState = 'running';
  destination = {};
  createMediaStreamSource = vi.fn(() => new FakeSource());
  createScriptProcessor = vi.fn(() => new FakeProcessor());
  createGain = vi.fn(() => new FakeGain());
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  close = vi.fn(async () => undefined);
}

describe('createOriginalAudioMonitor', () => {
  let Ctx: typeof FakeAudioContext;

  beforeEach(() => {
    Ctx = FakeAudioContext;
    vi.stubGlobal('AudioContext', Ctx);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function attachMonitor(monitor = true) {
    const m = createOriginalAudioMonitor({
      duckRatio: 0.2,
      duckDownMs: 150,
      duckUpMs: 400,
      holdoffMs: 320,
    });
    m.attach({
      stream: {
        getAudioTracks: () => [{ getSettings: () => ({ channelCount: 1 }) }],
      } as unknown as MediaStream,
      monitor,
      onSendAudio: () => undefined,
      isSending: () => true,
    });
    return m;
  }

  it('keeps monitor silent when monitoring is disabled', () => {
    const createGain = vi.fn(() => new FakeGain());
    class CtxNoMonitor extends FakeAudioContext {
      createGain = createGain;
    }
    vi.stubGlobal('AudioContext', CtxNoMonitor);
    const m = createOriginalAudioMonitor();
    m.attach({
      stream: {
        getAudioTracks: () => [{ getSettings: () => ({ channelCount: 1 }) }],
      } as unknown as MediaStream,
      monitor: false,
      onSendAudio: () => undefined,
      isSending: () => true,
    });
    // Two gains: silent tap + monitor gain forced to 0.
    expect(createGain).toHaveBeenCalled();
    const gains = createGain.mock.results.map((r) => r.value as FakeGain);
    expect(gains[1]?.gain.value).toBe(0);
    m.detach();
  });

  it('ducks to ratio while translation plays and restores after holdoff', () => {
    const gains: FakeGain[] = [];
    class CtxTrack extends FakeAudioContext {
      createGain = vi.fn(() => {
        const g = new FakeGain();
        gains.push(g);
        return g;
      });
    }
    vi.stubGlobal('AudioContext', CtxTrack);
    const m = attachMonitor(true);
    const monitorGain = gains[1]!;
    expect(monitorGain.gain.value).toBe(1);

    m.setTranslationPlaying(true);
    expect(monitorGain.gain.linearRampToValueAtTime).toHaveBeenCalled();
    expect(monitorGain.gain.value).toBeCloseTo(0.2);

    m.setTranslationPlaying(false);
    // Still ducked during holdoff.
    expect(monitorGain.gain.value).toBeCloseTo(0.2);
    vi.advanceTimersByTime(319);
    expect(monitorGain.gain.value).toBeCloseTo(0.2);
    vi.advanceTimersByTime(2);
    expect(monitorGain.gain.value).toBe(1);
    m.detach();
  });

  it('does not unduck between adjacent translation chunks within holdoff', () => {
    const gains: FakeGain[] = [];
    class CtxTrack extends FakeAudioContext {
      createGain = vi.fn(() => {
        const g = new FakeGain();
        gains.push(g);
        return g;
      });
    }
    vi.stubGlobal('AudioContext', CtxTrack);
    const m = attachMonitor(true);
    const monitorGain = gains[1]!;

    m.setTranslationPlaying(true);
    m.setTranslationPlaying(false);
    vi.advanceTimersByTime(100);
    m.setTranslationPlaying(true);
    expect(monitorGain.gain.value).toBeCloseTo(0.2);
    m.setTranslationPlaying(false);
    vi.advanceTimersByTime(320);
    expect(monitorGain.gain.value).toBe(1);
    m.detach();
  });

  it('user volume scales ducked and unducked levels', () => {
    const gains: FakeGain[] = [];
    class CtxTrack extends FakeAudioContext {
      createGain = vi.fn(() => {
        const g = new FakeGain();
        gains.push(g);
        return g;
      });
    }
    vi.stubGlobal('AudioContext', CtxTrack);
    const m = attachMonitor(true);
    const monitorGain = gains[1]!;
    m.setVolume(0.5);
    expect(monitorGain.gain.value).toBeCloseTo(0.5);
    m.setTranslationPlaying(true);
    expect(monitorGain.gain.value).toBeCloseTo(0.1);
    m.detach();
  });
});
