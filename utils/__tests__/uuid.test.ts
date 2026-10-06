import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateUUID } from '../uuid';

describe('generateUUID Utility', () => {
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    // Restore crypto
    Object.defineProperty(globalThis, 'crypto', {
      value: originalCrypto,
      configurable: true,
      writable: true,
    });
  });

  it('generates valid UUID v4 formatted string in standard environment', () => {
    const id = generateUUID();
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('generates unique IDs across successive calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = generateUUID();
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    }
    expect(ids.size).toBe(100);
  });

  it('gracefully falls back when crypto.randomUUID is not a function (e.g. iPad Safari non-secure LAN context)', () => {
    // Mock crypto without randomUUID but with getRandomValues
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        getRandomValues: (arr: Uint8Array) => {
          for (let i = 0; i < arr.length; i++) {
            arr[i] = Math.floor(Math.random() * 256);
          }
          return arr;
        },
      },
      configurable: true,
      writable: true,
    });

    const id = generateUUID();
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('gracefully falls back when window.crypto is entirely undefined', () => {
    // Mock environment with no crypto
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const id = generateUUID();
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
