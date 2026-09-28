import {
  CaptureCancelledError,
  NoAudioTrackError,
  NEVER_USES_MICROPHONE,
  type CaptureAdapter,
  type CaptureStartResult,
  type SourceKind,
} from './types';

export { NEVER_USES_MICROPHONE };

type DisplayMediaOpts = MediaStreamConstraints & {
  preferCurrentTab?: boolean;
  selfBrowserSurface?: 'include' | 'exclude';
  systemAudio?: 'include' | 'exclude';
  controller?: unknown;
};

function suppressLocalAudioPlaybackSupported(): boolean {
  try {
    const supported = navigator.mediaDevices?.getSupportedConstraints?.() as
      | Record<string, boolean>
      | undefined;
    return Boolean(supported?.suppressLocalAudioPlayback);
  } catch {
    return false;
  }
}

function isElectronRenderer(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    (/Electron/i.test(navigator.userAgent) ||
      // Desktop preload bridge
      (typeof window !== 'undefined' && 'lumaDesktop' in window))
  );
}

/**
 * Browser tab/window capture via getDisplayMedia.
 * Must be invoked from a user gesture. Never opens the microphone input API.
 * Video may be required by the capture API but is never sent to Gemini.
 */
export class BrowserCaptureAdapter implements CaptureAdapter {
  async start(opts?: {
    preferredSourceKind?: SourceKind;
    onEnded?: () => void;
    onError?: (error: Error) => void;
  }): Promise<CaptureStartResult> {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('getDisplayMedia is not available in this browser');
    }

    const electron = isElectronRenderer();
    const wantSuppress = !electron && suppressLocalAudioPlaybackSupported();
    const audioConstraints: Record<string, unknown> | boolean = electron
      ? true
      : {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          ...(wantSuppress ? { suppressLocalAudioPlayback: true } : {}),
        };

    // Electron cannot use Chrome's displaySurface:'browser' tab picker; the main
    // process display-media handler supplies screen/window + loopback instead.
    const constraints: DisplayMediaOpts = electron
      ? { video: true, audio: audioConstraints as MediaTrackConstraints }
      : {
          video: { displaySurface: 'browser' },
          audio: audioConstraints as MediaTrackConstraints,
          selfBrowserSurface: 'exclude',
          systemAudio: 'exclude',
          preferCurrentTab: false,
        };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia(constraints);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'AbortError') {
        throw new CaptureCancelledError();
      }
      if (name === 'NotSupportedError') {
        throw new Error(
          electron
            ? 'Screen capture is not available in this Electron build. Restart the desktop app after updating.'
            : 'This browser cannot share a tab. Use Chrome or Edge on Windows.',
        );
      }
      throw err instanceof Error ? err : new Error(String(err));
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      for (const track of stream.getTracks()) track.stop();
      throw new NoAudioTrackError();
    }

    const audio = audioTracks[0]!;
    const video = stream.getVideoTracks()[0];
    const settings = audio.getSettings() as MediaTrackSettings & {
      suppressLocalAudioPlayback?: boolean;
      displaySurface?: string;
    };
    const videoSettings = video?.getSettings() as { displaySurface?: string } | undefined;
    const displaySurface = videoSettings?.displaySurface ?? settings.displaySurface;
    const label =
      audio.label ||
      video?.label ||
      (displaySurface === 'browser'
        ? 'Browser tab'
        : displaySurface === 'window'
          ? 'Application window'
          : displaySurface === 'monitor'
            ? 'Entire screen'
            : electron
              ? 'Desktop playback'
              : 'Selected playback source');

    const sourceKind: SourceKind =
      displaySurface === 'monitor' || opts?.preferredSourceKind === 'system'
        ? 'system'
        : displaySurface === 'window' || electron
          ? 'system'
          : 'tab';

    // Electron loopback is system-wide (not a suppress-capable Chrome tab).
    const voicePlaybackSafe = displaySurface === 'browser' && !electron;
    const localPlaybackSuppressed =
      voicePlaybackSafe && settings.suppressLocalAudioPlayback === true;

    const notifyEnded = () => opts?.onEnded?.();
    for (const track of stream.getTracks()) {
      track.addEventListener('ended', notifyEnded);
    }

    return {
      stream,
      sourceKind,
      label,
      displaySurface: displaySurface ?? (electron ? 'monitor' : undefined),
      voicePlaybackSafe,
      localPlaybackSuppressed,
      stop: () => {
        for (const track of stream.getTracks()) {
          track.removeEventListener('ended', notifyEnded);
          track.stop();
        }
      },
    };
  }
}
