import {
  ProviderError,
  type SessionStartConfig,
  type TemporaryCredential,
  type TranscriptUpdate,
  type TranslatedAudioChunk,
} from './types';

type Handler = (payload: unknown) => void;

interface ServerMessage {
  setupComplete?: unknown;
  serverContent?: {
    inputTranscription?: { text?: string; finished?: boolean; languageCode?: string };
    outputTranscription?: { text?: string; finished?: boolean; languageCode?: string };
    interrupted?: boolean;
    turnComplete?: boolean;
    generationComplete?: boolean;
    modelTurn?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
  };
  error?: { code?: number; message?: string; status?: string };
}

function decodeBase64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function sameUtteranceText(prev: string, next: string): boolean {
  if (!prev || !next) return true;
  if (prev === next) return true;
  if (next.startsWith(prev) || prev.startsWith(next)) return true;
  return false;
}

/**
 * Live Gemini WebSocket provider for Live Translation.
 * Emits output transcription (stable per-segment ids) and translated PCM audio.
 */
export class GeminiLiveProvider {
  private handlers = new Map<string, Handler[]>();
  private ws: WebSocket | null = null;
  private closed = true;
  private sendingAllowed = false;
  private generationId = 0;
  private sessionId = 'live';
  private segmentSeq = 0;
  /** Stable id for the currently open (non-final) output segment. */
  private openSegmentId: string | null = null;
  private openRevision = 0;
  private openHadOutput = false;
  private lastOutputText = '';
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
    this.openSegmentId = null;
    this.openRevision = 0;
    this.openHadOutput = false;
    this.lastOutputText = '';
    this.connectStartedAt = Date.now();
    this.lastInputText = undefined;
    this.lastInputLanguage = undefined;
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
        ws.send(
          JSON.stringify({
            setup: {
              model,
              generationConfig: {
                responseModalities: ['AUDIO'],
                translationConfig: {
                  targetLanguageCode: target,
                  echoTargetLanguage: echo,
                },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
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

  private ensureOpenSegment(): string {
    if (!this.openSegmentId) {
      this.openSegmentId = `out-${++this.segmentSeq}`;
      this.openRevision = 0;
      this.lastOutputText = '';
    }
    return this.openSegmentId;
  }

  private emitTranscript(update: TranscriptUpdate): void {
    this.emit('transcript', update);
  }

  /** Finalize the open segment using the last known text (documented completion signals). */
  private finalizeOpenSegment(generation: number): void {
    if (!this.openSegmentId || !this.openHadOutput) {
      this.openSegmentId = null;
      this.openRevision = 0;
      this.openHadOutput = false;
      return;
    }
    this.openRevision += 1;
    this.emitTranscript({
      sessionId: this.sessionId,
      segmentId: this.openSegmentId,
      revision: this.openRevision,
      sourceLanguage: this.lastInputLanguage,
      originalText: this.lastInputText,
      translatedText: this.lastOutputText,
      final: true,
      captureTimestamp: Date.now(),
      generationId: generation,
    });
    this.openSegmentId = null;
    this.openRevision = 0;
    this.openHadOutput = false;
    this.lastOutputText = '';
    this.lastInputText = undefined;
  }

  private handleServerContent(msg: ServerMessage, generation: number): void {
    if (this.generationId !== generation || this.closed) return;
    const content = msg.serverContent;
    if (!content) return;

    if (content.interrupted) {
      this.finalizeOpenSegment(generation);
      this.emit('interrupted', { at: Date.now(), generationId: generation, sessionId: this.sessionId });
    }

    const input = content.inputTranscription;
    if (input?.text || input?.languageCode) {
      if (input.text) {
        const prev = this.lastInputText ?? '';
        // New distinct input utterance while a paragraph is open → finalize prior segment.
        if (this.openHadOutput && prev && !sameUtteranceText(prev, input.text)) {
          this.finalizeOpenSegment(generation);
        }
        this.lastInputText = input.text;
        if (input.languageCode) this.lastInputLanguage = input.languageCode;

        // Emit original speech into the open paragraph so the left column can fill before translation.
        const segmentId = this.ensureOpenSegment();
        this.openRevision += 1;
        this.openHadOutput = true;
        this.emitTranscript({
          sessionId: this.sessionId,
          segmentId,
          revision: this.openRevision,
          sourceLanguage: this.lastInputLanguage ?? input.languageCode,
          originalText: input.text,
          translatedText: this.lastOutputText,
          final: input.finished === true,
          captureTimestamp: Date.now(),
          generationId: generation,
        });
        if (input.finished === true) {
          this.openSegmentId = null;
          this.openRevision = 0;
          this.openHadOutput = false;
          this.lastOutputText = '';
          this.lastInputText = undefined;
        }
      }
      if (input.languageCode) {
        this.lastInputLanguage = input.languageCode;
        this.emit('inputLanguage', {
          languageCode: input.languageCode,
          generationId: generation,
          sessionId: this.sessionId,
        });
      }
    }

    if (content.modelTurn?.parts) {
      for (const part of content.modelTurn.parts) {
        const inline = part.inlineData;
        if (!inline?.data || !inline.mimeType) continue;
        let pcm: Uint8Array;
        try {
          pcm = decodeBase64ToBytes(inline.data);
        } catch {
          continue;
        }
        const chunk: TranslatedAudioChunk = {
          sessionId: this.sessionId,
          generationId: generation,
          mimeType: inline.mimeType,
          pcm,
          sampleRate: 0,
          detectedSourceLanguage: this.lastInputLanguage,
        };
        this.emit('audio', chunk);
      }
    }

    const output = content.outputTranscription;
    if (output?.text) {
      const segmentId = this.ensureOpenSegment();
      this.openRevision += 1;
      this.openHadOutput = true;
      this.lastOutputText = output.text;
      const finished = output.finished === true;

      this.emitTranscript({
        sessionId: this.sessionId,
        segmentId,
        revision: this.openRevision,
        sourceLanguage: this.lastInputLanguage ?? input?.languageCode,
        originalText: this.lastInputText ?? input?.text,
        translatedText: output.text,
        final: finished,
        captureTimestamp: Date.now(),
        generationId: generation,
      });

      if (finished) {
        this.openSegmentId = null;
        this.openRevision = 0;
        this.openHadOutput = false;
        this.lastOutputText = '';
        this.lastInputText = undefined;
      }
    }

    // Documented Live API completion signals (finished is often absent on consumer API).
    if (content.turnComplete === true || content.generationComplete === true) {
      this.finalizeOpenSegment(generation);
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
    this.generationId += 1;
    this.openSegmentId = null;
    this.openRevision = 0;
    this.openHadOutput = false;
    this.lastOutputText = '';
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
