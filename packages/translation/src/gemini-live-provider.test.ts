import { describe, expect, it } from 'vitest';
import { GeminiLiveProvider } from './gemini-live-provider';
import { ProviderError } from './types';

describe('GeminiLiveProvider scaffolding', () => {
  it('rejects connect without temporary credential object', async () => {
    const p = new GeminiLiveProvider();
    await expect(
      p.connect({ mode: 'real', sourceLanguage: 'ko', targetLanguage: 'en' }, 'plain-string'),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it('does not claim a live session is available in this build', async () => {
    const p = new GeminiLiveProvider();
    try {
      await p.connect(
        { mode: 'real', sourceLanguage: 'ko', targetLanguage: 'en' },
        {
          token: 'auth_tokens/test',
          expiresAt: new Date().toISOString(),
          model: 'models/test',
          apiVersion: 'v1alpha',
          websocketUrl: 'wss://example.invalid',
        },
      );
      expect.fail('should not connect');
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).code).toBe('PROVIDER_UNAVAILABLE');
    }
  });
});
