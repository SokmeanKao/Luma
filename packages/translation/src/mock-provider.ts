import type { SessionStartConfig, TranscriptUpdate, TranslationProvider } from './types';

type Handler = (payload: unknown) => void;

const KO_SAMPLES: Array<[string, string]> = [
  ['안녕하세요. 오늘 회의를 시작하겠습니다.', "Hello, everyone. Let's start today's meeting."],
  ['먼저 이번 주 진행 상황을 확인하겠습니다.', "First, let's review our progress this week."],
  ['화면을 공유해 주시겠어요?', 'Could you share your screen?'],
  ['이 기능은 다음 주까지 완료할 예정입니다.', 'We plan to complete this feature by next week.'],
  ['질문이 있으시면 말씀해 주세요.', 'Please let me know if you have any questions.'],
];

export class MockTranslationProvider implements TranslationProvider {
  private handlers = new Map<string, Handler[]>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private index = 0;
  private config: SessionStartConfig | null = null;
  private closed = false;

  on(event: 'transcript' | 'error' | 'usage', handler: Handler): void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  async connect(config: SessionStartConfig, _temporaryCredential: string): Promise<void> {
    this.config = config;
    this.closed = false;
    this.index = 0;
  }

  sendAudio(_bytes: Uint8Array): void {
    // Demo path does not require real PCM; startDemo drives output.
  }

  startDemo(): void {
    if (this.timer || this.closed) return;
    this.emitNext();
    this.timer = setInterval(() => this.emitNext(), 5000);
  }

  private emitNext(): void {
    if (this.closed || !this.config) return;
    if (this.config.sourceLanguage !== 'ko') return;

    // Occasional English-detected sample to exercise filtering (not displayed).
    if (this.index > 0 && this.index % 7 === 0) {
      this.emit('transcript', {
        sessionId: this.config.sessionId ?? 'demo',
        segmentId: `skip-${this.index}`,
        revision: 1,
        sourceLanguage: 'en',
        originalText: 'This is English only.',
        translatedText: 'This is English only.',
        final: true,
        captureTimestamp: Date.now(),
      } satisfies TranscriptUpdate);
      this.index += 1;
      return;
    }

    const pair = KO_SAMPLES[this.index % KO_SAMPLES.length]!;
    const segmentId = `demo-${this.index}`;
    this.emit('transcript', {
      sessionId: this.config.sessionId ?? 'demo',
      segmentId,
      revision: 1,
      sourceLanguage: 'ko',
      originalText: pair[0],
      translatedText: pair[1],
      final: true,
      captureTimestamp: Date.now(),
    } satisfies TranscriptUpdate);
    this.index += 1;
  }

  private emit(event: string, payload: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(payload);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
