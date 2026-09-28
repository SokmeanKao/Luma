import { ProviderError, type SessionStartConfig, type TemporaryCredential, type TranscriptUpdate } from './types';

type Handler = (payload: unknown) => void;

interface ServerMessage {
  setupComplete?: unknown;
  serverContent?: {
    inputTranscription?: { text?: string; finished?: boolean; languageCode?: string };
    outputTranscription?: { text?: string; finished?: boolean; languageCode?: string };
    interrupted?: boolean;
    modelTurn?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
  };
  error?: { code?: number; message?: string; status?: string };
}

/**
 * Live Gemini WebSocket provider for Live Translation.
 * Discards returned audio; surfaces output transcription as English subtitles.
 * Does not fall back to mock/demo samples on failure.
 */
export class GeminiLiveProvider {
  private handlers = new Map<string, Handler[]>();
  private ws: WebSocket | null = null;
  private closed = true;
  private sendingAllowed = false;
  private generationId = 0;
  private sessionId = 'live';
  private segmentSeq = 0;
  private pendingPartialId: string | null = null;
  private connectStartedAt = 0;
  private lastInputText?: string;
  private lastInputLanguage?: string;

  on(event: string, handler: Handler): void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  async connect(config: SessionStartConfig, temporaryCredential: TemporaryCredential | string): Promise<void> {
    if (config.mode !== 'real') {
      throw new ProviderError('INVALID_CONFIG', 'GeminiLiveProvider requires mode=real');
    }
    const cred = typeof temporaryCredential === 'string' ? null : temporaryCredential;
    if (!cred?.token || !cred.websocketUrl) {
      throw new ProviderError(
        'CONFIGURATION_MISSING',
        'Temporary credential missing. Cannot open Live WebSocket.',
      );
    }

    await this.close();
    this.closed = false;
    this.sendingAllowed = false;
    this.sessionId = config.sessionId ?? `live-${Date.now()}`;
    this.segmentSeq = 0;
    this.pendingPartialId = null;
    this.connectStartedAt = Date.now();
    this.generationId += 1;
    const generation = this.generationId;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (err: ProviderError) => {
        if (settled) return;
        settled = true;
        reject(err);
      };
      const ok = () => {
        if (settled) return;
        settled = true;
        this.sendingAllowed = true;
        resolve();
      };

      try {
        this.ws = new WebSocket(cred.websocketUrl);
      } catch (err) {
        fail(
          new ProviderError(
            'NETWORK',
            err instanceof Error ? err.message : 'WebSocket constructor failed',
            true,
          ),
        );
        return;
      }

      const ws = this.ws;
      const timeout = window.setTimeout(() => {
        fail(new ProviderError('NETWORK', 'Timed out waiting for Live setupComplete', true));
        void this.close();
      }, 15000);

      ws.onopen = () => {
        const model = cred.model.startsWith('models/') ? cred.model : `models/${cred.model}`;
        const target = cred.targetLanguageCode || 'en';
        const echo = Boolean(cred.echoTargetLanguage);
        // Live Translate setup (docs). Audio output is discarded client-side; transcripts are used.
        ws.send(
          JSON.stringify({
            setup: {
              model,
              generationConfig: {
                responseModalities: ['AUDIO'],
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                translationConfig: {
                  targetLanguageCode: target,
                  echoTargetLanguage: echo,
                },
              },
            },
          }),
        );
      };

      ws.onmessage = (event) => {
        if (this.generationId !== generation || this.closed) return;
        void this.handleRawMessage(event.data, generation, ok, fail, timeout);
      };

      ws.onerror = () => {
        window.clearTimeout(timeout);
        const err = new ProviderError('NETWORK', 'WebSocket error', true);
        this.emit('error', err);
        fail(err);
      };

      ws.onclose = (ev) => {
        window.clearTimeout(timeout);
        this.sendingAllowed = false;
        if (!settled && !this.closed) {
          fail(
            new ProviderError(
              'NETWORK',
              `WebSocket closed before setup (${ev.code})`,
              true,
            ),
          );
        } else if (settled && !this.closed) {
          this.emit(
            'error',
            new ProviderError('SESSION_EXPIRED', `Live session closed (${ev.code})`, false),
          );
        }
      };
    });
  }

  private async handleRawMessage(
    data: unknown,
    generation: number,
    onSetupComplete: () => void,
    onFail: (err: ProviderError) => void,
    timeout: number,
  ): Promise<void> {
    try {
      let text: string;
      if (typeof data === 'string') {
        text = data;
      } else if (data instanceof Blob) {
        text = await data.text();
      } else if (data instanceof ArrayBuffer) {
        text = new TextDecoder().decode(data);
      } else {
        return;
      }
      if (this.generationId !== generation || this.closed) return;
      const msg = JSON.parse(text) as ServerMessage;

      if (msg.error) {
        window.clearTimeout(timeout);
        const status = (msg.error.status || '').toUpperCase();
        const code =
          status.includes('RESOURCE_EXHAUSTED') || status.includes('QUOTA')
            ? 'QUOTA_EXHAUSTED'
            : 'PROVIDER_UNAVAILABLE';
        const err = new ProviderError(code, msg.error.message || 'Provider error', code !== 'QUOTA_EXHAUSTED');
        this.emit('error', err);
        onFail(err);
        return;
      }

      if (msg.setupComplete !== undefined) {
        window.clearTimeout(timeout);
        this.emit('usage', {
          note: 'setupComplete',
          connectMs: Date.now() - this.connectStartedAt,
        });
        onSetupComplete();
      }

      this.handleServerContent(msg, generation);
    } catch {
      // ignore malformed frames
    }
  }

  private handleServerContent(msg: ServerMessage, generation: number): void {
    if (this.generationId !== generation || this.closed) return;
    const content = msg.serverContent;
    if (!content) return;

    if (content.interrupted) {
      this.emit('interrupted', { at: Date.now() });
    }

    // Discard provider audio output (subtitle MVP) — do not play inlineData.
    if (content.modelTurn?.parts) {
      // intentionally ignored
    }

    const input = content.inputTranscription;
    if (input?.text) {
      this.lastInputText = input.text;
      if (input.languageCode) this.lastInputLanguage = input.languageCode;
    }
    const output = content.outputTranscription;
    if (output?.text) {
      const finished = Boolean(output.finished);
      const segmentId = finished
        ? `out-${++this.segmentSeq}`
        : this.pendingPartialId ?? `out-partial-${this.segmentSeq + 1}`;
      if (!finished) this.pendingPartialId = segmentId;
      else this.pendingPartialId = null;

      const update: TranscriptUpdate = {
        sessionId: this.sessionId,
        segmentId,
        revision: finished ? 2 : 1,
        sourceLanguage: this.lastInputLanguage ?? input?.languageCode,
        originalText: this.lastInputText ?? input?.text,
        translatedText: output.text,
        final: finished,
        captureTimestamp: Date.now(),
        generationId: generation,
      };
      this.emit('transcript', update);
    }
  }

  sendAudio(bytes: Uint8Array): void {
    if (this.closed || !this.sendingAllowed || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i] ?? 0);
    }
    const data = btoa(binary);
    // Live Translate docs show camelCase realtimeInput for JS SDK / some WS examples.
    this.ws.send(
      JSON.stringify({
        realtimeInput: {
          audio: {
            data,
            mimeType: 'audio/pcm;rate=16000',
          },
        },
      }),
    );
  }

  pauseSending(): void {
    this.sendingAllowed = false;
  }

  resumeSending(): void {
    if (!this.closed && this.ws?.readyState === WebSocket.OPEN) {
      this.sendingAllowed = true;
    }
  }

  getGenerationId(): number {
    return this.generationId;
  }

  async close(): Promise<void> {
    this.sendingAllowed = false;
    this.closed = true;
    this.generationId += 1; // reject late callbacks
    const ws = this.ws;
    this.ws = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  }

  private emit(event: string, payload: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(payload);
    }
  }
}
