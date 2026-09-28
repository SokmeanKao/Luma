import { app, BrowserWindow, ipcMain, session } from 'electron';
import { join } from 'path';
import { IPC, type FloatTranscriptSnapshot } from '../shared/ipc';
import { registerWinAudioIpc } from './win-audio-host';

let workspaceWindow: BrowserWindow | null = null;
let floatWindow: BrowserWindow | null = null;
let floatAlwaysOnTop = true;
let lastTranscript: FloatTranscriptSnapshot = { entries: [] };

function securePrefs(): Electron.WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  };
}

/** Keep display-media available as text-only fallback (system loopback). */
function enableDisplayMediaFallback(): void {
  // Intentionally no auto-grant handler for primary path — process loopback is preferred.
  // If renderer still calls getDisplayMedia, Chromium may fail without a handler; that is OK
  // because LiveWorkspace uses ProcessLoopbackCaptureAdapter on desktop.
  void session;
}

function isDev(): boolean {
  return Boolean(process.env.ELECTRON_RENDERER_URL);
}

function loadRenderer(win: BrowserWindow, page: 'index' | 'float'): void {
  if (isDev()) {
    const base = process.env.ELECTRON_RENDERER_URL!;
    const url = page === 'index' ? base : `${base}/float.html`;
    void win.loadURL(url);
    return;
  }
  const file =
    page === 'index'
      ? join(__dirname, '../renderer/index.html')
      : join(__dirname, '../renderer/float.html');
  void win.loadFile(file);
}

function createWorkspaceWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    title: 'Luma',
    show: false,
    webPreferences: securePrefs(),
  });

  win.on('ready-to-show', () => {
    win.show();
  });

  win.on('closed', () => {
    workspaceWindow = null;
    if (floatWindow && !floatWindow.isDestroyed()) {
      floatWindow.destroy();
      floatWindow = null;
    }
  });

  loadRenderer(win, 'index');
  return win;
}

function createFloatWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 420,
    height: 220,
    minWidth: 280,
    minHeight: 140,
    title: 'Luma subtitles',
    show: false,
    alwaysOnTop: floatAlwaysOnTop,
    skipTaskbar: true,
    autoHideMenuBar: true,
    webPreferences: securePrefs(),
  });

  win.setAlwaysOnTop(floatAlwaysOnTop, 'floating');

  win.on('ready-to-show', () => {
    win.show();
  });

  win.on('closed', () => {
    floatWindow = null;
    if (workspaceWindow && !workspaceWindow.isDestroyed()) {
      workspaceWindow.webContents.send(IPC.floatClosed);
    }
  });

  loadRenderer(win, 'float');
  return win;
}

function ensureFloatWindow(): BrowserWindow {
  if (floatWindow && !floatWindow.isDestroyed()) {
    if (!floatWindow.isVisible()) floatWindow.show();
    floatWindow.focus();
    floatWindow.webContents.send(IPC.transcriptUpdate, lastTranscript);
    return floatWindow;
  }
  floatWindow = createFloatWindow();
  floatWindow.webContents.once('did-finish-load', () => {
    floatWindow?.webContents.send(IPC.transcriptUpdate, lastTranscript);
  });
  return floatWindow;
}

function registerShellIpc(): void {
  ipcMain.handle(IPC.setAlwaysOnTop, (_event, flag: unknown) => {
    floatAlwaysOnTop = Boolean(flag);
    if (floatWindow && !floatWindow.isDestroyed()) {
      floatWindow.setAlwaysOnTop(floatAlwaysOnTop, 'floating');
    }
  });

  ipcMain.handle(IPC.getAlwaysOnTop, () => floatAlwaysOnTop);

  ipcMain.handle(IPC.openFloat, () => {
    ensureFloatWindow();
  });

  ipcMain.handle(IPC.closeFloat, () => {
    if (floatWindow && !floatWindow.isDestroyed()) {
      floatWindow.close();
    }
  });

  ipcMain.on(IPC.publishTranscript, (_event, snapshot: FloatTranscriptSnapshot) => {
    if (!snapshot || !Array.isArray(snapshot.entries)) return;
    lastTranscript = {
      entries: snapshot.entries.map((e) => ({
        id: String(e.id),
        translatedText: String(e.translatedText ?? ''),
        originalText: e.originalText != null ? String(e.originalText) : undefined,
        final: Boolean(e.final),
      })),
      statusLabel: snapshot.statusLabel != null ? String(snapshot.statusLabel) : undefined,
    };
    if (floatWindow && !floatWindow.isDestroyed()) {
      floatWindow.webContents.send(IPC.transcriptUpdate, lastTranscript);
    }
  });
}

app.whenReady().then(() => {
  enableDisplayMediaFallback();
  registerShellIpc();
  registerWinAudioIpc(() => workspaceWindow);
  workspaceWindow = createWorkspaceWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      workspaceWindow = createWorkspaceWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
