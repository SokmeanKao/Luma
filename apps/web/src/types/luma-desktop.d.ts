import type { ProcessLoopbackDesktopApi } from '@luma/audio';

declare global {
  interface Window {
    /** Present only inside the Electron desktop renderer. */
    lumaDesktop?: ProcessLoopbackDesktopApi & Record<string, unknown>;
  }
}

export {};
