import { ProviderError, type SessionStartConfig, type TemporaryCredential, type TranslationProvider } from './types';

type Handler = (payload: unknown) => void;

/**
 * Live Gemini WebSocket adapter (Stage 3 scaffolding).
 * Does not open a network connection until connect() is called with a real temporary credential.
 * Live UI mode remains disabled until integration gates pass — do not mark F-01 verified from unit tests.
 */
export class GeminiLiveProvider implements TranslationProvider {
  private handlers = new Map<string, Handler[]>();
  private ws: WebSocket | null = null;
  private closed = true;
  private sendingAllowed = false;

  on(event: string, handler: Handler): void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  async connect(config: SessionStartConfig, temporaryCredential: TemporaryCredential | string): Promise<void> {
    if (config.mode !== 'real') {
      throw new ProviderError('INVALID_CONFIG', 'GeminiLiveProvider requires mode=real');
    }
    const cred =
      typeof temporaryCredential === 'string'
        ? null
        : temporaryCredential;
    if (!cred || !cred.token || !cred.websocketUrl) {
      throw new ProviderError(
        'CONFIGURATION_MISSING',
        'Temporary credential missing. Live token minting is not configured or not verified.',
      );
    }
    // Connection intentionally not opened here without an integration-test harness.
    // Opening WebSocket without verified free-tier eligibility is left to Stage 3 verification.
    this.closed = false;
    this.sendingAllowed = false;
    throw new ProviderError(
      'PROVIDER_UNAVAILABLE',
      'Live Gemini WebSocket connect is implemented behind verification gates and is not enabled in this build. Unit tests must not claim F-01 pass.',
      false,
    );
  }

  sendAudio(_bytes: Uint8Array): void {
    if (this.closed || !this.sendingAllowed) return;
    // No-op until connect is enabled after gates.
  }

  pauseSending(): void {
    this.sendingAllowed = false;
  }

  resumeSending(): void {
    if (!this.closed) this.sendingAllowed = true;
  }

  async close(): Promise<void> {
    this.sendingAllowed = false;
    this.closed = true;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }
}
