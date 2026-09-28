export type ProviderErrorCode =
  | 'INVALID_CONFIG'
  | 'NOT_AUTHORIZED'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'CONFIGURATION_MISSING'
  | 'QUOTA_EXHAUSTED'
  | 'NETWORK'
  | 'SESSION_EXPIRED'
  | 'UNKNOWN';

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;

  constructor(code: ProviderErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.retryable = retryable;
  }
}

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

export interface TemporaryCredential {
  token: string;
  expiresAt: string;
  model: string;
  apiVersion: string;
  websocketUrl: string;
  targetLanguageCode?: string;
  echoTargetLanguage?: boolean;
  setupLocked?: boolean;
}

export type ProviderEventMap = {
  transcript: TranscriptUpdate;
  audio: TranslatedAudioChunk;
  inputLanguage: { languageCode: string; generationId: number; sessionId: string };
  error: ProviderError;
  usage: { note: string };
  interrupted: { at: number; generationId?: number; sessionId?: string };
};

/** Provider-emitted translated speech chunk (PCM). sampleRate is filled after MIME parse. */
export interface TranslatedAudioChunk {
  sessionId: string;
  generationId: number;
  mimeType: string;
  pcm: Uint8Array;
  sampleRate: number;
  detectedSourceLanguage?: string;
}

export interface TranslationProvider {
  connect(config: SessionStartConfig, temporaryCredential: TemporaryCredential | string): Promise<void>;
  sendAudio(bytes: Uint8Array): void;
  close(): Promise<void>;
  on(event: keyof ProviderEventMap | string, handler: (payload: unknown) => void): void;
}

export const SUPPORTED_SOURCE_LANGUAGES = ['ko'] as const;
/** Expand only when a verified pair is added to the Go languages catalog. */
export const DEFAULT_LANGUAGE_PAIR = { source: 'ko', target: 'en' } as const;

/** Provider still returns AUDIO modality; clients may choose not to play it (Text only). */
export const DISCARD_PROVIDER_AUDIO_OUTPUT = false;
