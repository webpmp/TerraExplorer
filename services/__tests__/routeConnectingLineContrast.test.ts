import { describe, it, expect } from 'vitest';
import { getConnectingLineColor, isBrightTerrainAt } from '../../utils/routeLineColor';
import { SkinType } from '../../types';

describe('Contrast-Aware Route Connecting Line Behavior', () => {
  describe('Modern Theme - Globe View', () => {
    it('uses cyan for dark ocean background', () => {
      const color = getConnectingLineColor({
        theme: 'modern',
        mapLayer: 'globe',
        backgroundContext: { lat: 0, lng: -30 } // Atlantic Ocean
      });
      expect(color).toBe('#00e5ff');
    });

    it('uses cyan for standard dark landmass background', () => {
      const color = getConnectingLineColor({
        theme: 'modern',
        mapLayer: 'globe',
        backgroundContext: { lat: 40.7128, lng: -74.006 } // New York
      });
      expect(color).toBe('#00e5ff');
    });

    it('uses dark #111111 for Antarctica ice sheet', () => {
      expect(isBrightTerrainAt(-75, 0)).toBe(true);
      const color = getConnectingLineColor({
        theme: 'modern',
        mapLayer: 'globe',
        backgroundContext: { lat: -75, lng: 0 }
      });
      expect(color).toBe('#111111');
    });

    it('uses dark #111111 for Greenland ice cap', () => {
      expect(isBrightTerrainAt(72, -40)).toBe(true);
      const color = getConnectingLineColor({
        theme: 'modern',
        mapLayer: 'globe',
        backgroundContext: { lat: 72, lng: -40 }
      });
      expect(color).toBe('#111111');
    });

    it('uses dark #111111 for High Arctic permanent ice', () => {
      expect(isBrightTerrainAt(80, 15)).toBe(true);
      const color = getConnectingLineColor({
        theme: 'modern',
        mapLayer: 'globe',
        backgroundContext: { lat: 80, lng: 15 }
      });
      expect(color).toBe('#111111');
    });

    it('uses dark #111111 for glaciated alpine regions (Himalayas & Alaska)', () => {
      expect(isBrightTerrainAt(28.0, 86.9)).toBe(true); // Mount Everest / Himalayas
      expect(isBrightTerrainAt(61.0, -141.0)).toBe(true); // Mount St. Elias / Alaska Icefield

      const himalayasColor = getConnectingLineColor({
        theme: 'modern',
        mapLayer: 'globe',
        backgroundContext: { lat: 28.0, lng: 86.9 }
      });
      expect(himalayasColor).toBe('#111111');

      const alaskaColor = getConnectingLineColor({
        theme: 'modern',
        mapLayer: 'globe',
        backgroundContext: { lat: 61.0, lng: -141.0 }
      });
      expect(alaskaColor).toBe('#111111');
    });

    it('uses dark #111111 when backgroundContext explicitly flags isBrightTerrain', () => {
      const color = getConnectingLineColor({
        theme: 'modern',
        mapLayer: 'globe',
        backgroundContext: { isBrightTerrain: true }
      });
      expect(color).toBe('#111111');
    });
  });

  describe('Modern Theme - OSM View', () => {
    it('always uses dark #111111 on OSM map layer', () => {
      const color = getConnectingLineColor({
        theme: 'modern',
        mapLayer: 'osm'
      });
      expect(color).toBe('#111111');
    });

    it('uses dark #111111 on OSM regardless of coordinates', () => {
      const color1 = getConnectingLineColor({
        theme: 'modern',
        mapLayer: 'osm',
        backgroundContext: { lat: 48.8566, lng: 2.3522 } // Paris
      });
      expect(color1).toBe('#111111');

      const color2 = getConnectingLineColor({
        theme: 'modern',
        mapLayer: 'osm',
        backgroundContext: { lat: -75.0, lng: 0 } // Antarctica
      });
      expect(color2).toBe('#111111');
    });
  });

  describe('Other Themes Preservation', () => {
    it('preserves Parchment theme route color across Globe and OSM', () => {
      expect(getConnectingLineColor({ theme: 'parchment', mapLayer: 'globe' })).toBe('#8b5a2b');
      expect(getConnectingLineColor({ theme: 'parchment', mapLayer: 'osm' })).toBe('#8b5a2b');
    });

    it('preserves Retro Green theme route color across Globe and OSM', () => {
      expect(getConnectingLineColor({ theme: 'retro-green', mapLayer: 'globe' })).toBe('#4ade80');
      expect(getConnectingLineColor({ theme: 'retro-green', mapLayer: 'osm' })).toBe('#4ade80');
    });

    it('preserves Retro Amber theme route color across Globe and OSM', () => {
      expect(getConnectingLineColor({ theme: 'retro-amber', mapLayer: 'globe' })).toBe('#fbbf24');
      expect(getConnectingLineColor({ theme: 'retro-amber', mapLayer: 'osm' })).toBe('#fbbf24');
    });
  });
});
