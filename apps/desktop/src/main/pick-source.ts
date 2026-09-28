import { BrowserWindow, desktopCapturer, ipcMain } from 'electron';
import { join } from 'path';
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

function parseWindowHwnd(sourceId: string): number | undefined {
  const m = /^window:(\d+)/i.exec(sourceId);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Modal list of windows (screens omitted — process loopback needs an HWND/PID).
 */
export async function pickProcessCaptureSource(
  parent: BrowserWindow | null,
): Promise<ProcessSourcePick | null> {
  const raw = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 280, height: 160 },
    fetchWindowIcons: false,
  });
  const sources = raw.filter((s) => !/luma/i.test(s.name));
  if (sources.length === 0) return null;

  const items: PickerSourceItem[] = sources.map((s) => ({
    id: s.id,
    name: s.name,
    kind: 'window',
    thumbDataUrl: s.thumbnail.toDataURL(),
    hwnd: parseWindowHwnd(s.id),
  }));

  return await new Promise<ProcessSourcePick | null>((resolve) => {
    let settled = false;

    const win = new BrowserWindow({
      width: 580,
      height: 560,
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
      const source = sources.find((s) => s.id === String(id));
      if (!source) {
        finish(null);
        return;
      }
      const hwnd = parseWindowHwnd(source.id);
      if (!hwnd) {
        finish(null);
        return;
      }
      finish({
        processId: 0, // resolved in host via hwnd
        hwnd,
        label: source.name,
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
