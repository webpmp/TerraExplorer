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
});
