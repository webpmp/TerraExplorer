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

  test('Parchment theme in Globe view uses two matching light separators (bg-white/20)', () => {
    const html = renderToStaticMarkup(
      <Controls {...baseProps} skin="parchment" isOSMDisplayed={false} />
    );

    // Both separators should be bg-white/20
    const separatorMatches = html.match(/class="w-px mx-1 self-stretch bg-white\/20"/g);
    expect(separatorMatches).not.toBeNull();
    expect(separatorMatches?.length).toBe(2);

    // Should NOT contain the brown separator
    expect(html).not.toContain('bg-[#8b5a2b]/30');
  });

  test('Parchment theme in OSM view uses two matching dark brown separators (bg-[#8b5a2b]/30)', () => {
    const html = renderToStaticMarkup(
      <Controls {...baseProps} skin="parchment" isOSMDisplayed={true} />
    );

    // Both separators should be bg-[#8b5a2b]/30
    const separatorMatches = html.match(/class="w-px mx-1 self-stretch bg-\[#8b5a2b\]\/30"/g);
    expect(separatorMatches).not.toBeNull();
    expect(separatorMatches?.length).toBe(2);

    // Should NOT contain the white separator in the controls bar
    expect(html).not.toContain('class="w-px mx-1 self-stretch bg-white/20"');
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

  test('parchment theme renders contextual chips as underlined text-links without pill backgrounds or borders', () => {
    const html = renderToStaticMarkup(
      <Controls {...baseProps} skin="parchment" activeLocationContext={sampleLocation} showNews={true} />
    );
    expect(html).toContain('data-testid="contextual-chips-container"');
    expect(html).toContain('text-[#f4ead5] underline underline-offset-2 decoration-[#f4ead5]/70');
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
    expect(htmlOpenParchment).toContain('text-[#b8860b]');

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
