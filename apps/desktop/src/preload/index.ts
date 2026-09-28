import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC,
  type FloatTranscriptSnapshot,
  type LumaDesktopApi,
  type PickerSourceItem,
  type ProcessSourcePick,
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
  onPickerSources: (cb) => {
    const handler = (_event: IpcRendererEvent, sources: PickerSourceItem[]) => {
      cb(sources);
    };
    ipcRenderer.on(IPC.pickerSources, handler);
    return () => {
      ipcRenderer.removeListener(IPC.pickerSources, handler);
    };
  },
  choosePickerSource: (id) => {
    ipcRenderer.send(IPC.pickerChoose, String(id));
  },
  cancelPicker: () => {
    ipcRenderer.send(IPC.pickerCancel);
  },
  isProcessLoopbackSupported: () => ipcRenderer.invoke(IPC.captureIsSupported),
  pickProcessSource: () => ipcRenderer.invoke(IPC.pickProcessSource) as Promise<ProcessSourcePick | null>,
  startProcessLoopback: (opts) => ipcRenderer.invoke(IPC.captureStart, opts),
  stopProcessLoopback: () => ipcRenderer.invoke(IPC.captureStop),
  onProcessPcm: (cb) => {
    const handler = (
      _event: IpcRendererEvent,
      pcm: Uint8Array,
      meta: { sampleRate: number; channels: number },
    ) => {
      cb(pcm instanceof Uint8Array ? pcm : new Uint8Array(pcm), meta);
    };
    ipcRenderer.on(IPC.capturePcm, handler);
    return () => {
      ipcRenderer.removeListener(IPC.capturePcm, handler);
    };
  },
  onProcessCaptureEnded: (cb) => {
    const handler = () => cb();
    ipcRenderer.on(IPC.captureEnded, handler);
    return () => {
      ipcRenderer.removeListener(IPC.captureEnded, handler);
    };
  },
};

contextBridge.exposeInMainWorld('lumaDesktop', api);
