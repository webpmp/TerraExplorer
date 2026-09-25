import { describe, test, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import InfoPanel from '../InfoPanel';
import SettingsPanel from '../SettingsPanel';
import FavoritesPanel from '../FavoritesPanel';
import Controls from '../Controls';
import { SkinType, UserSettings, LocationInfo } from '../../types';

describe('Parchment Theme Design Refinements - No Straight Solid Lines', () => {
  const dummyInfo: LocationInfo = {
    name: 'Alexandria',
    description: 'Ancient port city with a storied history.',
    type: 'City',
    entityType: 'city',
    coordinates: { lat: 31.2, lng: 29.9 }
  };

  const defaultSettings: UserSettings = {
    aiProvider: 'gemini',
    newsProvider: 'gemini',
    showNews: true,
    documentaryMode: true,
    documentaryDuration: 5.5,
    narrationSpeed: 1.0,
    narrationVolume: 1.0
  };

  test('1. InfoPanel applies parchment-scrollbar only in Parchment theme', () => {
    const parchmentHtml = renderToStaticMarkup(
      <InfoPanel info={dummyInfo} onClose={vi.fn()} skin="parchment" />
    );
    expect(parchmentHtml).toContain('parchment-scrollbar');
    expect(parchmentHtml).toContain('info-panel-scrollable');

    const modernHtml = renderToStaticMarkup(
      <InfoPanel info={dummyInfo} onClose={vi.fn()} skin="modern" />
    );
    expect(modernHtml).not.toContain('parchment-scrollbar');
    expect(modernHtml).toContain('info-panel-scrollable');

    const retroHtml = renderToStaticMarkup(
      <InfoPanel info={dummyInfo} onClose={vi.fn()} skin="retro-green" />
    );
    expect(retroHtml).not.toContain('parchment-scrollbar');
  });

  test('2. Settings panel removes solid line separators and tab backgrounds in Parchment theme', () => {
    const parchmentHtml = renderToStaticMarkup(
      <SettingsPanel
        settings={defaultSettings}
        onUpdateSettings={vi.fn()}
        onClose={vi.fn()}
        skin="parchment"
      />
    );

    // Header has no rectangular background tint seam
    expect(parchmentHtml).not.toContain('bg-[#e8d5b5]/30');

    // Tablist has transparent background with no rectangular seam
    expect(parchmentHtml).not.toContain('bg-[#e8d5b5]/20');
    expect(parchmentHtml).toContain('bg-transparent');

    // Active tab uses text emphasis without rectangular patch or border
    expect(parchmentHtml).toContain('text-[#3e2723] font-bold');
    expect(parchmentHtml).not.toContain('bg-[#e8d5b5]/40');
    expect(parchmentHtml).not.toContain('border-b-2 border-[#8b5a2b]');

    // Content container uses parchment-scrollbar
    expect(parchmentHtml).toContain('parchment-scrollbar');

    // Non-Parchment (Modern) retains its border styling
    const modernHtml = renderToStaticMarkup(
      <SettingsPanel
        settings={defaultSettings}
        onUpdateSettings={vi.fn()}
        onClose={vi.fn()}
        skin="modern"
      />
    );
    expect(modernHtml).toContain('border-b border-cyan-400/20');
    expect(modernHtml).toContain('border-b-2 border-cyan-400');
    expect(modernHtml).toContain('custom-scrollbar');
  });

  test('3. Explorations panel removes header seam and item background in Parchment theme and applies scrollbar', () => {
    const dummyFav = {
      id: 'fav-1',
      name: 'Alexandria Harbor',
      lat: 31.2,
      lng: 29.9,
      timestamp: Date.now()
    };

    const parchmentHtml = renderToStaticMarkup(
      <FavoritesPanel
        favorites={[dummyFav]}
        onClose={vi.fn()}
        visibleFavoriteIds={['fav-1']}
        activeRouteId={null}
        onToggleVisibility={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
        onFlyTo={vi.fn()}
        skin="parchment"
      />
    );

    // Header has no background tint seam
    expect(parchmentHtml).not.toContain('bg-[#e8d5b5]/30');

    // Items sit directly on parchment surface without opaque rectangle
    expect(parchmentHtml).not.toContain('bg-[#f4ead5]');
    expect(parchmentHtml).toContain('hover:bg-[#8b5a2b]/5');

    // Scrollbar class is parchment-scrollbar
    expect(parchmentHtml).toContain('parchment-scrollbar');

    // Modern theme check
    const modernHtml = renderToStaticMarkup(
      <FavoritesPanel
        favorites={[dummyFav]}
        onClose={vi.fn()}
        visibleFavoriteIds={['fav-1']}
        activeRouteId={null}
        onToggleVisibility={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
        onFlyTo={vi.fn()}
        skin="modern"
      />
    );
    expect(modernHtml).toContain('custom-scrollbar');
    expect(modernHtml).not.toContain('parchment-scrollbar');
  });

  test('3b. Settings and Explorations remain solid opaque parchment surfaces without transparent opacity overrides', () => {
    const settingsHtml = renderToStaticMarkup(
      <SettingsPanel
        settings={defaultSettings}
        onUpdateSettings={vi.fn()}
        onClose={vi.fn()}
        skin="parchment"
      />
    );
    expect(settingsHtml).not.toContain('opacity-20');
    expect(settingsHtml).toContain('parchment-background');

    const favsHtml = renderToStaticMarkup(
      <FavoritesPanel
        favorites={[]}
        onClose={vi.fn()}
        visibleFavoriteIds={[]}
        activeRouteId={null}
        onToggleVisibility={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
        onFlyTo={vi.fn()}
        skin="parchment"
      />
    );
    expect(favsHtml).not.toContain('opacity-20');
    expect(favsHtml).toContain('parchment-background');
  });

  test('4. Trace Route modal in Parchment theme uses standardized form styling', () => {
    const parchmentHtml = renderToStaticMarkup(
      <Controls
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onSearch={vi.fn()}
        onTraceRoute={vi.fn()}
        isSearching={false}
        skin="parchment"
        showFavorites={false}
        onToggleShowFavorites={vi.fn()}
        paused={false}
        isTraceModalOpen={true}
        onToggleTraceModal={vi.fn()}
        isZoomLocked={false}
        onToggleZoomLock={vi.fn()}
      />
    );

    // Modal container has no border-2 border-[#8b5a2b] or rounded-sm
    expect(parchmentHtml).not.toContain('border-2 border-[#8b5a2b]');
    expect(parchmentHtml).toContain('parchment-background');
    expect(parchmentHtml).toContain('shadow-[0_4px_20px_rgba(0,0,0,0.4)]');

    // Textarea has bg-[#e6d5b8], text-[#3e2723], border-[#8b5a2b]/30, and rounded-lg
    expect(parchmentHtml).toContain('bg-[#e6d5b8]');
    expect(parchmentHtml).toContain('text-[#3e2723]');
    expect(parchmentHtml).toContain('border-[#8b5a2b]/30');
    expect(parchmentHtml).toContain('rounded-lg');
  });

  test('5. Search input in Parchment theme has no conventional rounded corners or inner border shadow', () => {
    const parchmentHtml = renderToStaticMarkup(
      <Controls
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onSearch={vi.fn()}
        onTraceRoute={vi.fn()}
        isSearching={false}
        skin="parchment"
        showFavorites={false}
        onToggleShowFavorites={vi.fn()}
        paused={false}
        isTraceModalOpen={false}
        onToggleTraceModal={vi.fn()}
        isZoomLocked={false}
        onToggleZoomLock={vi.fn()}
      />
    );

    expect(parchmentHtml).toContain('rounded-none shadow-none');
    expect(parchmentHtml).not.toContain('shadow-[inset_0_0_0_1px_rgba(140,110,75,0.35)]');
    expect(parchmentHtml).toContain('parchment-background');
    // Parchment search container has transparent font styling
    expect(parchmentHtml).not.toMatch(/bg-\[#e8d5b5\]/);
    expect(parchmentHtml).not.toMatch(/hover:bg-\[#d2b48c\]\/80/);
    expect(parchmentHtml).toContain('text-[#522B07]');
  });

  test('6. Stacking architecture preserves z-0 background and z-1 crisp content including Waypoint Navigation', () => {
    const routeNav = {
      current: 1,
      total: 3,
      routeGroupName: 'Meiji Restoration',
      routeLocalCurrent: 1,
      routeLocalTotal: 3,
      onNext: vi.fn(),
      onPrev: vi.fn()
    };

    const parchmentInfo = renderToStaticMarkup(
      <InfoPanel info={dummyInfo} onClose={vi.fn()} skin="parchment" routeNav={routeNav} />
    );
    expect(parchmentInfo).toContain('[isolation:isolate]');
    expect(parchmentInfo).toContain('parchment-background');
    expect(parchmentInfo).toContain('relative z-[1]');
    expect(parchmentInfo).toContain('aria-label="Previous waypoint"');
    expect(parchmentInfo).toContain('aria-label="Next waypoint"');
    expect(parchmentInfo).not.toContain('bg-[#f4ead5]');
    // Nav buttons must not have solid background fill in parchment skin
    expect(parchmentInfo).not.toMatch(/aria-label="Previous waypoint"[^>]*bg-\[#e8d5b5\]/);
    expect(parchmentInfo).not.toMatch(/aria-label="Next waypoint"[^>]*bg-\[#e8d5b5\]/);
    expect(parchmentInfo).not.toMatch(/aria-label="Previous waypoint"[^>]*hover:bg-\[#d2b48c\]/);
    expect(parchmentInfo).not.toMatch(/aria-label="Next waypoint"[^>]*hover:bg-\[#d2b48c\]/);

    const parchmentControls = renderToStaticMarkup(
      <Controls
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onSearch={vi.fn()}
        onTraceRoute={vi.fn()}
        isSearching={false}
        skin="parchment"
        showFavorites={false}
        onToggleShowFavorites={vi.fn()}
        paused={false}
        isTraceModalOpen={true}
        onToggleTraceModal={vi.fn()}
        isZoomLocked={false}
        onToggleZoomLock={vi.fn()}
      />
    );
    expect(parchmentControls).toContain('[isolation:isolate]');
    expect(parchmentControls).toContain('relative z-[1]');
    expect(parchmentControls).toContain('z-[19]');
    expect(parchmentInfo).toContain('z-30');
  });

  test('7. Drop shadows are removed from Explorations and Settings in Parchment theme, preserved in InfoPanel and other skins', () => {
    const parchmentSettings = renderToStaticMarkup(
      <SettingsPanel
        settings={defaultSettings}
        onUpdateSettings={vi.fn()}
        onClose={vi.fn()}
        skin="parchment"
      />
    );
    expect(parchmentSettings).not.toContain('shadow-[4px_4px_10px_rgba(0,0,0,0.3)]');

    const modernSettings = renderToStaticMarkup(
      <SettingsPanel
        settings={defaultSettings}
        onUpdateSettings={vi.fn()}
        onClose={vi.fn()}
        skin="modern"
      />
    );
    expect(modernSettings).toContain('shadow-[0_0_50px_rgba(0,0,0,0.8)]');

    const parchmentFavs = renderToStaticMarkup(
      <FavoritesPanel
        favorites={[]}
        onClose={vi.fn()}
        visibleFavoriteIds={[]}
        activeRouteId={null}
        onToggleVisibility={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
        onFlyTo={vi.fn()}
        skin="parchment"
      />
    );
    expect(parchmentFavs).not.toContain('shadow-[4px_4px_10px_rgba(0,0,0,0.3)]');

    const parchmentInfo = renderToStaticMarkup(
      <InfoPanel info={dummyInfo} onClose={vi.fn()} skin="parchment" />
    );
    expect(parchmentInfo).toContain('shadow-[4px_4px_10px_rgba(0,0,0,0.3)]');
  });

  test('8. AntiqueBookIcon is used for save actions in Parchment theme and standard Save icon is used in other skins', () => {
    const dummyRoute = {
      id: 'route-1',
      name: 'Spice Route',
      lat: 10,
      lng: 20,
      timestamp: Date.now(),
      isRoute: true,
      routeWaypoints: []
    };

    const parchmentFavs = renderToStaticMarkup(
      <FavoritesPanel
        favorites={[dummyRoute]}
        onClose={vi.fn()}
        visibleFavoriteIds={[]}
        activeRouteId={null}
        onToggleVisibility={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
        onFlyTo={vi.fn()}
        skin="parchment"
      />
    );
    expect(parchmentFavs).not.toContain('lucide-save');

    const modernFavs = renderToStaticMarkup(
      <FavoritesPanel
        favorites={[dummyRoute]}
        onClose={vi.fn()}
        visibleFavoriteIds={[]}
        activeRouteId={null}
        onToggleVisibility={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
        onFlyTo={vi.fn()}
        skin="modern"
      />
    );
    expect(modernFavs).not.toContain('lucide-open-book-perfect-fill');
  });

  test('9. InfoPanel header in Parchment theme has no explicit background class, creating a seamless surface with waypoint navigator', () => {
    const routeInfo = {
      ...dummyInfo,
      name: 'Trans-Saharan Route',
      waypoints: [
        { name: 'Timbuktu', lat: 16.7666, lng: -3.0026 },
        { name: 'Ghadames', lat: 30.1333, lng: 9.5 }
      ]
    };

    const parchmentHtml = renderToStaticMarkup(
      <InfoPanel
        info={routeInfo}
        onClose={vi.fn()}
        skin="parchment"
        routeNav={{
          waypoints: routeInfo.waypoints,
          currentIndex: 0,
          onSelectIndex: vi.fn()
        }}
      />
    );

    // Parchment header container has no bg-[#e8d5b5]/30 and renders cleanly
    expect(parchmentHtml).toContain('<div class="relative p-5 shrink-0 flex flex-col items-center">');
    expect(parchmentHtml).not.toContain('bg-[#e8d5b5]/30');

    // Waypoint navigator container remains transparent
    expect(parchmentHtml).toContain('bg-transparent');

    // Modern skin retains border-b border-white/10 and bg-white/5
    const modernHtml = renderToStaticMarkup(
      <InfoPanel
        info={routeInfo}
        onClose={vi.fn()}
        skin="modern"
        routeNav={{
          waypoints: routeInfo.waypoints,
          currentIndex: 0,
          onSelectIndex: vi.fn()
        }}
      />
    );
    expect(modernHtml).toContain('relative p-5 shrink-0 flex flex-col items-center border-b border-white/10 bg-gradient-to-r from-blue-900 to-cyan-900');

    // Retro-green retains bg-green-900/30
    const greenHtml = renderToStaticMarkup(
      <InfoPanel
        info={routeInfo}
        onClose={vi.fn()}
        skin="retro-green"
      />
    );
    expect(greenHtml).toContain('relative p-5 shrink-0 flex flex-col items-center bg-green-900/30');

    // Retro-amber retains bg-amber-900/30
    const amberHtml = renderToStaticMarkup(
      <InfoPanel
        info={routeInfo}
        onClose={vi.fn()}
        skin="retro-amber"
      />
    );
    expect(amberHtml).toContain('relative p-5 shrink-0 flex flex-col items-center bg-amber-900/30');
  });

  test('8. Voyager Ceremonial Banner renders only for Parchment theme with multiple waypoints', () => {
    const multiWaypointInfo: LocationInfo = {
      name: 'Voyage Route',
      description: 'A multi-waypoint expedition',
      type: 'Route',
      entityType: 'route',
      coordinates: { lat: 10, lng: 20 },
      waypoints: [
        { name: 'Point A', coordinates: { lat: 10, lng: 20 } },
        { name: 'Point B', coordinates: { lat: 12, lng: 22 } }
      ]
    };

    const singleWaypointInfo: LocationInfo = {
      name: 'Single Location',
      description: 'A single point of interest',
      type: 'City',
      coordinates: { lat: 10, lng: 20 }
    };

    const multiRouteNav = {
      waypoints: multiWaypointInfo.waypoints,
      currentIndex: 0,
      total: 2,
      current: 1,
      onSelectIndex: vi.fn(),
      onPrev: vi.fn(),
      onNext: vi.fn()
    };

    // Case 1: Parchment + Multiple Waypoints -> Banner renders, top thumbtack hidden
    const parchmentMultiHtml = renderToStaticMarkup(
      <InfoPanel
        info={multiWaypointInfo}
        onClose={vi.fn()}
        skin="parchment"
        routeNav={multiRouteNav}
      />
    );
    expect(parchmentMultiHtml).toContain('data-testid="voyager-ceremonial-banner"');
    expect(parchmentMultiHtml).toContain('voyager-g-emerald');
    expect(parchmentMultiHtml).toContain('voyager-g-gold');
    // Top thumbtack container (-mt-[10px] mb-[26px]) should not be rendered in header
    expect(parchmentMultiHtml).not.toContain('-mt-[10px] mb-[26px]');

    // Case 2: Parchment + 1 Waypoint -> Banner NOT rendered, top thumbtack present with MedievalEmeraldBronzePinIcon
    const parchmentSingleHtml = renderToStaticMarkup(
      <InfoPanel
        info={singleWaypointInfo}
        onClose={vi.fn()}
        skin="parchment"
      />
    );
    expect(parchmentSingleHtml).not.toContain('data-testid="voyager-ceremonial-banner"');
    expect(parchmentSingleHtml).toContain('-mt-[10px] mb-[26px]');
    expect(parchmentSingleHtml).toContain('bronzeHead');
    expect(parchmentSingleHtml).not.toContain('lucide-pin');

    // Case 3: Modern theme + Multiple Waypoints -> Banner NOT rendered, top thumbtack present with standard Pin
    const modernMultiHtml = renderToStaticMarkup(
      <InfoPanel
        info={multiWaypointInfo}
        onClose={vi.fn()}
        skin="modern"
        routeNav={multiRouteNav}
      />
    );
    expect(modernMultiHtml).not.toContain('data-testid="voyager-ceremonial-banner"');
    expect(modernMultiHtml).toContain('-mt-[10px] mb-[26px]');
    expect(modernMultiHtml).toContain('lucide-pin');
    expect(modernMultiHtml).not.toContain('bronzeHead');

    // Case 4: Retro Green theme + Multiple Waypoints -> Banner NOT rendered, top thumbtack present with standard Pin
    const retroMultiHtml = renderToStaticMarkup(
      <InfoPanel
        info={multiWaypointInfo}
        onClose={vi.fn()}
        skin="retro-green"
        routeNav={multiRouteNav}
      />
    );
    expect(retroMultiHtml).not.toContain('data-testid="voyager-ceremonial-banner"');
    expect(retroMultiHtml).toContain('-mt-[10px] mb-[26px]');
    expect(retroMultiHtml).toContain('lucide-pin');
    expect(retroMultiHtml).not.toContain('bronzeHead');
  });

  test('9. Parchment theme LOAD NEWS button has no background in normal or hover states', () => {
    const newsInfo: LocationInfo = {
      name: 'London',
      description: 'Capital city',
      type: 'City',
      coordinates: { lat: 51.5, lng: -0.1 },
      news: []
    };

    const parchmentHtml = renderToStaticMarkup(
      <InfoPanel
        info={newsInfo}
        onClose={vi.fn()}
        skin="parchment"
        showNews={true}
      />
    );
    // Parchment uses bg-transparent hover:bg-transparent and no background tint on LOAD NEWS button
    expect(parchmentHtml).toContain('bg-transparent hover:bg-transparent text-[#5c3a21]');
    expect(parchmentHtml).not.toContain('bg-[#e8d5b5]/50 hover:bg-[#d2b48c]');

    const modernHtml = renderToStaticMarkup(
      <InfoPanel
        info={newsInfo}
        onClose={vi.fn()}
        skin="modern"
        showNews={true}
      />
    );
    // Modern theme retains its background styles
    expect(modernHtml).toContain('bg-white/5 border border-white/20 hover:bg-white/10 text-cyan-300');
  });

  test('10. Parchment theme ADD NOTE button has no icon and is centered by itself', () => {
    const dummyLocInfo: LocationInfo = {
      name: 'Paris',
      description: 'Capital of France',
      type: 'City',
      coordinates: { lat: 48.85, lng: 2.35 }
    };

    const parchmentHtml = renderToStaticMarkup(
      <InfoPanel
        info={dummyLocInfo}
        onClose={vi.fn()}
        skin="parchment"
      />
    );
    // Find the Add Note button in parchment - it should not contain lucide-sticky-note
    expect(parchmentHtml).toContain('Add Note');
    // The Add Note footer button should not render StickyNote in parchment
    expect(parchmentHtml).not.toContain('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sticky-note" aria-hidden="true"><path d="M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z"></path><path d="M15 3v5a1 1 0 0 0 1 1h5"></path></svg>Add Note');

    const modernHtml = renderToStaticMarkup(
      <InfoPanel
        info={dummyLocInfo}
        onClose={vi.fn()}
        skin="modern"
      />
    );
    // Modern theme Add Note button retains the StickyNote icon
    expect(modernHtml).toContain('lucide-sticky-note');
  });

  test('11. Standardized Parchment buttons (LOAD NEWS, ADD NOTE, EXPLORE, GENERATE ROUTE, TEST CONNECTION, TEST VOICE)', () => {
    const dummyLocInfo: LocationInfo = {
      name: 'Paris',
      description: 'Capital of France',
      type: 'City',
      coordinates: { lat: 48.85, lng: 2.35 },
      news: []
    };

    // 1. InfoPanel: LOAD NEWS & ADD NOTE
    const parchmentInfo = renderToStaticMarkup(
      <InfoPanel info={dummyLocInfo} onClose={vi.fn()} skin="parchment" showNews={true} />
    );
    expect(parchmentInfo).toContain('bg-transparent hover:bg-transparent text-[#5c3a21]');
    expect(parchmentInfo).toContain('Load News');
    expect(parchmentInfo).toContain('Add Note');

    // 2. Controls: GENERATE ROUTE in Trace Route modal
    const parchmentControls = renderToStaticMarkup(
      <Controls
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onSearch={vi.fn()}
        onTraceRoute={vi.fn()}
        isSearching={false}
        skin="parchment"
        showFavorites={false}
        onToggleShowFavorites={vi.fn()}
        paused={false}
        isTraceModalOpen={true}
        onToggleTraceModal={vi.fn()}
        isZoomLocked={false}
        onToggleZoomLock={vi.fn()}
      />
    );
    // GENERATE ROUTE button in Trace Route modal
    expect(parchmentControls).toContain('border-[#8b5a2b]/30 hover:bg-[#e6d5b8] text-[#3e2723]');
    expect(parchmentControls).toContain('Generate Route');

    // 3. SettingsPanel: TEST CONNECTION & TEST VOICE
    const parchmentProvidersSettings = renderToStaticMarkup(
      <SettingsPanel
        settings={{ ...defaultSettings, aiProvider: 'lmstudio', newsProvider: 'tavily', lmStudioUrl: 'http://localhost:1234' }}
        onUpdateSettings={vi.fn()}
        onClose={vi.fn()}
        skin="parchment"
        initialTab="providers"
      />
    );
    // TEST CONNECTION buttons have border-[#8b5a2b]/30, hover:bg-[#e6d5b8], text-[#3e2723]
    const testConnButtons = parchmentProvidersSettings.match(/border-\[#8b5a2b\]\/30 hover:bg-\[#e6d5b8\] text-\[#3e2723\]/g);
    expect(testConnButtons?.length).toBe(3);

    // Audio tab: TEST VOICE button
    const parchmentAudioSettings = renderToStaticMarkup(
      <SettingsPanel
        settings={{ ...defaultSettings, narrationEnabled: true }}
        onUpdateSettings={vi.fn()}
        onClose={vi.fn()}
        skin="parchment"
        initialTab="audio"
      />
    );
    expect(parchmentAudioSettings).toContain('border-[#8b5a2b]/30 hover:bg-[#e6d5b8] text-[#3e2723]');
    expect(parchmentAudioSettings).toContain('Test Voice');
  });

  test('12. Standardized Parchment headers (EXPLORATIONS, SETTINGS, TRACE ROUTE)', () => {
    // 1. FavoritesPanel: EXPLORATIONS
    const parchmentFavs = renderToStaticMarkup(
      <FavoritesPanel
        favorites={[]}
        onClose={vi.fn()}
        visibleFavoriteIds={[]}
        activeRouteId={null}
        onToggleVisibility={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
        onFlyTo={vi.fn()}
        skin="parchment"
      />
    );
    expect(parchmentFavs).toContain('text-lg font-bold text-[#5c3a21] font-bold uppercase tracking-wider brand-font');
    expect(parchmentFavs).toContain('EXPLORATIONS');

    // 2. SettingsPanel: SETTINGS
    const parchmentSettings = renderToStaticMarkup(
      <SettingsPanel
        settings={defaultSettings}
        onUpdateSettings={vi.fn()}
        onClose={vi.fn()}
        skin="parchment"
      />
    );
    expect(parchmentSettings).toContain('text-lg font-bold text-[#3e2723] font-bold uppercase tracking-wider brand-font');
    expect(parchmentSettings).toContain('SETTINGS');

    // 3. Controls: TRACE ROUTE
    const parchmentControls = renderToStaticMarkup(
      <Controls
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onSearch={vi.fn()}
        onTraceRoute={vi.fn()}
        isSearching={false}
        skin="parchment"
        showFavorites={false}
        onToggleShowFavorites={vi.fn()}
        paused={false}
        isTraceModalOpen={true}
        onToggleTraceModal={vi.fn()}
        isZoomLocked={false}
        onToggleZoomLock={vi.fn()}
      />
    );
    expect(parchmentControls).toContain('font-bold uppercase text-[#3e2723] text-lg tracking-wider brand-font');
    expect(parchmentControls).toContain('Trace Route');
  });

  test('13. Settings panel removes decorative settings glyph only in Parchment theme', () => {
    const parchmentSettings = renderToStaticMarkup(
      <SettingsPanel
        settings={defaultSettings}
        onUpdateSettings={vi.fn()}
        onClose={vi.fn()}
        skin="parchment"
      />
    );
    expect(parchmentSettings).toContain('SETTINGS');
    expect(parchmentSettings).not.toContain('lucide-settings');

    const modernSettings = renderToStaticMarkup(
      <SettingsPanel
        settings={defaultSettings}
        onUpdateSettings={vi.fn()}
        onClose={vi.fn()}
        skin="modern"
      />
    );
    expect(modernSettings).toContain('SETTINGS');
    expect(modernSettings).toContain('lucide-settings');

    const retroSettings = renderToStaticMarkup(
      <SettingsPanel
        settings={defaultSettings}
        onUpdateSettings={vi.fn()}
        onClose={vi.fn()}
        skin="retro-amber"
      />
    );
    expect(retroSettings).toContain('SETTINGS');
    expect(retroSettings).toContain('lucide-settings');
  });

  test('14. Trace Route overlay styling matches Settings panel in Parchment theme', () => {
    const parchmentControls = renderToStaticMarkup(
      <Controls
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onSearch={vi.fn()}
        onTraceRoute={vi.fn()}
        isSearching={false}
        skin="parchment"
        showFavorites={false}
        onToggleShowFavorites={vi.fn()}
        paused={false}
        isTraceModalOpen={true}
        onToggleTraceModal={vi.fn()}
        isZoomLocked={false}
        onToggleZoomLock={vi.fn()}
      />
    );

    // Parchment Title & Description
    expect(parchmentControls).toContain('text-[#3e2723] text-lg tracking-wider brand-font');
    expect(parchmentControls).toContain('text-sm text-[#3e2723]/70');

    // Parchment Textarea form control
    expect(parchmentControls).toContain('bg-[#e6d5b8] text-[#3e2723] border border-[#8b5a2b]/30 rounded-lg placeholder-[#3e2723]/60 focus:border-[#8b5a2b] focus:ring-1 focus:ring-[#8b5a2b]');

    // Parchment Generate Route button
    expect(parchmentControls).toContain('px-3 py-2 rounded-lg border whitespace-nowrap transition-colors border-[#8b5a2b]/30 hover:bg-[#e6d5b8] text-[#3e2723]');

    // Parchment Close button
    expect(parchmentControls).toContain('hover:bg-[#d2b48c]/50 hover:text-[#3e2723] text-[#3e2723] rounded');

    // Non-parchment themes remain unchanged
    const modernControls = renderToStaticMarkup(
      <Controls
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onSearch={vi.fn()}
        onTraceRoute={vi.fn()}
        isSearching={false}
        skin="modern"
        showFavorites={false}
        onToggleShowFavorites={vi.fn()}
        paused={false}
        isTraceModalOpen={true}
        onToggleTraceModal={vi.fn()}
        isZoomLocked={false}
        onToggleZoomLock={vi.fn()}
      />
    );
    expect(modernControls).toContain('bg-transparent border border-white/20 rounded-lg');
    expect(modernControls).not.toContain('bg-[#e6d5b8]');
  });
});



