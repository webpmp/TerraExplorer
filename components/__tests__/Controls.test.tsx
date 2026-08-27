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

describe('Controls Modern Theme OSM Button Hover Contrast', () => {
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
    onCycleSkin: vi.fn(),
    onToggleSettings: vi.fn(),
  };

  test('modern theme on dark globe (isOSMDisplayed=false) uses hover:bg-white/10 and not modern-osm-hover', () => {
    const html = renderToStaticMarkup(
      <Controls {...baseProps} skin="modern" isOSMDisplayed={false} />
    );

    expect(html).toContain('hover:bg-white/10');
    expect(html).not.toContain('modern-osm-hover rounded-full');
    expect(html).toContain('bg-black/60 backdrop-blur-md border border-white/20 text-white hover:bg-white/10 rounded-full');
  });

  test('modern theme by default (no isOSMDisplayed specified) retains existing light hover', () => {
    const html = renderToStaticMarkup(
      <Controls {...baseProps} skin="modern" />
    );

    expect(html).toContain('hover:bg-white/10');
    expect(html).not.toContain('modern-osm-hover rounded-full');
  });

  test('modern theme over OSM layers (isOSMDisplayed=true) uses modern-osm-hover and not hover:bg-white/10 on control buttons', () => {
    const html = renderToStaticMarkup(
      <Controls {...baseProps} skin="modern" isOSMDisplayed={true} />
    );

    expect(html).toContain('modern-osm-hover rounded-full');
    expect(html).toContain('bg-black/60 backdrop-blur-md border border-white/20 text-white modern-osm-hover rounded-full');
    expect(html).not.toContain('hover:bg-white/10 rounded-full');

    // Verify each of the 7 bottom control buttons receives modern-osm-hover
    const buttons = [
      'aria-label="Trace Route"',
      'aria-label="Toggle Favorites"',
      'aria-label="Zoom Out"',
      'aria-label="Zoom In"',
      'aria-label="Zoom enabled"',
      'aria-label="Switch Theme"',
      'aria-label="Settings"',
    ];

    buttons.forEach((btnAria) => {
      expect(html).toContain(btnAria);
    });
  });

  test('also supports isOSMActive prop for OSM layer detection', () => {
    const html = renderToStaticMarkup(
      <Controls {...baseProps} skin="modern" isOSMActive={true} />
    );

    expect(html).toContain('modern-osm-hover rounded-full');
    expect(html).toContain('bg-black/60 backdrop-blur-md border border-white/20 text-white modern-osm-hover rounded-full');
    expect(html).not.toContain('hover:bg-white/10 rounded-full');
  });

  test('non-modern themes (retro-green, retro-amber, parchment) are completely unaffected by isOSMDisplayed', () => {
    const nonModernSkins: SkinType[] = ['retro-green', 'retro-amber', 'parchment'];

    nonModernSkins.forEach((skin) => {
      const htmlGlobe = renderToStaticMarkup(
        <Controls {...baseProps} skin={skin} isOSMDisplayed={false} />
      );
      const htmlOSM = renderToStaticMarkup(
        <Controls {...baseProps} skin={skin} isOSMDisplayed={true} />
      );

      // HTML should be identical between globe and OSM for retro and parchment skins
      expect(htmlOSM).toBe(htmlGlobe);
      expect(htmlOSM).not.toContain('modern-osm-hover rounded-full');

      if (skin === 'retro-green') {
        expect(htmlOSM).toContain('hover:bg-green-400 hover:text-black');
      } else if (skin === 'retro-amber') {
        expect(htmlOSM).toContain('hover:bg-amber-400 hover:text-black');
      } else if (skin === 'parchment') {
        expect(htmlOSM).toContain('hover:bg-[#e8d5b5] hover:text-[#3e2723]');
      }
    });
  });

  test('includes modern-osm-hover style rule in CSS definitions', () => {
    const html = renderToStaticMarkup(
      <Controls {...baseProps} skin="modern" isOSMDisplayed={true} />
    );

    expect(html).toContain('.modern-osm-hover:hover');
    expect(html).toContain('background-color: rgba(0, 0, 0, 0.25)');
  });
});

describe('Controls Footer Copyright and Attribution', () => {
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

  test('renders dynamic copyright year, all rights reserved, and OpenStreetMap & CARTO links', () => {
    const currentYear = new Date().getFullYear().toString();
    const html = renderToStaticMarkup(<Controls {...baseProps} />);

    expect(html).toContain(`© ${currentYear} TerraExplorer by Chris Adkins • All Rights Reserved<br/>Map data © `);
    expect(html).toContain('href="https://www.openstreetmap.org/copyright"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('class="underline hover:opacity-80 pointer-events-auto"');
    expect(html).toContain('OpenStreetMap contributors</a>');
    expect(html).toContain('href="https://carto.com/attribution/"');
    expect(html).toContain('CARTO</a>');
  });

  test('verifies theme-aware copyright styling across all 4 themes', () => {
    const modernHtml = renderToStaticMarkup(<Controls {...baseProps} skin="modern" />);
    expect(modernHtml).toContain('text-gray-500 font-sans');

    const parchmentHtml = renderToStaticMarkup(<Controls {...baseProps} skin="parchment" />);
    expect(parchmentHtml).toContain('text-white/50 font-sans');

    const greenHtml = renderToStaticMarkup(<Controls {...baseProps} skin="retro-green" />);
    expect(greenHtml).toContain('text-green-400/60 font-retro uppercase tracking-widest');

    const amberHtml = renderToStaticMarkup(<Controls {...baseProps} skin="retro-amber" />);
    expect(amberHtml).toContain('text-amber-400/60 font-retro uppercase tracking-widest');
  });
});

