import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import FavoritesPanel from '../FavoritesPanel';
import { FavoriteLocation } from '../../types';

describe('FavoritesPanel - Selected Route Chevron Border', () => {
  const sampleFavorites: FavoriteLocation[] = [
    {
      id: 'route-1',
      name: 'Trans-Atlantic Route',
      type: 'route',
      waypoints: [
        { id: 'wp-1', name: 'New York', lat: 40.7128, lng: -74.006 },
        { id: 'wp-2', name: 'London', lat: 51.5074, lng: -0.1278 }
      ]
    },
    {
      id: 'route-2',
      name: 'Pacific Route',
      type: 'route',
      waypoints: [
        { id: 'wp-3', name: 'Tokyo', lat: 35.6762, lng: 139.6503 },
        { id: 'wp-4', name: 'Honolulu', lat: 21.3069, lng: -157.8583 }
      ]
    },
    {
      id: 'poi-1',
      name: 'Eiffel Tower',
      lat: 48.8584,
      lng: 2.2945
    }
  ];

  const defaultProps = {
    favorites: sampleFavorites,
    onClose: vi.fn(),
    visibleFavoriteIds: ['poi-1'],
    activeRouteId: 'route-1',
    onToggleVisibility: vi.fn(),
    onDelete: vi.fn(),
    onUpdate: vi.fn(),
    onFlyTo: vi.fn(),
    skin: 'parchment' as const
  };

  it('1. Selected route exclusively receives hover background, chevron fill, and border-r-0', () => {
    const html = renderToStaticMarkup(<FavoritesPanel {...defaultProps} />);

    // Selected route has border-r-0 and rounded-r-none
    expect(html).toContain('border-r-0 rounded-r-none');

    // Selected route root card has hover background-color and explicit 0px right border
    expect(html).toContain('background-color:#e8d5b5');
    expect(html).toContain('border-right-width:0px');
    expect(html).toContain('border-right-style:none');

    // Verify SVG chevron polygon fill matches hover background (#e8d5b5)
    expect(html).toContain('fill="#e8d5b5"');

    // Verify SVG chevron polyline exists with points 0,0 8,50 0,100
    expect(html).toContain('points="0,0 8,50 0,100"');
    expect(html).toContain('stroke="#5c3a21"'); // Parchment active border color
  });

  it('2. Unselected saved route does NOT receive chevron right border or fill', () => {
    const html = renderToStaticMarkup(<FavoritesPanel {...defaultProps} activeRouteId="none" />);

    // No active route selected -> no chevron polyline and no border-r-0
    expect(html).not.toContain('points="0,0 8,50 0,100"');
    expect(html).not.toContain('border-r-0 rounded-r-none');
    expect(html).not.toContain('background-color:#e8d5b5');
  });

  it('3. Point of Interest favorites do NOT receive chevron right border even when visible', () => {
    const html = renderToStaticMarkup(
      <FavoritesPanel
        {...defaultProps}
        favorites={[sampleFavorites[2]]} // Only POI
        visibleFavoriteIds={['poi-1']}
        activeRouteId={null}
      />
    );

    // No chevron on POI items
    expect(html).not.toContain('points="0,0 8,50 0,100"');
    expect(html).not.toContain('border-r-0');
  });

  it('4. Uses theme-aware hover background and border colors for selected route chevron', () => {
    const modernHtml = renderToStaticMarkup(<FavoritesPanel {...defaultProps} skin="modern" />);
    expect(modernHtml).toContain('background-color:rgba(255, 255, 255, 0.1)');
    expect(modernHtml).toContain('border-right-width:0px');
    expect(modernHtml).toContain('border-right-style:none');
    expect(modernHtml).toContain('border-r-0 rounded-r-none');
    expect(modernHtml).toContain('border-cyan-500/50');
    expect(modernHtml).toContain('fill="rgba(255, 255, 255, 0.1)"');
    expect(modernHtml).toContain('stroke="rgba(6, 182, 212, 0.5)"');

    const greenHtml = renderToStaticMarkup(<FavoritesPanel {...defaultProps} skin="retro-green" />);
    expect(greenHtml).toContain('background-color:rgba(20, 83, 45, 0.2)');
    expect(greenHtml).toContain('fill="rgba(20, 83, 45, 0.2)"');
    expect(greenHtml).toContain('stroke="#4ade80"');

    const amberHtml = renderToStaticMarkup(<FavoritesPanel {...defaultProps} skin="retro-amber" />);
    expect(amberHtml).toContain('background-color:rgba(120, 53, 15, 0.2)');
    expect(amberHtml).toContain('fill="rgba(120, 53, 15, 0.2)"');
    expect(amberHtml).toContain('stroke="#fbbf24"');

    const parchmentHtml = renderToStaticMarkup(<FavoritesPanel {...defaultProps} skin="parchment" />);
    expect(parchmentHtml).toContain('background-color:#e8d5b5');
    expect(parchmentHtml).toContain('fill="#e8d5b5"');
    expect(parchmentHtml).toContain('stroke="#5c3a21"');
  });

  it('5. Applies text-sm font size to saved route waypoint count across all themes without location text', () => {
    const skins: ('modern' | 'parchment' | 'retro-green' | 'retro-amber')[] = ['modern', 'parchment', 'retro-green', 'retro-amber'];

    for (const skin of skins) {
      const html = renderToStaticMarkup(<FavoritesPanel {...defaultProps} skin={skin} />);
      expect(html).toContain('<p class="text-sm opacity-60 truncate">2 waypoints</p>');
      expect(html).not.toContain('2 waypoints •');
      expect(html).not.toContain('New York');
    }
  });

  it('6. Correctly renders singular "1 waypoint" and plural "9 waypoints" / "3 waypoints"', () => {
    const singleWaypointRoute: FavoriteLocation = {
      id: 'route-single',
      name: 'Single Stop Route',
      type: 'route',
      waypoints: [{ id: 'wp-1', name: 'Cairo', lat: 30.0444, lng: 31.2357 }]
    };

    const multiWaypointRoute: FavoriteLocation = {
      id: 'route-multi',
      name: 'Silk Road Tour',
      type: 'route',
      waypoints: Array.from({ length: 9 }, (_, i) => ({
        id: `wp-${i + 1}`,
        name: `Stop ${i + 1}`,
        lat: 35.0 + i,
        lng: 70.0 + i
      }))
    };

    const threeWaypointRoute: FavoriteLocation = {
      id: 'route-three',
      name: 'Golden Triangle',
      type: 'route',
      waypoints: [
        { id: 'wp-1', name: 'Delhi', lat: 28.6139, lng: 77.209 },
        { id: 'wp-2', name: 'Agra', lat: 27.1767, lng: 78.0081 },
        { id: 'wp-3', name: 'Jaipur', lat: 26.9124, lng: 75.7873 }
      ]
    };

    const singleHtml = renderToStaticMarkup(
      <FavoritesPanel {...defaultProps} favorites={[singleWaypointRoute]} activeRouteId="route-single" />
    );
    expect(singleHtml).toContain('<p class="text-sm opacity-60 truncate">1 waypoint</p>');
    expect(singleHtml).not.toContain('1 waypoint •');
    expect(singleHtml).not.toContain('Cairo');

    const multiHtml = renderToStaticMarkup(
      <FavoritesPanel {...defaultProps} favorites={[multiWaypointRoute]} activeRouteId="route-multi" />
    );
    expect(multiHtml).toContain('<p class="text-sm opacity-60 truncate">9 waypoints</p>');
    expect(multiHtml).not.toContain('9 waypoints •');
    expect(multiHtml).not.toContain('Stop 1');

    const threeHtml = renderToStaticMarkup(
      <FavoritesPanel {...defaultProps} favorites={[threeWaypointRoute]} activeRouteId="route-three" />
    );
    expect(threeHtml).toContain('<p class="text-sm opacity-60 truncate">3 waypoints</p>');
    expect(threeHtml).not.toContain('3 waypoints •');
    expect(threeHtml).not.toContain('Delhi');
  });

  it('7. EDIT ROUTE modal renders text-only "Save Changes" with theme-specific button styling', () => {
    const retroAmberHtml = renderToStaticMarkup(
      <FavoritesPanel {...defaultProps} skin="retro-amber" initialEditingRoute={sampleFavorites[0]} />
    );
    expect(retroAmberHtml).toContain('Save Changes');
    expect(retroAmberHtml).toContain('bg-amber-400 text-black hover:opacity-90');
    expect(retroAmberHtml).toMatch(/<button[^>]*class="[^"]*bg-amber-400 text-black hover:opacity-90[^"]*"[^>]*>\s*Save Changes\s*<\/button>/);

    const retroGreenHtml = renderToStaticMarkup(
      <FavoritesPanel {...defaultProps} skin="retro-green" initialEditingRoute={sampleFavorites[0]} />
    );
    expect(retroGreenHtml).toContain('bg-green-400 text-black hover:opacity-90');
    expect(retroGreenHtml).toMatch(/<button[^>]*class="[^"]*bg-green-400 text-black hover:opacity-90[^"]*"[^>]*>\s*Save Changes\s*<\/button>/);

    const modernHtml = renderToStaticMarkup(
      <FavoritesPanel {...defaultProps} skin="modern" initialEditingRoute={sampleFavorites[0]} />
    );
    expect(modernHtml).toContain('bg-cyan-600 hover:bg-cyan-500 rounded-lg shadow-lg shadow-cyan-900/50');
    expect(modernHtml).toMatch(/<button[^>]*class="[^"]*bg-cyan-600 hover:bg-cyan-500[^"]*"[^>]*>\s*Save Changes\s*<\/button>/);

    const parchmentHtml = renderToStaticMarkup(
      <FavoritesPanel {...defaultProps} skin="parchment" initialEditingRoute={sampleFavorites[0]} />
    );
    expect(parchmentHtml).toContain('text-[#3e2723] hover:text-[#1a0f07]');
    expect(parchmentHtml).toMatch(/<button[^>]*class="[^"]*text-\[#3e2723\] hover:text-\[#1a0f07\][^"]*"[^>]*>\s*Save Changes\s*<\/button>/);
  });
});
