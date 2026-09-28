import {
  CaptureCancelledError,
  NoAudioTrackError,
  NEVER_USES_MICROPHONE,
  type CaptureAdapter,
  type CaptureStartResult,
  type SourceKind,
} from './types';

export { NEVER_USES_MICROPHONE };

/**
 * Browser tab/window capture via getDisplayMedia.
 * Must be invoked from a user gesture. Never opens the microphone input API.
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

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
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

    const sourceKind: SourceKind =
      opts?.preferredSourceKind === 'system' ? 'system' : 'tab';

    const notifyEnded = () => opts?.onEnded?.();
    for (const track of stream.getTracks()) {
      track.addEventListener('ended', notifyEnded);
    }

    return {
      stream,
      sourceKind,
      stop: () => {
        for (const track of stream.getTracks()) {
          track.removeEventListener('ended', notifyEnded);
          track.stop();
        }
      },
    };
  }
}
