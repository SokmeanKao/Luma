export type PcmMeta = {
  sampleRate: number;
  channels: number;
};

export type WinAudioBinding = {
  isSupported(): boolean;
  hwndToPid(hwnd: number): number;
  startProcessLoopback(opts: {
    pid?: number;
    hwnd?: number;
    includeProcessTree?: boolean;
  }): void;
  stop(): void;
  onPcm(cb: (pcm: Buffer, meta: PcmMeta) => void): () => void;
  onEnded(cb: () => void): () => void;
  resolveHost?(): string | null;
};

declare const binding: WinAudioBinding;
export default binding;
