import {
  CaptureCancelledError,
  NoAudioTrackError,
  type CaptureAdapter,
  type CaptureStartResult,
  type SourceKind,
} from './types';
import { createPcmMediaStreamBridge } from './pcm-stream-bridge';

export type ProcessLoopbackDesktopApi = {
  isProcessLoopbackSupported(): Promise<boolean>;
  pickProcessSource(): Promise<{
    processId: number;
    hwnd?: number;
    label: string;
    displaySurface: string;
  } | null>;
  startProcessLoopback(opts: {
    processId?: number;
    hwnd?: number;
    label: string;
  }): Promise<void>;
  stopProcessLoopback(): Promise<void>;
  onProcessPcm(
    cb: (pcm: Uint8Array, meta: { sampleRate: number; channels: number }) => void,
  ): () => void;
  onProcessCaptureEnded(cb: () => void): () => void;
};

/**
 * Desktop capture via WASAPI process loopback (Electron + @luma/win-audio host).
 * voicePlaybackSafe is true — Luma TTS is a different PID and is not in the mix.
 */
export class ProcessLoopbackCaptureAdapter implements CaptureAdapter {
  constructor(private readonly desktop: ProcessLoopbackDesktopApi) {}

  async start(opts?: {
    preferredSourceKind?: SourceKind;
    onEnded?: () => void;
    onError?: (error: Error) => void;
  }): Promise<CaptureStartResult> {
    const supported = await this.desktop.isProcessLoopbackSupported();
    if (!supported) {
      throw new Error(
        'Per-app audio needs Windows 10 build 20348+ (or Windows 11) and a built Luma win-audio host.',
      );
    }

    const picked = await this.desktop.pickProcessSource();
    if (!picked) {
      throw new CaptureCancelledError();
    }
    if (!picked.hwnd && (!picked.processId || picked.processId <= 0)) {
      throw new Error('Could not resolve that window. Pick an app window (not a screen).');
    }

    const bridge = createPcmMediaStreamBridge();
    let unsubPcm: (() => void) | null = null;
    let unsubEnded: (() => void) | null = null;
    let stopped = false;

    const stopAll = () => {
      if (stopped) return;
      stopped = true;
      unsubPcm?.();
      unsubEnded?.();
      void this.desktop.stopProcessLoopback();
      bridge.stop();
    };

    unsubPcm = this.desktop.onProcessPcm((pcm, meta) => {
      bridge.pushPcm16le(pcm, meta.sampleRate, meta.channels);
    });
    unsubEnded = this.desktop.onProcessCaptureEnded(() => {
      stopAll();
      opts?.onEnded?.();
    });

    try {
      await this.desktop.startProcessLoopback({
        processId: picked.processId || undefined,
        hwnd: picked.hwnd,
        label: picked.label,
      });
    } catch (err) {
      stopAll();
      throw err instanceof Error ? err : new Error(String(err));
    }

    if (bridge.stream.getAudioTracks().length === 0) {
      stopAll();
      throw new NoAudioTrackError('Process loopback produced no audio track.');
    }

    return {
      stream: bridge.stream,
      sourceKind: 'system',
      label: picked.label,
      displaySurface: picked.displaySurface || 'window',
      voicePlaybackSafe: true,
      localPlaybackSuppressed: false,
      stop: stopAll,
    };
  }
}
