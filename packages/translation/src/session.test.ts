import { describe, expect, it, vi } from 'vitest';
import { createSessionController } from './session';

describe('createSessionController', () => {
  it('increments generation on stop and rejects stale transcript events', () => {
    const onUpdate = vi.fn();
    const session = createSessionController({ onUpdate, onStateChange: vi.fn() });
    session.start({ mode: 'demo', sourceLanguage: 'ko', targetLanguage: 'en' });
    const gen = session.getGenerationId();
    session.stop();
    session.acceptTranscript({
      sessionId: 's1',
      segmentId: 'a',
      revision: 1,
      translatedText: 'stale',
      final: true,
      captureTimestamp: Date.now(),
      generationId: gen,
    });
    expect(onUpdate).not.toHaveBeenCalled();
    expect(session.getState()).toBe('stopped');
  });

  it('pause does not accept outbound-audio intent (isSendingAudio false)', () => {
    const session = createSessionController({ onUpdate: vi.fn(), onStateChange: vi.fn() });
    session.start({ mode: 'demo', sourceLanguage: 'ko', targetLanguage: 'en' });
    session.pause();
    expect(session.getState()).toBe('paused');
    expect(session.isSendingAudio()).toBe(false);
  });

  it('clear removes entries without stopping capture state', () => {
    const onUpdate = vi.fn();
    const session = createSessionController({ onUpdate, onStateChange: vi.fn() });
    session.start({ mode: 'demo', sourceLanguage: 'ko', targetLanguage: 'en' });
    const gen = session.getGenerationId();
    session.acceptTranscript({
      sessionId: 's1',
      segmentId: 'a',
      revision: 1,
      translatedText: 'Hello',
      final: true,
      captureTimestamp: 1,
      generationId: gen,
    });
    expect(session.listTranscript()).toHaveLength(1);
    session.clear();
    expect(session.listTranscript()).toHaveLength(0);
    expect(session.getState()).toBe('listening');
  });
});
