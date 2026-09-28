import { describe, it, expect } from 'vitest';
import { IPC } from '../src/shared/ipc';

describe('IPC channels', () => {
  it('uses luma: prefix and unique values', () => {
    const values = Object.values(IPC);
    expect(values.every((v) => v.startsWith('luma:'))).toBe(true);
    expect(new Set(values).size).toBe(values.length);
  });
});
