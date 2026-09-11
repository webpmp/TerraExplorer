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

  test('4. Trace Route modal removes outer 2px border, rounded-sm, and textarea border in Parchment theme', () => {
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

    // Textarea has border-0, bg-transparent, and no rectangular background
    expect(parchmentHtml).toContain('border-0 rounded-none');
    expect(parchmentHtml).not.toContain('border border-current');
    expect(parchmentHtml).not.toContain('bg-[#e8d5b5]/30');
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
    expect(parchmentHtml).toContain('EXPLORE');
    // Parchment EXPLORE button has no colored rectangle background
    expect(parchmentHtml).not.toMatch(/EXPLORE<\/button>/ && /bg-\[#e8d5b5\][^>]*>EXPLORE/);
    expect(parchmentHtml).not.toMatch(/hover:bg-\[#d2b48c\]\/80/);
    expect(parchmentHtml).toContain('text-[#5c3a21]');
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
});

