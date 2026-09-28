import { TranscriptAssembler } from './transcript';
import { shouldDisplayTranslation } from './language-filter';
import type { SessionStartConfig, SessionState, TranscriptUpdate } from './types';

export interface SessionControllerOptions {
  onUpdate: (entry: TranscriptUpdate) => void;
  onStateChange: (state: SessionState) => void;
  maxEntries?: number;
}

export interface SessionController {
  start(config: SessionStartConfig): void;
  pause(): void;
  resume(): void;
  stop(): void;
  clear(): void;
  getState(): SessionState;
  getGenerationId(): number;
  isSendingAudio(): boolean;
  acceptTranscript(update: TranscriptUpdate): void;
  listTranscript(): TranscriptUpdate[];
  getConfig(): SessionStartConfig | null;
}

export function createSessionController(opts: SessionControllerOptions): SessionController {
  let state: SessionState = 'idle';
  let generationId = 0;
  let config: SessionStartConfig | null = null;
  const assembler = new TranscriptAssembler({ maxEntries: opts.maxEntries ?? 100 });

  const setState = (next: SessionState) => {
    state = next;
    opts.onStateChange(state);
  };

  return {
    start(nextConfig) {
      generationId += 1;
      config = nextConfig;
      assembler.clear();
      setState('listening');
    },
    pause() {
      if (state === 'listening') setState('paused');
    },
    resume() {
      if (state === 'paused') setState('listening');
    },
    stop() {
      generationId += 1;
      setState('stopped');
    },
    clear() {
      assembler.clear();
    },
    getState: () => state,
    getGenerationId: () => generationId,
    isSendingAudio: () => state === 'listening',
    getConfig: () => config,
    listTranscript: () => assembler.list(),
    acceptTranscript(update) {
      if (update.generationId !== undefined && update.generationId !== generationId) {
        return;
      }
      if (state === 'stopped' || state === 'idle' || state === 'error') {
        return;
      }
      const selected = config?.sourceLanguage ?? 'ko';
      if (
        !shouldDisplayTranslation({
          selectedSource: selected,
          detectedSource: update.sourceLanguage,
        })
      ) {
        return;
      }
      const applied = assembler.apply(update);
      if (applied) opts.onUpdate(applied);
    },
  };
}
