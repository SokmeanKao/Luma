import winAudio from '@luma/win-audio';
import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import { IPC } from '../shared/ipc';
import { pickProcessCaptureSource } from './pick-source';

let pcmUnsub: (() => void) | null = null;
let endedUnsub: (() => void) | null = null;
let captureSubscriber: Electron.WebContents | null = null;

export function registerWinAudioIpc(getWorkspace: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.captureIsSupported, () => {
    try {
      return Boolean(winAudio.isSupported());
    } catch {
      return false;
    }
  });

  ipcMain.handle(IPC.pickProcessSource, async () => {
    return pickProcessCaptureSource(getWorkspace());
  });

  ipcMain.handle(
    IPC.captureStart,
    async (event, opts: { processId?: number; hwnd?: number; label?: string }) => {
      const hwnd = Number(opts?.hwnd || 0);
      const pid = Number(opts?.processId || 0);
      if (!hwnd && !pid) throw new Error('hwnd or processId required');

      captureSubscriber = event.sender;
      pcmUnsub?.();
      endedUnsub?.();

      pcmUnsub = winAudio.onPcm((pcm, meta) => {
        if (!captureSubscriber || captureSubscriber.isDestroyed()) return;
        const copy = Buffer.from(pcm);
        captureSubscriber.send(IPC.capturePcm, copy, {
          sampleRate: meta.sampleRate,
          channels: meta.channels,
        });
      });
      endedUnsub = winAudio.onEnded(() => {
        if (captureSubscriber && !captureSubscriber.isDestroyed()) {
          captureSubscriber.send(IPC.captureEnded);
        }
      });

      try {
        winAudio.startProcessLoopback(hwnd ? { hwnd } : { pid });
      } catch (err) {
        pcmUnsub?.();
        endedUnsub?.();
        pcmUnsub = null;
        endedUnsub = null;
        throw err;
      }
    },
  );

  ipcMain.handle(IPC.captureStop, () => {
    winAudio.stop();
    pcmUnsub?.();
    endedUnsub?.();
    pcmUnsub = null;
    endedUnsub = null;
    captureSubscriber = null;
  });
}
