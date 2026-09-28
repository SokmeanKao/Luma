import { describe, expect, it } from 'vitest';
import { nextBackoffMs, shouldRetry } from './errors';
import { ProviderError } from './types';

describe('retry policy', () => {
  it('never retries quota exhaustion', () => {
    const err = new ProviderError('QUOTA_EXHAUSTED', 'free tier exhausted', false);
    expect(shouldRetry(err, 0)).toBe(false);
  });

  it('retries network errors within bound', () => {
    const err = new ProviderError('NETWORK', 'socket closed', true);
    expect(shouldRetry(err, 0)).toBe(true);
    expect(shouldRetry(err, 3)).toBe(false);
  });

  it('caps backoff', () => {
    expect(nextBackoffMs(10, { maxAttempts: 5, baseDelayMs: 500, maxDelayMs: 4000 })).toBe(4000);
  });
});
