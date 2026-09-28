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
};

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

    const constraints: DisplayMediaOpts = {
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      // Prefer excluding this surface and system audio when the UA supports it.
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
      throw err instanceof Error ? err : new Error(String(err));
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      for (const track of stream.getTracks()) track.stop();
      throw new NoAudioTrackError();
    }

    const audio = audioTracks[0]!;
    const video = stream.getVideoTracks()[0];
    const displaySurface =
      (video?.getSettings() as { displaySurface?: string } | undefined)?.displaySurface ??
      (audio.getSettings() as { displaySurface?: string }).displaySurface;
    const label =
      audio.label ||
      video?.label ||
      (displaySurface === 'browser'
        ? 'Browser tab'
        : displaySurface === 'window'
          ? 'Application window'
          : displaySurface === 'monitor'
            ? 'Entire screen'
            : 'Selected playback source');

    const sourceKind: SourceKind =
      displaySurface === 'monitor' || opts?.preferredSourceKind === 'system' ? 'system' : 'tab';

    const notifyEnded = () => opts?.onEnded?.();
    for (const track of stream.getTracks()) {
      track.addEventListener('ended', notifyEnded);
    }

    return {
      stream,
      sourceKind,
      label,
      displaySurface,
      stop: () => {
        for (const track of stream.getTracks()) {
          track.removeEventListener('ended', notifyEnded);
          track.stop();
        }
      },
    };
  }
}
