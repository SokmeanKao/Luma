import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { downmixToMono, pcmChunkDurationMs } from './encoder';
import { captureApisUsed, NEVER_USES_MICROPHONE } from './types';

describe('encoder', () => {
  it('downmixes stereo by averaging channels', () => {
    const mono = downmixToMono(new Float32Array([1, -1, 0.5, -0.5]), 2);
    expect(Array.from(mono)).toEqual([0, 0]);
  });

  it('reports chunk duration from sample count and rate', () => {
    expect(pcmChunkDurationMs(16000, 16000)).toBe(1000);
  });
});

describe('microphone exclusion', () => {
  it('declares display-media only APIs', () => {
    expect(NEVER_USES_MICROPHONE).toBe(true);
    expect(captureApisUsed()).toEqual(['getDisplayMedia']);
  });

  it('browser-capture source does not call getUserMedia', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, 'browser-capture.ts'), 'utf8');
    expect(source).not.toMatch(/getUserMedia/);
    expect(source).toMatch(/getDisplayMedia/);
  });
});
