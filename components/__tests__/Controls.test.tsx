import { describe, test, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Controls from '../Controls';
import { SkinType } from '../../types';

describe('Controls Search Error Presentation', () => {
  const baseProps = {
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onSearch: vi.fn(),
    onTraceRoute: vi.fn(),
    isSearching: false,
    skin: 'modern' as SkinType,
    showFavorites: false,
    onToggleShowFavorites: vi.fn(),
    paused: false,
    isTraceModalOpen: false,
    onToggleTraceModal: vi.fn(),
    isZoomLocked: false,
    onToggleZoomLock: vi.fn(),
  };

  test('does not render error row when searchError is null or undefined', () => {
    const html = renderToStaticMarkup(
      <Controls {...baseProps} searchError={null} />
    );

    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('Dismiss error');
    expect(html).toContain('OpenStreetMap contributors');
    expect(html).toContain('EXPLORE');
  });

  test('renders error row between search form and attribution when searchError is provided', () => {
    const errorMsg = 'No results found for this query.';
    const html = renderToStaticMarkup(
      <Controls {...baseProps} searchError={errorMsg} onClearError={vi.fn()} />
    );

    expect(html).toContain('role="status"');
    expect(html).toContain(errorMsg);
    expect(html).toContain('aria-label="Dismiss error"');
    expect(html).toContain('OpenStreetMap contributors');

    // Verify ordering in rendered HTML: <form ...> ... role="status" ... OpenStreetMap
    const formIndex = html.indexOf('<form');
    const errorIndex = html.indexOf('role="status"');
    const attributionIndex = html.indexOf('OpenStreetMap contributors');

    expect(formIndex).toBeGreaterThan(-1);
    expect(errorIndex).toBeGreaterThan(formIndex);
    expect(attributionIndex).toBeGreaterThan(errorIndex);
  });

  test('applies theme-specific styling to the error row', () => {
    const skins: SkinType[] = ['modern', 'retro-green', 'retro-amber', 'parchment'];
    
    skins.forEach((skin) => {
      const html = renderToStaticMarkup(
        <Controls {...baseProps} skin={skin} searchError="Unable to resolve location." onClearError={vi.fn()} />
      );

      expect(html).toContain('role="status"');
      expect(html).toContain('Unable to resolve location.');

      if (skin === 'retro-green') {
        expect(html).toContain('border-green-400');
        expect(html).toContain('font-retro');
      } else if (skin === 'retro-amber') {
        expect(html).toContain('border-amber-400');
        expect(html).toContain('font-retro');
      } else if (skin === 'parchment') {
        expect(html).toContain('border-[#8b5a2b]');
      } else {
        expect(html).toContain('rounded-full');
      }
    });
  });

  test('does not place error message or warning icon inside the search input', () => {
    const html = renderToStaticMarkup(
      <Controls {...baseProps} searchError="Could not find location." onClearError={vi.fn()} />
    );

    // Ensure AlertTriangle inside input group is absent
    expect(html).not.toContain('group/error-tooltip');
    expect(html).not.toContain('animate-pulse');
  });
});
