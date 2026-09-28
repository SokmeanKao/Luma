import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC,
  type FloatTranscriptSnapshot,
  type LumaDesktopApi,
} from '../shared/ipc';

const api: LumaDesktopApi = {
  setAlwaysOnTop: (flag) => ipcRenderer.invoke(IPC.setAlwaysOnTop, Boolean(flag)),
  getAlwaysOnTop: () => ipcRenderer.invoke(IPC.getAlwaysOnTop),
  openFloat: () => ipcRenderer.invoke(IPC.openFloat),
  closeFloat: () => ipcRenderer.invoke(IPC.closeFloat),
  onFloatClosed: (cb) => {
    const handler = () => cb();
    ipcRenderer.on(IPC.floatClosed, handler);
    return () => {
      ipcRenderer.removeListener(IPC.floatClosed, handler);
    };
  },
  publishTranscript: (snapshot) => {
    ipcRenderer.send(IPC.publishTranscript, snapshot);
  },
  onTranscriptUpdate: (cb) => {
    const handler = (_event: IpcRendererEvent, snapshot: FloatTranscriptSnapshot) => {
      cb(snapshot);
    };
    ipcRenderer.on(IPC.transcriptUpdate, handler);
    return () => {
      ipcRenderer.removeListener(IPC.transcriptUpdate, handler);
    };
  },
};

contextBridge.exposeInMainWorld('lumaDesktop', api);
