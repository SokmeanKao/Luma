import { describe, expect, it } from 'vitest';
import { captureApisUsed, NEVER_USES_MICROPHONE } from './types';

describe('capture API policy', () => {
  it('declares display-media only and never microphone', () => {
    expect(NEVER_USES_MICROPHONE).toBe(true);
    expect(captureApisUsed()).toEqual(['getDisplayMedia']);
    expect(captureApisUsed().some((api) => /getUserMedia|microphone/i.test(api))).toBe(false);
  });
});
