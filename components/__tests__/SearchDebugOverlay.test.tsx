import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SearchDebugOverlay } from '../SearchDebugOverlay';

describe('SearchDebugOverlay - TEST MODE Visibility Logic', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      innerWidth: 1920,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
  });

  afterEach(() => {
    delete (globalThis as any).window;
  });

  it('1. Desktop viewport (>1080px): renders DEBUG button regardless of testMode', () => {
    (globalThis as any).window.innerWidth = 1440;

    const htmlOn = renderToStaticMarkup(<SearchDebugOverlay testMode={true} />);
    expect(htmlOn).toContain('search-debug-container');
    expect(htmlOn).toContain('DEBUG');

    const htmlOff = renderToStaticMarkup(<SearchDebugOverlay testMode={false} />);
    expect(htmlOff).toContain('search-debug-container');
    expect(htmlOff).toContain('DEBUG');
  });

  it('2. Tablet / iPad viewport (<=1080px): renders DEBUG button when testMode is true (default)', () => {
    (globalThis as any).window.innerWidth = 834; // iPad Pro 11-inch portrait width

    const htmlDefault = renderToStaticMarkup(<SearchDebugOverlay />);
    expect(htmlDefault).toContain('search-debug-container');
    expect(htmlDefault).toContain('DEBUG');

    const htmlExplicitOn = renderToStaticMarkup(<SearchDebugOverlay testMode={true} />);
    expect(htmlExplicitOn).toContain('search-debug-container');
    expect(htmlExplicitOn).toContain('DEBUG');
  });

  it('3. Tablet / iPad viewport (<=1080px): completely hides DEBUG button when testMode is false', () => {
    (globalThis as any).window.innerWidth = 834;

    const htmlOff = renderToStaticMarkup(<SearchDebugOverlay testMode={false} />);
    expect(htmlOff).toBe('');
    expect(htmlOff).not.toContain('search-debug-container');
    expect(htmlOff).not.toContain('DEBUG');
  });
});
