import { BrowserWindow, desktopCapturer, ipcMain } from 'electron';
import { join } from 'path';
import winAudio from '@luma/win-audio';
import { IPC, type PickerSourceItem, type ProcessSourcePick } from '../shared/ipc';

function isDev(): boolean {
  return Boolean(process.env.ELECTRON_RENDERER_URL);
}

function loadPicker(win: BrowserWindow): void {
  if (isDev()) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/picker.html`);
    return;
  }
  void win.loadFile(join(__dirname, '../renderer/picker.html'));
}

/** Placeholder thumb when capture fails. */
function placeholderThumb(label: string): string {
  const safe = label.replace(/[<>&"']/g, '').slice(0, 40);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="160">
  <rect width="100%" height="100%" fill="#e7efe6"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
    fill="#246849" font-family="Segoe UI, sans-serif" font-size="14">${safe}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Electron Windows capturer ids look like `window:<hwnd>:<pid>`. */
function hwndFromCapturerId(id: string): number | null {
  const parts = id.split(':');
  if (parts[0] !== 'window' || parts.length < 2) return null;
  const n = Number(parts[1]);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

async function resolveThumbnails(
  windows: Array<{ hwnd: number; title: string; processName?: string }>,
): Promise<Map<number, string>> {
  const thumbs = new Map<number, string>();

  // 1) Prefer Electron desktopCapturer (fast, good quality when available).
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 280, height: 160 },
    });
    const byHwnd = new Map<number, string>();
    const byTitle = new Map<string, string>();
    for (const s of sources) {
      if (s.thumbnail.isEmpty()) continue;
      const dataUrl = s.thumbnail.toDataURL();
      if (!dataUrl || dataUrl.length < 32) continue;
      const hwnd = hwndFromCapturerId(s.id);
      if (hwnd) byHwnd.set(hwnd, dataUrl);
      const key = normalizeTitle(s.name);
      if (key && !byTitle.has(key)) byTitle.set(key, dataUrl);
    }
    for (const w of windows) {
      const hit = byHwnd.get(w.hwnd) ?? byTitle.get(normalizeTitle(w.title));
      if (hit) thumbs.set(w.hwnd, hit);
    }
  } catch (err) {
    console.error('[luma] desktopCapturer thumbnails failed', err);
  }

  // 2) Fill gaps with Win32 PrintWindow via host (covers windows Electron omits).
  const missing = windows.map((w) => w.hwnd).filter((h) => !thumbs.has(h));
  if (missing.length > 0 && typeof winAudio.captureThumbnails === 'function') {
    try {
      const captured = winAudio.captureThumbnails(missing);
      for (const [key, dataUrl] of Object.entries(captured)) {
        if (!dataUrl) continue;
        const hwnd = Number(key);
        if (Number.isFinite(hwnd) && hwnd > 0) thumbs.set(hwnd, dataUrl);
      }
    } catch (err) {
      console.error('[luma] PrintWindow thumbnails failed', err);
    }
  }

  return thumbs;
}

/**
 * Modal list of top-level windows via Win32 EnumWindows (not Electron desktopCapturer,
 * which only returns a small capturable subset). Thumbnails come from capturer + PrintWindow.
 */
export async function pickProcessCaptureSource(
  parent: BrowserWindow | null,
): Promise<ProcessSourcePick | null> {
  let listed: Array<{ hwnd: number; pid: number; title: string; processName?: string }> = [];
  try {
    listed = winAudio.listWindows?.() ?? [];
  } catch (err) {
    console.error('[luma] listWindows failed', err);
  }

  const sources = listed
    .filter((s) => s.hwnd > 0 && s.pid > 0 && s.title && !/luma/i.test(s.title))
    .filter((s) => !/^Program Manager$/i.test(s.title))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  if (sources.length === 0) return null;

  const thumbByHwnd = await resolveThumbnails(sources);

  const items: PickerSourceItem[] = sources.map((s) => {
    const suffix = s.processName ? ` · ${s.processName}` : '';
    return {
      id: `hwnd:${s.hwnd}`,
      name: `${s.title}${suffix}`,
      kind: 'window' as const,
      thumbDataUrl: thumbByHwnd.get(s.hwnd) ?? placeholderThumb(s.processName || s.title),
      hwnd: s.hwnd,
    };
  });

  return await new Promise<ProcessSourcePick | null>((resolve) => {
    let settled = false;

    const win = new BrowserWindow({
      width: 640,
      height: 620,
      minWidth: 420,
      minHeight: 360,
      parent: parent && !parent.isDestroyed() ? parent : undefined,
      modal: Boolean(parent && !parent.isDestroyed()),
      show: false,
      autoHideMenuBar: true,
      title: 'Choose app window',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const finish = (value: ProcessSourcePick | null) => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener(IPC.pickerChoose, onChoose);
      ipcMain.removeListener(IPC.pickerCancel, onCancel);
      if (!win.isDestroyed()) win.close();
      resolve(value);
    };

    const onChoose = (event: Electron.IpcMainEvent, id: unknown) => {
      if (event.sender !== win.webContents) return;
      const item = items.find((s) => s.id === String(id));
      const source = sources.find((s) => `hwnd:${s.hwnd}` === String(id));
      if (!item || !source || !item.hwnd) {
        finish(null);
        return;
      }
      finish({
        processId: source.pid,
        hwnd: item.hwnd,
        label: source.title,
        displaySurface: 'window',
      });
    };
    const onCancel = (event: Electron.IpcMainEvent) => {
      if (event.sender !== win.webContents) return;
      finish(null);
    };

    ipcMain.on(IPC.pickerChoose, onChoose);
    ipcMain.on(IPC.pickerCancel, onCancel);

    win.on('closed', () => {
      finish(null);
    });

    win.webContents.once('did-finish-load', () => {
      win.webContents.send(IPC.pickerSources, items);
      win.show();
      win.focus();
    });

    loadPicker(win);
  });
}
