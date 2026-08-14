import { describe, test, expect } from 'vitest';
import { normalizeDisplayText } from '../InfoPanel';

describe('normalizeDisplayText helper', () => {
  test('returns string for string input', () => {
    expect(normalizeDisplayText('Test string')).toBe('Test string');
  });

  test('returns summary if object has summary', () => {
    expect(normalizeDisplayText({ summary: 'Object summary' })).toBe('Object summary');
  });

  test('returns title if object has title', () => {
    expect(normalizeDisplayText({ title: 'Object title' })).toBe('Object title');
  });

  test('returns name if object has name', () => {
    expect(normalizeDisplayText({ name: 'Object name' })).toBe('Object name');
  });

  test('returns empty string for unhandled structures', () => {
    expect(normalizeDisplayText({ foo: 'bar' })).toBe('');
    expect(normalizeDisplayText(null)).toBe('');
    expect(normalizeDisplayText(undefined)).toBe('');
  });
});
