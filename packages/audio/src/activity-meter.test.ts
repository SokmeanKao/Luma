import { describe, expect, it } from 'vitest';
import { levelFromTimeDomain } from './activity-meter';

describe('levelFromTimeDomain', () => {
  it('returns 0 for silence (128 midpoints)', () => {
    expect(levelFromTimeDomain(new Uint8Array(64).fill(128))).toBe(0);
  });

  it('returns higher level for loud samples', () => {
    const loud = new Uint8Array(64);
    for (let i = 0; i < loud.length; i += 1) {
      loud[i] = i % 2 === 0 ? 0 : 255;
    }
    expect(levelFromTimeDomain(loud)).toBeGreaterThan(0.5);
  });
});
