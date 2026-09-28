export type SessionState =
  | 'idle'
  | 'selecting'
  | 'connecting'
  | 'listening'
  | 'paused'
  | 'reconnecting'
  | 'stopped'
  | 'error'
  | 'quota_exhausted';

export interface TranscriptUpdate {
  sessionId: string;
  segmentId: string;
  revision: number;
  sourceLanguage?: string;
  originalText?: string;
  translatedText: string;
  final: boolean;
  captureTimestamp: number;
  generationId?: number;
}

export interface SessionStartConfig {
  mode: 'demo' | 'real';
  sourceLanguage: string;
  targetLanguage: string;
  sessionId?: string;
}

export interface TranslationProvider {
  connect(config: SessionStartConfig, temporaryCredential: string): Promise<void>;
  sendAudio(bytes: Uint8Array): void;
  close(): Promise<void>;
  on(event: 'transcript' | 'error' | 'usage', handler: (payload: unknown) => void): void;
}

export const SUPPORTED_SOURCE_LANGUAGES = ['ko'] as const;
