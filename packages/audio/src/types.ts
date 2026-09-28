export type SourceKind = 'tab' | 'system';

export interface CaptureStartResult {
  stream: MediaStream;
  sourceKind: SourceKind;
  label: string;
  displaySurface?: string;
  /**
   * True only for verified browser-tab capture with Luma’s own tab excluded.
   * Voice playback must stay off when false (system/window/unknown → loop risk).
   */
  voicePlaybackSafe: boolean;
  /**
   * True when the UA suppressed the tab’s local speakers while still capturing audio.
   * Only then can Luma safely monitor/duck original playback without duplex echo.
   */
  localPlaybackSuppressed: boolean;
  stop: () => void;
}

export interface CaptureAdapter {
  start(opts?: {
    preferredSourceKind?: SourceKind;
    onEnded?: () => void;
    onError?: (error: Error) => void;
  }): Promise<CaptureStartResult>;
}

export class CaptureCancelledError extends Error {
  constructor(message = 'Capture chooser was cancelled') {
    super(message);
    this.name = 'CaptureCancelledError';
  }
}

export class NoAudioTrackError extends Error {
  constructor(
    message = 'No audio track in the selected source. Enable “Share tab audio” and try again.',
  ) {
    super(message);
    this.name = 'NoAudioTrackError';
  }
}

export const NEVER_USES_MICROPHONE = true;

export function captureApisUsed(): string[] {
  return ['getDisplayMedia'];
}
