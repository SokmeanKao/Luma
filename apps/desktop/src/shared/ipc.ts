export const IPC = {
  setAlwaysOnTop: 'luma:set-always-on-top',
  getAlwaysOnTop: 'luma:get-always-on-top',
  openFloat: 'luma:open-float',
  closeFloat: 'luma:close-float',
  floatClosed: 'luma:float-closed',
  publishTranscript: 'luma:publish-transcript',
  transcriptUpdate: 'luma:transcript-update',
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

export type LumaDesktopApi = {
  setAlwaysOnTop(flag: boolean): Promise<void>;
  getAlwaysOnTop(): Promise<boolean>;
  openFloat(): Promise<void>;
  closeFloat(): Promise<void>;
  onFloatClosed(cb: () => void): () => void;
  publishTranscript(snapshot: FloatTranscriptSnapshot): void;
  onTranscriptUpdate(cb: (snapshot: FloatTranscriptSnapshot) => void): () => void;
};
