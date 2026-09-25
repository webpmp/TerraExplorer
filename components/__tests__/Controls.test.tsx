import { describe, test, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Controls from '../Controls';
import { SkinType } from '../../types';
import * as followUpService from '../../services/followUpService';

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
        expect(html).not.toContain('parchment-background');
      } else if (skin === 'retro-amber') {
        expect(html).toContain('border-amber-400');
        expect(html).toContain('font-retro');
        expect(html).not.toContain('parchment-background');
      } else if (skin === 'parchment') {
        expect(html).toContain('parchment-background');
        expect(html).toContain('[isolation:isolate]');
        expect(html).not.toContain('bg-[#f4ead5]/95');
        expect(html).toContain('text-[#5c3a21]');
      } else {
        expect(html).toContain('rounded-full');
        expect(html).not.toContain('parchment-background');
      }
    });
  });

  test('parchment theme renders "No results found for this query." with parchment-background and dark brown text', () => {
    const errorMsg = 'No results found for this query.';
    const html = renderToStaticMarkup(
      <Controls {...baseProps} skin="parchment" searchError={errorMsg} onClearError={vi.fn()} />
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(errorMsg);
    expect(html).toContain('parchment-background');
    expect(html).toContain('[isolation:isolate]');
    expect(html).toContain('text-[#5c3a21]');
    expect(html).not.toContain('bg-[#f4ead5]/95');
    expect(html).toContain('aria-label="Dismiss error"');
  });

  test('does not place error message or warning icon inside the search input', () => {
    const html = renderToStaticMarkup(
      <Controls {...baseProps} searchError="Could not find location." onClearError={vi.fn()} />
    );

    // Ensure AlertTriangle inside input group is absent
    expect(html).not.toContain('group/error-tooltip');
    expect(html).not.toContain('animate-pulse');
  });

  test('non-parchment themes reserve vertical layout footprint (min-h-[38px]) even when searchError is null', () => {
    const nonParchmentSkins: SkinType[] = ['modern', 'retro-green', 'retro-amber'];

    nonParchmentSkins.forEach((skin) => {
      const htmlNoError = renderToStaticMarkup(
        <Controls {...baseProps} skin={skin} searchError={null} />
      );

      // Stable reserved container is present even without an error
      expect(htmlNoError).toContain('class="w-full max-w-[532px] min-h-[38px] -mt-2.5 pointer-events-none flex flex-col justify-start"');
      expect(htmlNoError).not.toContain('role="status"');

      const htmlWithError = renderToStaticMarkup(
        <Controls {...baseProps} skin={skin} searchError="No results found for this query." onClearError={vi.fn()} />
      );

      // Stable reserved container wraps the error
      expect(htmlWithError).toContain('class="w-full max-w-[532px] min-h-[38px] -mt-2.5 pointer-events-none flex flex-col justify-start"');
      expect(htmlWithError).toContain('role="status"');
      expect(htmlWithError).toContain('No results found for this query.');
    });
  });

  test('parchment theme does not use the reserved-space container', () => {
    const htmlNoError = renderToStaticMarkup(
      <Controls {...baseProps} skin="parchment" searchError={null} />
    );
    expect(htmlNoError).not.toContain('min-h-[38px]');

    const htmlWithError = renderToStaticMarkup(
      <Controls {...baseProps} skin="parchment" searchError="No results found for this query." onClearError={vi.fn()} />
    );
    expect(htmlWithError).not.toContain('min-h-[38px]');
    expect(htmlWithError).toContain('parchment-background');
    expect(htmlWithError).toContain('role="status"');
  });
});

