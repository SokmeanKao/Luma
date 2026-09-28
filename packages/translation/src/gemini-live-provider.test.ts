import { describe, expect, it } from 'vitest';
import { GeminiLiveProvider } from './gemini-live-provider';
import { ProviderError } from './types';

describe('GeminiLiveProvider', () => {
  it('rejects non-real mode', async () => {
    const p = new GeminiLiveProvider();
    await expect(
      p.connect({ mode: 'demo', sourceLanguage: 'ko', targetLanguage: 'en' }, {
        token: 'x',
        expiresAt: '',
        model: 'm',
        apiVersion: 'v1beta',
        websocketUrl: 'wss://example.invalid',
      }),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it('rejects missing temporary credential object', async () => {
    const p = new GeminiLiveProvider();
    await expect(
      p.connect({ mode: 'real', sourceLanguage: 'ko', targetLanguage: 'en' }, 'plain-string'),
    ).rejects.toMatchObject({ code: 'CONFIGURATION_MISSING' });
  });
});
