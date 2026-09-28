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
  error: ProviderError;
  usage: { note: string };
  interrupted: { at: number };
};

export interface TranslationProvider {
  connect(config: SessionStartConfig, temporaryCredential: TemporaryCredential | string): Promise<void>;
  sendAudio(bytes: Uint8Array): void;
  close(): Promise<void>;
  on(event: keyof ProviderEventMap | string, handler: (payload: unknown) => void): void;
}

export const SUPPORTED_SOURCE_LANGUAGES = ['ko'] as const;

/** Discard provider-generated audio output for the subtitle MVP (do not play it). */
export const DISCARD_PROVIDER_AUDIO_OUTPUT = true;
