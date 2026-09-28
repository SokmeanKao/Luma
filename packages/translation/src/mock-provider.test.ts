import { describe, expect, it, vi } from 'vitest';
import { MockTranslationProvider } from './mock-provider';
import { shouldDisplayTranslation } from './language-filter';

describe('shouldDisplayTranslation', () => {
  it('hides entries when detected source differs from selected', () => {
    expect(
      shouldDisplayTranslation({ selectedSource: 'ko', detectedSource: 'en' }),
    ).toBe(false);
  });

  it('shows entries when detection is unknown', () => {
    expect(shouldDisplayTranslation({ selectedSource: 'ko' })).toBe(true);
  });
});

describe('MockTranslationProvider', () => {
  it('emits Korean sample pairs and skips English-detected rows', async () => {
    vi.useFakeTimers();
    const provider = new MockTranslationProvider();
    const updates: Array<{ translatedText: string; originalText?: string }> = [];
    provider.on('transcript', (payload) => {
      updates.push(payload as { translatedText: string; originalText?: string });
    });
    await provider.connect(
      { mode: 'demo', sourceLanguage: 'ko', targetLanguage: 'en', sessionId: 'demo' },
      'demo',
    );
    provider.startDemo();
    await vi.advanceTimersByTimeAsync(50);
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0]?.translatedText).toMatch(/Hello|meeting/i);
    await provider.close();
    vi.useRealTimers();
  });
});
