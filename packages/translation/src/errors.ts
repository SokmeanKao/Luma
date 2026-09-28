import type { ProviderError } from './types';

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 4000,
};

/** Bounded exponential backoff. Quota exhaustion is never retryable. */
export function shouldRetry(error: ProviderError, attempt: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): boolean {
  if (error.code === 'QUOTA_EXHAUSTED' || error.code === 'CONFIGURATION_MISSING') return false;
  if (!error.retryable) return false;
  return attempt < policy.maxAttempts;
}

export function nextBackoffMs(attempt: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): number {
  const exp = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** Math.max(0, attempt));
  return exp;
}

export function classifyHttpStatus(status: number): Pick<ProviderError, 'code' | 'retryable'> {
  if (status === 401 || status === 403) return { code: 'NOT_AUTHORIZED', retryable: false };
  if (status === 429) return { code: 'RATE_LIMITED', retryable: true };
  if (status === 503 || status === 502) return { code: 'PROVIDER_UNAVAILABLE', retryable: true };
  if (status === 501) return { code: 'CONFIGURATION_MISSING', retryable: false };
  return { code: 'UNKNOWN', retryable: false };
}