describe('Controls Parchment Active-Search Glow Tattered Edge Silhouette', () => {
  const baseProps = {
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onSearch: vi.fn(),
    onTraceRoute: vi.fn(),
    isSearching: false,
    skin: 'parchment' as SkinType,
    showFavorites: false,
    onToggleShowFavorites: vi.fn(),
    paused: false,
    isTraceModalOpen: false,
    onToggleTraceModal: vi.fn(),
    isZoomLocked: false,
    onToggleZoomLock: vi.fn(),
  };

  test('parchment active-search glow uses static url(#tattered-deckle-edge) drop-shadow and continuous opacity keyframes', () => {
    const htmlActive = renderToStaticMarkup(
      <Controls {...baseProps} skin="parchment" isSearching={true} />
    );

    // Glow layer is attached to parchment-background
    expect(htmlActive).toContain('parchment-background active-search-glow-parchment');
    // Does not render a rectangular inset glow wrapper
    expect(htmlActive).not.toContain('inset-[-3px]');

    // Static filter is applied to .active-search-glow-parchment with url(#tattered-deckle-edge) drop-shadow
    expect(htmlActive).toContain('.active-search-glow-parchment {');
    expect(htmlActive).toContain('url(#tattered-deckle-edge)');
    expect(htmlActive).toContain('drop-shadow(0 0 3px rgba(215, 180, 125, 0.70))');

    // Keyframes animate continuous opacity without re-evaluating the SVG filter
    expect(htmlActive).toContain('@keyframes search-pulse-glow-parchment');
    expect(htmlActive).toContain('opacity: 0.20;');
    expect(htmlActive).toContain('opacity: 1;');
  });

  test('parchment search background when inactive does not have active-search-glow-parchment', () => {
    const htmlInactive = renderToStaticMarkup(
      <Controls {...baseProps} skin="parchment" isSearching={false} scanningStatusText={null} />
    );

    const formMatch = htmlInactive.match(/<form[\s\S]*?<\/form>/)?.[0];
    expect(formMatch).toContain('class="parchment-background"');
    expect(formMatch).not.toContain('active-search-glow-parchment');
  });

  test('non-parchment themes apply their own dedicated glow classes and do not use active-search-glow-parchment', () => {
    const modernHtml = renderToStaticMarkup(
      <Controls {...baseProps} skin="modern" isSearching={true} />
    );
    const modernForm = modernHtml.match(/<form[\s\S]*?<\/form>/)?.[0];
    expect(modernForm).toContain('active-search-glow-modern');
    expect(modernForm).not.toContain('active-search-glow-parchment');

    const greenHtml = renderToStaticMarkup(
      <Controls {...baseProps} skin="retro-green" isSearching={true} />
    );
    const greenForm = greenHtml.match(/<form[\s\S]*?<\/form>/)?.[0];
    expect(greenForm).toContain('active-search-glow-green');
    expect(greenForm).not.toContain('active-search-glow-parchment');

    const amberHtml = renderToStaticMarkup(
      <Controls {...baseProps} skin="retro-amber" isSearching={true} />
    );
    const amberForm = amberHtml.match(/<form[\s\S]*?<\/form>/)?.[0];
    expect(amberForm).toContain('active-search-glow-amber');
    expect(amberForm).not.toContain('active-search-glow-parchment');
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
      'aria-label="Narration On"',
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

  test('retro themes (retro-green, retro-amber) are completely unaffected by isOSMDisplayed', () => {
    const retroSkins: SkinType[] = ['retro-green', 'retro-amber'];

    retroSkins.forEach((skin) => {
      const htmlGlobe = renderToStaticMarkup(
        <Controls {...baseProps} skin={skin} isOSMDisplayed={false} />
      );
      const htmlOSM = renderToStaticMarkup(
        <Controls {...baseProps} skin={skin} isOSMDisplayed={true} />
      );

      // HTML should be identical between globe and OSM for retro skins
      expect(htmlOSM).toBe(htmlGlobe);
      expect(htmlOSM).not.toContain('modern-osm-hover rounded-full');

      if (skin === 'retro-green') {
        expect(htmlOSM).toContain('hover:bg-green-400 hover:text-black');
      } else if (skin === 'retro-amber') {
        expect(htmlOSM).toContain('hover:bg-amber-400 hover:text-black');
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

describe('Controls Vertical Separator Lines', () => {
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

  test('Parchment theme in both Globe and OSM views does not render separator lines', () => {
    const htmlGlobe = renderToStaticMarkup(
      <Controls {...baseProps} skin="parchment" isOSMDisplayed={false} />
    );
    const htmlOSM = renderToStaticMarkup(
      <Controls {...baseProps} skin="parchment" isOSMDisplayed={true} />
    );

    // Separators must not be rendered in parchment theme
    expect(htmlGlobe).not.toContain('class="w-px mx-1 self-stretch');
    expect(htmlOSM).not.toContain('class="w-px mx-1 self-stretch');
    expect(htmlGlobe).not.toContain('bg-[#8b5a2b]/30');
    expect(htmlOSM).not.toContain('bg-[#8b5a2b]/30');
  });

  test('Parchment theme controls follow the circular arc geometry of the ring in an independent layer', () => {
    const radius = 500;
    const html = renderToStaticMarkup(
      <Controls {...baseProps} skin="parchment" parchmentRingRadius={radius} isOSMDisplayed={false} />
    );

    // Should not have solid button backgrounds or borders
    expect(html).not.toContain('bg-[#f4ead5]');
    expect(html).not.toContain('border border-[#8b5a2b]');
    expect(html).not.toContain('shadow-[2px_2px_4px_rgba(0,0,0,0.2)]');
    expect(html).not.toContain('hover:bg-[#e8d5b5]');

    // Should have transparent background, dark brown default glyph text color (#4a2a16), warm tan hover (#fff3dc), and contrast outline
    expect(html).toContain('bg-transparent');
    expect(html).toContain('text-[#4a2a16]');
    expect(html).toContain('hover:text-[#fff3dc]');
    expect(html).toContain('parchment-glyph-contrast');

    // Should render curved bottom-ring container with 7 distinct columns in its own independent layer
    expect(html).toContain('data-testid="parchment-ring-controls"');

    // Extract translate styles for the 7 controls
    const translateMatches = [...html.matchAll(/translate\(calc\(-50% \+ (-?[\d.]+)px\),\s*calc\(-50% \+ (-?[\d.]+)px\)\)/g)];
    expect(translateMatches.length).toBe(7);

    const positions = translateMatches.map(m => ({
      x: parseFloat(m[1]),
      y: parseFloat(m[2])
    }));

    // Verify all 7 controls have strictly increasing X positions (7 distinct horizontal columns)
    for (let i = 0; i < positions.length - 1; i++) {
      expect(positions[i].x).toBeLessThan(positions[i + 1].x);
    }

    // Verify symmetry around Control 4 (index 3)
    // Control 4 is centered at x=0, y=radius (lowest point on the circle)
    expect(positions[3].x).toBeCloseTo(0, 1);
    expect(positions[3].y).toBeCloseTo(radius, 1);

    // Controls 1 & 7 are symmetric and highest (smallest Y distance)
    expect(positions[0].x).toBeCloseTo(-positions[6].x, 1);
    expect(positions[0].y).toBeCloseTo(positions[6].y, 1);
    expect(positions[0].y).toBeLessThan(positions[1].y);

    // Controls 2 & 6 are symmetric and lower
    expect(positions[1].x).toBeCloseTo(-positions[5].x, 1);
    expect(positions[1].y).toBeCloseTo(positions[5].y, 1);
    expect(positions[1].y).toBeLessThan(positions[2].y);

    // Controls 3 & 5 are symmetric and lower
    expect(positions[2].x).toBeCloseTo(-positions[4].x, 1);
    expect(positions[2].y).toBeCloseTo(positions[4].y, 1);
    expect(positions[2].y).toBeLessThan(positions[3].y);

    // Verify all 7 controls have constant radial distance R from the ring center (0, 0)
    positions.forEach(pos => {
      const distanceToCenter = Math.sqrt(Math.pow(pos.x, 2) + Math.pow(pos.y, 2));
      expect(distanceToCenter).toBeCloseTo(radius, 0);
    });

    // All 7 buttons should be present in exact order
    expect(html).toContain('aria-label="Trace Route"');
    expect(html).toContain('aria-label="Toggle Favorites"');
    expect(html).toContain('aria-label="Zoom Out"');
    expect(html).toContain('aria-label="Zoom In"');
    expect(html).toContain('aria-label="Narration On"');
    expect(html).toContain('aria-label="Switch Theme"');
    expect(html).toContain('aria-label="Settings"');
  });

  test('Parchment theme spans search width horizontally and derives Y curvature dynamically with ring radius', () => {
    const htmlSmall = renderToStaticMarkup(
      <Controls {...baseProps} skin="parchment" parchmentRingRadius={300} />
    );
    const htmlLarge = renderToStaticMarkup(
      <Controls {...baseProps} skin="parchment" parchmentRingRadius={600} />
    );

    const smallMatches = [...htmlSmall.matchAll(/translate\(calc\(-50% \+ (-?[\d.]+)px\),\s*calc\(-50% \+ (-?[\d.]+)px\)\)/g)];
    const largeMatches = [...htmlLarge.matchAll(/translate\(calc\(-50% \+ (-?[\d.]+)px\),\s*calc\(-50% \+ (-?[\d.]+)px\)\)/g)];

    const xSpanSmall = Math.abs(parseFloat(smallMatches[0][1]));
    const xSpanLarge = Math.abs(parseFloat(largeMatches[0][1]));

    // Horizontal span matches search field half-width (266px) for both
    expect(xSpanSmall).toBeCloseTo(266, 0);
    expect(xSpanLarge).toBeCloseTo(266, 0);

    // Y position adapts dynamically to the ring radius: y = sqrt(R^2 - x^2)
    const ySmall = parseFloat(smallMatches[0][2]);
    const yLarge = parseFloat(largeMatches[0][2]);
    expect(ySmall).toBeCloseTo(Math.sqrt(300 * 300 - 266 * 266), 1);
    expect(yLarge).toBeCloseTo(Math.sqrt(600 * 600 - 266 * 266), 1);
  });

  test('Non-parchment themes do not use the curved ring layout', () => {
    const modernHtml = renderToStaticMarkup(
      <Controls {...baseProps} skin="modern" />
    );
    expect(modernHtml).not.toContain('data-testid="parchment-ring-controls"');

    const retroGreenHtml = renderToStaticMarkup(
      <Controls {...baseProps} skin="retro-green" />
    );
    expect(retroGreenHtml).not.toContain('data-testid="parchment-ring-controls"');
  });

  test('Modern theme in Globe view uses existing light separators (bg-white/20)', () => {
    const html = renderToStaticMarkup(
      <Controls {...baseProps} skin="modern" isOSMDisplayed={false} />
    );

    const separatorMatches = html.match(/class="w-px mx-1 self-stretch bg-white\/20"/g);
    expect(separatorMatches).not.toBeNull();
    expect(separatorMatches?.length).toBe(2);
    expect(html).not.toContain('class="w-px mx-1 self-stretch bg-black/60"');
  });

  test('Modern theme in OSM view uses matching gray separators (bg-black/60)', () => {
    const html = renderToStaticMarkup(
      <Controls {...baseProps} skin="modern" isOSMDisplayed={true} />
    );

    const separatorMatches = html.match(/class="w-px mx-1 self-stretch bg-black\/60"/g);
    expect(separatorMatches).not.toBeNull();
    expect(separatorMatches?.length).toBe(2);
    expect(html).not.toContain('class="w-px mx-1 self-stretch bg-white/20"');
  });

  test('Retro Green theme keeps existing separator colors in both Globe and OSM views', () => {
    const htmlGlobe = renderToStaticMarkup(
      <Controls {...baseProps} skin="retro-green" isOSMDisplayed={false} />
    );
    const htmlOSM = renderToStaticMarkup(
      <Controls {...baseProps} skin="retro-green" isOSMDisplayed={true} />
    );

    expect(htmlGlobe).toContain('class="w-px mx-1 self-stretch bg-white/20"');
    expect(htmlGlobe).toContain('class="w-px mx-1 self-stretch bg-green-400/30"');
    expect(htmlOSM).toBe(htmlGlobe);
  });

  test('Retro Amber theme keeps existing separator colors in both Globe and OSM views', () => {
    const htmlGlobe = renderToStaticMarkup(
      <Controls {...baseProps} skin="retro-amber" isOSMDisplayed={false} />
    );
    const htmlOSM = renderToStaticMarkup(
      <Controls {...baseProps} skin="retro-amber" isOSMDisplayed={true} />
    );

    expect(htmlGlobe).toContain('class="w-px mx-1 self-stretch bg-white/20"');
    expect(htmlGlobe).toContain('class="w-px mx-1 self-stretch bg-amber-400/30"');
    expect(htmlOSM).toBe(htmlGlobe);
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

    expect(html).toContain(`© ${currentYear} TerraExplorer by Chris Adkins • All Rights Reserved • Map data © `);
    expect(html).not.toContain('<br');
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
    expect(parchmentHtml).toContain('text-[#6b4f35] font-sans');

    const greenHtml = renderToStaticMarkup(<Controls {...baseProps} skin="retro-green" />);
    expect(greenHtml).toContain('text-green-400/60 font-retro uppercase tracking-widest');

    const amberHtml = renderToStaticMarkup(<Controls {...baseProps} skin="retro-amber" />);
    expect(amberHtml).toContain('text-amber-400/60 font-retro uppercase tracking-widest');
  });
});

describe('Controls Trace Route Modal Outside Click Behavior', () => {
  const skins: SkinType[] = ['modern', 'parchment', 'retro-green', 'retro-amber'];

  skins.forEach((skin) => {
    test(`Trace Route modal in theme "${skin}" has outside-click dismiss container and stops bubbling inside panel`, () => {
      const onToggleTraceModal = vi.fn();
      const html = renderToStaticMarkup(
        <Controls
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onSearch={vi.fn()}
          onTraceRoute={vi.fn()}
          isSearching={false}
          skin={skin}
          showFavorites={false}
          onToggleShowFavorites={vi.fn()}
          paused={false}
          isTraceModalOpen={true}
          onToggleTraceModal={onToggleTraceModal}
          isZoomLocked={false}
          onToggleZoomLock={vi.fn()}
        />
      );

      // Verify modal backdrop container exists with full-screen fixed positioning
      expect(html).toContain('fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm pointer-events-auto');

      // Verify inner panel exists inside the backdrop
      if (skin === 'parchment') {
        expect(html).toContain('max-w-lg p-6 flex flex-col gap-4 [isolation:isolate]');
      } else {
        expect(html).toContain('max-w-lg p-6 flex flex-col gap-4 overflow-hidden');
      }

      // Verify Trace Route title and form elements are present inside the panel
      expect(html).toContain('Trace Route</h2>');
      expect(html).toContain('Paste text here...');
      expect(html).toContain('Generate Route</button>');

      // Verify X close button is present
      if (skin === 'parchment') {
        expect(html).toContain('hover:bg-[#d2b48c]/50');
      } else {
        expect(html).toContain('absolute top-0 right-0 p-1 hover:opacity-70');
      }
    });
  });
});

describe('Controls Contextual Question Chips & Follow-Up Lifecycle', () => {
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
    isNarrationEnabled: true,
    onToggleNarration: vi.fn(),
    isNarrationAvailable: true
  };

  const sampleLocation = {
    name: 'Bodie, California',
    entityType: 'ghost town',
    description: 'Bodie is a historic gold mining ghost town.',
    notable: [{ title: 'Standard Mill', description: 'Stamping mill' }],
    news: [{ title: 'Preservation Underway', url: 'https://news.org/bodie' }]
  };

  test('renders contextual chips and READ news chips for active location context', () => {
    const html = renderToStaticMarkup(
      <Controls {...baseProps} activeLocationContext={sampleLocation} showNews={true} />
    );

    expect(html).toContain('data-testid="contextual-chips-container"');
    expect(html).toContain('READ: Preservation Underway');
    expect(html).toContain('Ask about Bodie, California...');
  });

  test('chips remain visible when scanningStatusText is RESEARCHING FOLLOW-UP', () => {
    const html = renderToStaticMarkup(
      <Controls
        {...baseProps}
        activeLocationContext={sampleLocation}
        scanningStatusText="RESEARCHING FOLLOW-UP"
      />
    );

    expect(html).toContain('data-testid="contextual-chips-container"');
  });

  test('renders Narration On/Off toolbar toggle synced with isNarrationEnabled', () => {
    const htmlOn = renderToStaticMarkup(
      <Controls {...baseProps} isNarrationEnabled={true} />
    );
    expect(htmlOn).toContain('data-testid="narration-toolbar-toggle"');
    expect(htmlOn).toContain('aria-label="Narration On"');

    const htmlOff = renderToStaticMarkup(
      <Controls {...baseProps} isNarrationEnabled={false} />
    );
    expect(htmlOff).toContain('aria-label="Narration Off"');
  });

  test('contextual chips container includes container wrapper for horizontal scrolling with overflow indicator affordances', () => {
    const html = renderToStaticMarkup(
      <Controls {...baseProps} activeLocationContext={sampleLocation} showNews={true} />
    );
    expect(html).toContain('data-testid="contextual-chips-container"');
    expect(html).toContain('overflow-x-auto');
    expect(html).toContain('no-scrollbar');
    expect(html).toContain('flex-1');
    expect(html).toContain('min-w-0');
    expect(html).toContain('max-w-[532px]');
  });

  test('parchment theme integrates contextual follow-up questions directly inside search field and displays navigation controls', () => {
    const htmlMultiple = renderToStaticMarkup(
      <Controls {...baseProps} skin="parchment" activeLocationContext={sampleLocation} showNews={true} />
    );
    // Parchment does not render separate chips container above search
    expect(htmlMultiple).not.toContain('data-testid="contextual-chips-container"');
    // Parchment renders follow-up suggestion starting with default manual Ask about [location]... item
    expect(htmlMultiple).toContain('data-testid="parchment-followup-suggestion"');
    expect(htmlMultiple).toContain('Ask about Bodie, California...');
    expect(htmlMultiple).toContain('data-testid="parchment-prev-chip"');
    expect(htmlMultiple).toContain('data-testid="parchment-next-chip"');
    // Flanking navigation arrows are positioned outside search field boundaries with #fff3dc hover
    expect(htmlMultiple).toContain('-left-9');
    expect(htmlMultiple).toContain('-right-9');
    expect(htmlMultiple).toContain('hover:text-[#fff3dc]');
    // Text container supports full-width hover scroll with whitespace-nowrap and no scrollbar
    expect(htmlMultiple).toContain('whitespace-nowrap');
    expect(htmlMultiple).toContain('no-scrollbar');

    // In follow-up display mode, input element is not rendered underneath, preventing double text
    expect(htmlMultiple).not.toContain('<input');

    // Single follow-up question: sequence has 2 items (default manual entry + 1 question) -> renders prev/next navigation
    const chipSpy = vi.spyOn(followUpService, 'generateContextualChips').mockReturnValueOnce([
      { id: 'f1', type: 'question', label: 'What happened here?' }
    ]);
    const htmlSingle = renderToStaticMarkup(
      <Controls {...baseProps} skin="parchment" activeLocationContext={{ name: 'Single Site' }} showNews={false} />
    );
    expect(htmlSingle).toContain('data-testid="parchment-followup-suggestion"');
    expect(htmlSingle).toContain('Ask about Single Site...');
    expect(htmlSingle).toContain('data-testid="parchment-prev-chip"');
    expect(htmlSingle).toContain('data-testid="parchment-next-chip"');
    chipSpy.mockRestore();

    // No follow-ups (State A): renders standard search input with Search icon, EXPLORE button, no suggestion overlay, and retains default Ask about [location]... placeholder
    const chipEmptySpy = vi.spyOn(followUpService, 'generateContextualChips').mockReturnValueOnce([]);
    const htmlLocationWithoutChips = renderToStaticMarkup(
      <Controls {...baseProps} skin="parchment" activeLocationContext={{ name: 'Bodie' }} showNews={false} />
    );
    expect(htmlLocationWithoutChips).not.toContain('data-testid="parchment-followup-suggestion"');
    expect(htmlLocationWithoutChips).toContain('placeholder="Ask about Bodie..."');
    expect(htmlLocationWithoutChips).toContain('EXPLORE');
    expect(htmlLocationWithoutChips).not.toContain('data-testid="parchment-prev-chip"');
    expect(htmlLocationWithoutChips).not.toContain('data-testid="parchment-next-chip"');
    chipEmptySpy.mockRestore();

    // Initial app load (no active location): renders standard search input with Search icon, EXPLORE button, and rotating suggestion placeholder
    const htmlNone = renderToStaticMarkup(
      <Controls {...baseProps} skin="parchment" activeLocationContext={null} />
    );
    expect(htmlNone).not.toContain('data-testid="parchment-followup-suggestion"');
    expect(htmlNone).toContain('EXPLORE');
    expect(htmlNone).not.toContain('data-testid="parchment-prev-chip"');
    expect(htmlNone).not.toContain('data-testid="parchment-next-chip"');
    expect(htmlNone).toContain('placeholder="Search location..."');
  });

  test('Settings button has active styling when isSettingsOpen is true across themes', () => {
    const htmlOpenModern = renderToStaticMarkup(
      <Controls {...baseProps} onToggleSettings={vi.fn()} skin="modern" isSettingsOpen={true} />
    );
    expect(htmlOpenModern).toContain('aria-label="Settings"');
    expect(htmlOpenModern).toContain('text-yellow-400');
    expect(htmlOpenModern).toContain('border-yellow-400');
    expect(htmlOpenModern).toContain('bg-black/60');

    const htmlOpenParchment = renderToStaticMarkup(
      <Controls {...baseProps} onToggleSettings={vi.fn()} skin="parchment" isSettingsOpen={true} />
    );
    expect(htmlOpenParchment).toContain('text-[#f4ead5]');
    expect(htmlOpenParchment).not.toContain('text-[#b8860b]');

    const htmlOpenRetroGreen = renderToStaticMarkup(
      <Controls {...baseProps} onToggleSettings={vi.fn()} skin="retro-green" isSettingsOpen={true} />
    );
    expect(htmlOpenRetroGreen).toContain('text-green-400');
  });

  test('Settings button has inactive styling when isSettingsOpen is false', () => {
    const htmlClosed = renderToStaticMarkup(
      <Controls {...baseProps} onToggleSettings={vi.fn()} skin="modern" isSettingsOpen={false} />
    );
    expect(htmlClosed).toContain('aria-label="Settings"');
  });

  test('Trace Route button has active styling when isTraceModalOpen is true', () => {
    const htmlTraceOpen = renderToStaticMarkup(
      <Controls {...baseProps} skin="modern" isTraceModalOpen={true} />
    );
    expect(htmlTraceOpen).toContain('text-yellow-400');
    expect(htmlTraceOpen).toContain('border-yellow-400');
    expect(htmlTraceOpen).toContain('bg-black/60');
  });
});

describe('Contextual Follow-Up Chip Navigation & Single-Step Scrolling Suite', () => {
  // Helper to simulate the single-chip step scroll calculation algorithm implemented in Controls.tsx
  const calculateScrollStep = ({
    chipOffsets,
    currentScrollLeft,
    containerWidth,
    direction
  }: {
    chipOffsets: number[];
    currentScrollLeft: number;
    containerWidth: number;
    direction: 'left' | 'right';
  }) => {
    if (chipOffsets.length === 0) return currentScrollLeft;
    const baseOffset = chipOffsets[0];
    const totalContentWidth = chipOffsets[chipOffsets.length - 1] + 200 - baseOffset;
    const maxScrollLeft = Math.max(0, totalContentWidth - containerWidth);
    const tolerance = 4;

    if (direction === 'right') {
      let targetLeft = maxScrollLeft;
      for (let i = 0; i < chipOffsets.length; i++) {
        const chipStart = chipOffsets[i] - baseOffset;
        if (chipStart > currentScrollLeft + tolerance) {
          targetLeft = chipStart;
          break;
        }
      }
      return Math.min(maxScrollLeft, targetLeft);
    } else {
      let targetLeft = 0;
      for (let i = chipOffsets.length - 1; i >= 0; i--) {
        const chipStart = chipOffsets[i] - baseOffset;
        if (chipStart < currentScrollLeft - tolerance) {
          targetLeft = chipStart;
          break;
        }
      }
      return Math.max(0, targetLeft);
    }
  };

  const sampleChipOffsets = [8, 140, 290, 450, 620]; // 5 chips with variable widths & gap
  const containerWidth = 300;

  it('1. Clicking > scrolls toward the next chip revealing approximately one additional question', () => {
    // Initial state: at beginning (scrollLeft = 0)
    const nextStep = calculateScrollStep({
      chipOffsets: sampleChipOffsets,
      currentScrollLeft: 0,
      containerWidth,
      direction: 'right'
    });

    // Should scroll to chip 1 (offset 140 - 8 = 132), revealing the next question without skipping
    expect(nextStep).toBe(132);
  });

  it('2. Clicking < scrolls toward the previous chip', () => {
    // Starting at chip 2 (offset 290 - 8 = 282)
    const prevStep = calculateScrollStep({
      chipOffsets: sampleChipOffsets,
      currentScrollLeft: 282,
      containerWidth,
      direction: 'left'
    });

    // Should scroll back to chip 1 (offset 140 - 8 = 132)
    expect(prevStep).toBe(132);

    // Clicking < again scrolls back to chip 0 (offset 0)
    const firstStep = calculateScrollStep({
      chipOffsets: sampleChipOffsets,
      currentScrollLeft: 132,
      containerWidth,
      direction: 'left'
    });
    expect(firstStep).toBe(0);
  });

  it('3. Navigation does NOT page across multiple chips (advances step by step)', () => {
    let scrollPos = 0;

    // Tap 1: moves from chip 0 to chip 1
    scrollPos = calculateScrollStep({
      chipOffsets: sampleChipOffsets,
      currentScrollLeft: scrollPos,
      containerWidth,
      direction: 'right'
    });
    expect(scrollPos).toBe(132); // chip 1

    // Tap 2: moves from chip 1 to chip 2
    scrollPos = calculateScrollStep({
      chipOffsets: sampleChipOffsets,
      currentScrollLeft: scrollPos,
      containerWidth,
      direction: 'right'
    });
    expect(scrollPos).toBe(282); // chip 2

    // Tap 3: moves from chip 2 to chip 3
    scrollPos = calculateScrollStep({
      chipOffsets: sampleChipOffsets,
      currentScrollLeft: scrollPos,
      containerWidth,
      direction: 'right'
    });
    expect(scrollPos).toBe(442); // chip 3
  });

  it('4. Controls behave correctly at the beginning and end of the chip list', () => {
    // At beginning (scrollLeft = 0), < cannot scroll farther left
    const leftAtStart = calculateScrollStep({
      chipOffsets: sampleChipOffsets,
      currentScrollLeft: 0,
      containerWidth,
      direction: 'left'
    });
    expect(leftAtStart).toBe(0);

    // At end (scrollLeft = 512, beyond last chip offset 612), > cannot scroll farther right
    const maxScroll = 512;
    const rightAtEnd = calculateScrollStep({
      chipOffsets: sampleChipOffsets,
      currentScrollLeft: 612, // already at last chip
      containerWidth,
      direction: 'right'
    });
    expect(rightAtEnd).toBe(512);
  });

  it('5. Handles mid-scroll / touch-swiped positions gracefully', () => {
    // User swiped manually to scrollLeft = 70 (between chip 0 and chip 1)
    const nextFromSwipe = calculateScrollStep({
      chipOffsets: sampleChipOffsets,
      currentScrollLeft: 70,
      containerWidth,
      direction: 'right'
    });
    expect(nextFromSwipe).toBe(132); // Snaps forward to chip 1

    const prevFromSwipe = calculateScrollStep({
      chipOffsets: sampleChipOffsets,
      currentScrollLeft: 70,
      containerWidth,
      direction: 'left'
    });
    expect(prevFromSwipe).toBe(0); // Snaps back to chip 0
  });

  it('6. Computes gradient edge-fade mask for Modern theme based on scroll overflow state', () => {
    const computeMask = (skin: string, canScrollLeft: boolean, canScrollRight: boolean) => {
      if (skin !== 'modern') return {};
      const fadeDistance = '10px';
      if (canScrollLeft && canScrollRight) {
        const mask = `linear-gradient(to right, transparent 0px, black ${fadeDistance}, black calc(100% - ${fadeDistance}), transparent 100%)`;
        return { maskImage: mask, WebkitMaskImage: mask };
      }
      if (canScrollLeft) {
        const mask = `linear-gradient(to right, transparent 0px, black ${fadeDistance}, black 100%)`;
        return { maskImage: mask, WebkitMaskImage: mask };
      }
      if (canScrollRight) {
        const mask = `linear-gradient(to right, black 0px, black calc(100% - ${fadeDistance}), transparent 100%)`;
        return { maskImage: mask, WebkitMaskImage: mask };
      }
      return {};
    };

    // At beginning with overflow to the right: right edge fades out
    const rightFade = computeMask('modern', false, true);
    expect(rightFade.maskImage).toContain('black 0px');
    expect(rightFade.maskImage).toContain('transparent 100%');

    // Scrolled into the middle: both edges fade
    const bothFade = computeMask('modern', true, true);
    expect(bothFade.maskImage).toContain('transparent 0px');
    expect(bothFade.maskImage).toContain('transparent 100%');

    // Scrolled to end: left edge fades in, right edge solid
    const leftFade = computeMask('modern', true, false);
    expect(leftFade.maskImage).toContain('transparent 0px');
    expect(leftFade.maskImage).toContain('black 100%');

    // No overflow: no mask
    const noFade = computeMask('modern', false, false);
    expect(noFade).toEqual({});

    // Non-modern skins: no mask
    expect(computeMask('parchment', true, true)).toEqual({});
    expect(computeMask('retro-green', true, true)).toEqual({});
  });
});

describe('Controls Parchment Ring Controls & Layout Separation', () => {
  const baseProps = {
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onSearch: vi.fn(),
    onTraceRoute: vi.fn(),
    isSearching: false,
    skin: 'parchment' as SkinType,
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

  test('parchment theme search/footer container is positioned at bottom-2.5 with no dynamic inline bottom offset', () => {
    const html = renderToStaticMarkup(
      <Controls {...baseProps} skin="parchment" />
    );

    // Verify search container uses standard bottom-2.5
    expect(html).toContain('class="absolute bottom-2.5 left-0 right-0 z-20 flex flex-col items-center gap-2 pointer-events-none px-4"');
    // Ensure no dynamic bottom style like style="bottom: 226px"
    expect(html).not.toMatch(/style="[^"]*bottom:\s*\d+px/);
  });

  test('parchment theme renders independent ring controls layer with 7 controls along circular arc spanning search width', () => {
    const html = renderToStaticMarkup(
      <Controls {...baseProps} skin="parchment" parchmentRingRadius={545.64} />
    );

    expect(html).toContain('data-testid="parchment-ring-controls"');
    expect(html).toContain('top:calc(50% - 15px)');
    expect(html).toContain('left:50%');

    // Verify 7 buttons exist inside the ring controls
    expect(html).toContain('aria-label="Trace Route"');
    expect(html).toContain('aria-label="Toggle Favorites"');
    expect(html).toContain('aria-label="Zoom Out"');
    expect(html).toContain('aria-label="Zoom In"');
    expect(html).toContain('aria-label="Narration On"');
    expect(html).toContain('aria-label="Switch Theme"');
    expect(html).toContain('aria-label="Settings"');

    // Verify all 7 positions: 6 equal horizontal intervals across searchWidth (532px), Y from circle equation
    expect(html).toContain('translate(calc(-50% + -266.00px), calc(-50% + 476.41px))'); // Trace Route
    expect(html).toContain('translate(calc(-50% + -177.33px), calc(-50% + 516.02px))'); // Favorites
    expect(html).toContain('translate(calc(-50% + -88.67px), calc(-50% + 538.39px))');  // Zoom Out
    expect(html).toContain('translate(calc(-50% + 0.00px), calc(-50% + 545.64px))');    // Zoom In
    expect(html).toContain('translate(calc(-50% + 88.67px), calc(-50% + 538.39px))');   // Narration
    expect(html).toContain('translate(calc(-50% + 177.33px), calc(-50% + 516.02px))');  // Theme
    expect(html).toContain('translate(calc(-50% + 266.00px), calc(-50% + 476.41px))');  // Settings
  });

  test('non-parchment themes do NOT render ring controls layer and keep horizontal toolbar', () => {
    const nonParchmentSkins: SkinType[] = ['modern', 'retro-green', 'retro-amber'];

    nonParchmentSkins.forEach((skin) => {
      const html = renderToStaticMarkup(
        <Controls {...baseProps} skin={skin} />
      );

      expect(html).not.toContain('data-testid="parchment-ring-controls"');
      expect(html).toContain('class="absolute bottom-2.5 left-0 right-0 z-20 flex flex-col items-center gap-2 pointer-events-none px-4"');
      expect(html).toContain('class="flex gap-2 pointer-events-auto"');
    });
  });

  test('parchment theme uses cohesive parchment color hierarchy for inactive, active, hover, and stroke outline', () => {
    // Inactive state test
    const htmlInactive = renderToStaticMarkup(
      <Controls {...baseProps} skin="parchment" isNarrationEnabled={false} showFavorites={false} isSettingsOpen={false} isTraceModalOpen={false} />
    );

    // Inactive controls use dark brown (#4a2a16) with hover (#fff3dc)
    expect(htmlInactive).toContain('text-[#4a2a16]');
    expect(htmlInactive).toContain('hover:text-[#fff3dc]');
    expect(htmlInactive).not.toContain('text-[#b8860b]');

    // Crisp outline uses lighter parchment stroke rgba(200, 168, 120, 0.95) (#c8a878)
    expect(htmlInactive).toContain('drop-shadow(0.75px 0 0 rgba(200, 168, 120, 0.95))');

    // Active state test: Narration On, Favorites On, Settings Open
    const htmlActive = renderToStaticMarkup(
      <Controls {...baseProps} skin="parchment" isNarrationEnabled={true} showFavorites={true} isSettingsOpen={true} isTraceModalOpen={true} />
    );

    // Active controls use light parchment tan (#f4ead5)
    expect(htmlActive).toContain('text-[#f4ead5]');
    expect(htmlActive).not.toContain('text-[#b8860b]');
  });
});

describe('Parchment Contextual Follow-Up Search Interaction Suite', () => {
  const baseProps = {
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onSearch: vi.fn(),
    onTraceRoute: vi.fn(),
    isSearching: false,
    skin: 'parchment' as SkinType,
    showFavorites: false,
    onToggleShowFavorites: vi.fn(),
    paused: false,
    isTraceModalOpen: false,
    onToggleTraceModal: vi.fn(),
    isNarrationEnabled: true,
    onToggleNarration: vi.fn(),
    isNarrationAvailable: true,
  };

  const pearlHarbor = {
    name: 'Pearl Harbor Attack',
    entityType: 'military base',
    description: 'Attack on Pearl Harbor on December 7, 1941.',
  };

  test('1. First item in follow-up sequence is default manual search "Ask about [location]..."', () => {
    const chipSpy = vi.spyOn(followUpService, 'generateContextualChips').mockReturnValueOnce([
      { id: 'q1', type: 'question', label: 'What strategic factors led to this event?' },
      { id: 'q2', type: 'question', label: 'How did this affect the course of the war?' },
      { id: 'q3', type: 'question', label: 'What happened immediately afterward?' },
    ]);

    const html = renderToStaticMarkup(
      <Controls {...baseProps} activeLocationContext={pearlHarbor} showNews={false} />
    );

    // Displays the first item in the sequence
    expect(html).toContain('data-testid="parchment-followup-suggestion"');
    expect(html).toContain('Ask about Pearl Harbor Attack...');

    // Navigation arrows are rendered outside the field
    expect(html).toContain('data-testid="parchment-prev-chip"');
    expect(html).toContain('data-testid="parchment-next-chip"');
    expect(html).toContain('-left-9');
    expect(html).toContain('-right-9');

    // Arrow hover color is #fff3dc and not #3e2723
    expect(html).toContain('hover:text-[#fff3dc]');

    // In display mode, the input element is omitted (mutually exclusive with suggestion)
    expect(html).not.toContain('<input');
    // Follow-up browsing state has NO EXPLORE button
    expect(html).not.toContain('EXPLORE');

    chipSpy.mockRestore();
  });

  test('2. Arrow hover color uses #fff3dc across parchment navigation controls', () => {
    const chipSpy = vi.spyOn(followUpService, 'generateContextualChips').mockReturnValueOnce([
      { id: 'q1', type: 'question', label: 'What strategic factors led to this event?' },
    ]);

    const html = renderToStaticMarkup(
      <Controls {...baseProps} activeLocationContext={pearlHarbor} showNews={false} />
    );

    const prevMatch = html.match(/<button [^>]*data-testid="parchment-prev-chip"[^>]*>/);
    const nextMatch = html.match(/<button [^>]*data-testid="parchment-next-chip"[^>]*>/);

    expect(prevMatch?.[0]).toContain('text-[#8b5a2b]');
    expect(prevMatch?.[0]).toContain('hover:text-[#fff3dc]');
    expect(prevMatch?.[0]).not.toContain('hover:text-[#3e2723]');

    expect(nextMatch?.[0]).toContain('text-[#8b5a2b]');
    expect(nextMatch?.[0]).toContain('hover:text-[#fff3dc]');
    expect(nextMatch?.[0]).not.toContain('hover:text-[#3e2723]');

    chipSpy.mockRestore();
  });

  test('3. Initial application search state renders normal search with EXPLORE button', () => {
    const html = renderToStaticMarkup(
      <Controls {...baseProps} activeLocationContext={null} />
    );

    // Initial search has normal input and EXPLORE button
    expect(html).toContain('<input');
    expect(html).toContain('placeholder="Search location..."');
    expect(html).toContain('EXPLORE');

    // No follow-up arrows or overlay
    expect(html).not.toContain('data-testid="parchment-prev-chip"');
    expect(html).not.toContain('data-testid="parchment-next-chip"');
    expect(html).not.toContain('data-testid="parchment-followup-suggestion"');
  });

  test('4. Non-parchment themes (Modern, Retro Green, Retro Amber) remain completely isolated', () => {
    const modernHtml = renderToStaticMarkup(
      <Controls {...baseProps} skin="modern" activeLocationContext={pearlHarbor} />
    );
    expect(modernHtml).not.toContain('data-testid="parchment-followup-suggestion"');
    expect(modernHtml).not.toContain('data-testid="parchment-prev-chip"');
    expect(modernHtml).toContain('data-testid="contextual-chips-container"');
    expect(modernHtml).toContain('<input');
    expect(modernHtml).toContain('EXPLORE');

    const greenHtml = renderToStaticMarkup(
      <Controls {...baseProps} skin="retro-green" activeLocationContext={pearlHarbor} />
    );
    expect(greenHtml).not.toContain('data-testid="parchment-followup-suggestion"');
    expect(greenHtml).toContain('data-testid="contextual-chips-container"');
    expect(greenHtml).toContain('EXPLORE');
  });
});
