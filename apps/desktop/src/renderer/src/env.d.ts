import type { LumaDesktopApi } from '../../shared/ipc';

declare global {
  interface Window {
    lumaDesktop: LumaDesktopApi;
  }
}

export {};
