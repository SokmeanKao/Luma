import { describe, expect, it } from 'vitest';
import { shouldDisplayTranslation } from './language-filter';

describe('shouldDisplayTranslation', () => {
  it('shows when detection is unknown', () => {
    expect(shouldDisplayTranslation({ selectedSource: 'ko' })).toBe(true);
  });

  it('shows Korean when selected Korean', () => {
    expect(shouldDisplayTranslation({ selectedSource: 'ko', detectedSource: 'ko-KR' })).toBe(true);
  });

  it('hides English when Korean selected', () => {
    expect(shouldDisplayTranslation({ selectedSource: 'ko', detectedSource: 'en' })).toBe(false);
  });

  it('hides unrelated languages', () => {
    expect(shouldDisplayTranslation({ selectedSource: 'ko', detectedSource: 'ja' })).toBe(false);
  });
});
