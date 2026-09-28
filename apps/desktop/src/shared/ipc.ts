export const IPC = {
  setAlwaysOnTop: 'luma:set-always-on-top',
  getAlwaysOnTop: 'luma:get-always-on-top',
  openFloat: 'luma:open-float',
  closeFloat: 'luma:close-float',
  floatClosed: 'luma:float-closed',
  publishTranscript: 'luma:publish-transcript',
  transcriptUpdate: 'luma:transcript-update',
  pickerSources: 'luma:picker-sources',
  pickerChoose: 'luma:picker-choose',
  pickerCancel: 'luma:picker-cancel',
  captureIsSupported: 'luma:capture-is-supported',
  captureStart: 'luma:capture-start',
  captureStop: 'luma:capture-stop',
  capturePcm: 'luma:capture-pcm',
  captureEnded: 'luma:capture-ended',
  captureError: 'luma:capture-error',
  pickProcessSource: 'luma:pick-process-source',
} as const;

export type FloatTranscriptSnapshot = {
  entries: Array<{
    id: string;
    translatedText: string;
    originalText?: string;
    final: boolean;
  }>;
  statusLabel?: string;
};

export type PickerSourceItem = {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbDataUrl: string;
  hwnd?: number;
};

export type ProcessSourcePick = {
  processId: number;
  hwnd: number;
  label: string;
  displaySurface: string;
};

export type LumaDesktopApi = {
  setAlwaysOnTop(flag: boolean): Promise<void>;
  getAlwaysOnTop(): Promise<boolean>;
  openFloat(): Promise<void>;
  closeFloat(): Promise<void>;
  onFloatClosed(cb: () => void): () => void;
  publishTranscript(snapshot: FloatTranscriptSnapshot): void;
  onTranscriptUpdate(cb: (snapshot: FloatTranscriptSnapshot) => void): () => void;
  onPickerSources(cb: (sources: PickerSourceItem[]) => void): () => void;
  choosePickerSource(id: string): void;
  cancelPicker(): void;
  isProcessLoopbackSupported(): Promise<boolean>;
  pickProcessSource(): Promise<ProcessSourcePick | null>;
  startProcessLoopback(opts: { processId?: number; hwnd: number; label: string }): Promise<void>;
  stopProcessLoopback(): Promise<void>;
  onProcessPcm(
    cb: (pcm: Uint8Array, meta: { sampleRate: number; channels: number }) => void,
  ): () => void;
  onProcessCaptureEnded(cb: () => void): () => void;
};
