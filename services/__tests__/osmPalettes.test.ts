import { describe, it, expect, vi } from 'vitest';
import {
  getOsmPalette,
  getImageFilter,
  retroGreenOsmPalette,
  retroAmberOsmPalette,
  modernOsmPalette,
  parchmentOsmPalette,
  SECONDARY_LABEL_LAYERS,
  HIGHWAY_LABEL_LAYERS,
  PROTECTED_ROAD_NAME_LAYERS,
  transformRetroVectorStyle,
  applyOSMThemeLayerStyles
} from '../../utils/osmPalettes';

// Helper to compute standard relative luminance from hex color string (W3C standard)
function hexToLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const sRGB = [r, g, b].map((val) => {
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

describe('OSM Theme Palettes & CRT Contrast Hierarchy Suite', () => {
  describe('Retro Green Theme Contrast Hierarchy', () => {
    it('enforces Water (darkest) -> Land -> Ice/Snow (lightest) luminance hierarchy', () => {
      const waterLum = hexToLuminance(retroGreenOsmPalette.water);
      const landLum = hexToLuminance(retroGreenOsmPalette.land);
      const iceLum = hexToLuminance(retroGreenOsmPalette.ice);

      // Water must be very dark/near-black
      expect(waterLum).toBeLessThan(0.08);

      // Land must be noticeably lighter than water
      expect(landLum).toBeGreaterThan(waterLum);
      expect(landLum / (waterLum + 0.001)).toBeGreaterThan(2.0); // At least 2x contrast

      // Ice/Snow must be significantly lighter than land
      expect(iceLum).toBeGreaterThan(0.60);
      expect(iceLum).toBeGreaterThan(landLum * 2.0);
    });

    it('distinguishes parks from regular land without becoming overly bright', () => {
      const landLum = hexToLuminance(retroGreenOsmPalette.land);
      const parkLum = hexToLuminance(retroGreenOsmPalette.park);

      expect(parkLum).toBeGreaterThan(landLum);
      expect(parkLum).toBeLessThan(0.40); // Restrained CRT feel
    });

    it('enforces readable road hierarchy with major highways most visible and readable labels', () => {
      const roadLum = hexToLuminance(retroGreenOsmPalette.roads);
      const highwayLum = hexToLuminance(retroGreenOsmPalette.highways);
      const labelLum = hexToLuminance(retroGreenOsmPalette.labels);
      const landLum = hexToLuminance(retroGreenOsmPalette.land);

      expect(highwayLum).toBeGreaterThan(roadLum);
      expect(highwayLum).toBeGreaterThan(landLum);
      expect(labelLum).toBeGreaterThan(0.65); // Clear high-contrast text against dark map
    });

    it('defines secondaryLabels color within the #A8A8A8 to #B5B5B5 range for improved contrast', () => {
      expect(retroGreenOsmPalette.secondaryLabels).toBeDefined();
      expect(retroGreenOsmPalette.secondaryLabels).toBe('#b0b0b0');

      const secLum = hexToLuminance(retroGreenOsmPalette.secondaryLabels!);
      const darkGrayLum = hexToLuminance('#515151');
      const landLum = hexToLuminance(retroGreenOsmPalette.land);

      // Must be significantly lighter than dark gray (#515151) and map land
      expect(secLum).toBeGreaterThan(darkGrayLum * 3.5);
      expect(secLum).toBeGreaterThan(landLum);
      // Must remain subordinate to pure white primary labels/street names
      expect(secLum).toBeLessThan(0.65);
    });

    it('defines highwayLabels color for major highway and freeway names', () => {
      expect(retroGreenOsmPalette.highwayLabels).toBeDefined();
      expect(retroGreenOsmPalette.highwayLabels).toBe('#b0b0b0');

      const highwayLabelLum = hexToLuminance(retroGreenOsmPalette.highwayLabels!);
      const darkMajorRoadLum = hexToLuminance('#383838');
      const landLum = hexToLuminance(retroGreenOsmPalette.land);

      // Must be significantly lighter than the original dark major road text (#383838)
      expect(highwayLabelLum).toBeGreaterThan(darkMajorRoadLum * 4.0);
      expect(highwayLabelLum).toBeGreaterThan(landLum);
    });

    it('includes valid CSS and SVG filter references', () => {
      expect(retroGreenOsmPalette.cssFilter).toContain('retro-green-osm-filter');
      expect(retroGreenOsmPalette.svgFilterId).toBe('retro-green-osm-filter');
    });
  });

  describe('Retro Amber Theme Contrast Hierarchy', () => {
    it('enforces Water (darkest) -> Land -> Ice/Snow (lightest) luminance hierarchy', () => {
      const waterLum = hexToLuminance(retroAmberOsmPalette.water);
      const landLum = hexToLuminance(retroAmberOsmPalette.land);
      const iceLum = hexToLuminance(retroAmberOsmPalette.ice);

      // Water must be very dark/near-black
      expect(waterLum).toBeLessThan(0.08);

      // Land must be noticeably lighter than water
      expect(landLum).toBeGreaterThan(waterLum);
      expect(landLum / (waterLum + 0.001)).toBeGreaterThan(2.0); // At least 2x contrast

      // Ice/Snow must be significantly lighter than land
      expect(iceLum).toBeGreaterThan(0.60);
      expect(iceLum).toBeGreaterThan(landLum * 2.0);
    });

    it('distinguishes parks from regular land without becoming overly bright', () => {
      const landLum = hexToLuminance(retroAmberOsmPalette.land);
      const parkLum = hexToLuminance(retroAmberOsmPalette.park);

      expect(parkLum).toBeGreaterThan(landLum);
      expect(parkLum).toBeLessThan(0.40); // Restrained CRT feel
    });

    it('enforces readable road hierarchy with major highways most visible and readable labels', () => {
      const roadLum = hexToLuminance(retroAmberOsmPalette.roads);
      const highwayLum = hexToLuminance(retroAmberOsmPalette.highways);
      const labelLum = hexToLuminance(retroAmberOsmPalette.labels);
      const landLum = hexToLuminance(retroAmberOsmPalette.land);

      expect(highwayLum).toBeGreaterThan(roadLum);
      expect(highwayLum).toBeGreaterThan(landLum);
      expect(labelLum).toBeGreaterThan(0.65); // Clear high-contrast text against dark map
    });

    it('defines secondaryLabels color within the #A8A8A8 to #B5B5B5 range for improved contrast', () => {
      expect(retroAmberOsmPalette.secondaryLabels).toBeDefined();
      expect(retroAmberOsmPalette.secondaryLabels).toBe('#b0b0b0');

      const secLum = hexToLuminance(retroAmberOsmPalette.secondaryLabels!);
      const darkGrayLum = hexToLuminance('#515151');
      const landLum = hexToLuminance(retroAmberOsmPalette.land);

      // Must be significantly lighter than dark gray (#515151) and map land
      expect(secLum).toBeGreaterThan(darkGrayLum * 3.5);
      expect(secLum).toBeGreaterThan(landLum);
      // Must remain subordinate to pure white primary labels/street names
      expect(secLum).toBeLessThan(0.65);
    });

    it('defines highwayLabels color for major highway and freeway names', () => {
      expect(retroAmberOsmPalette.highwayLabels).toBeDefined();
      expect(retroAmberOsmPalette.highwayLabels).toBe('#b0b0b0');

      const highwayLabelLum = hexToLuminance(retroAmberOsmPalette.highwayLabels!);
      const darkMajorRoadLum = hexToLuminance('#383838');
      const landLum = hexToLuminance(retroAmberOsmPalette.land);

      // Must be significantly lighter than the original dark major road text (#383838)
      expect(highwayLabelLum).toBeGreaterThan(darkMajorRoadLum * 4.0);
      expect(highwayLabelLum).toBeGreaterThan(landLum);
    });

    it('includes valid CSS and SVG filter references', () => {
      expect(retroAmberOsmPalette.cssFilter).toContain('retro-amber-osm-filter');
      expect(retroAmberOsmPalette.svgFilterId).toBe('retro-amber-osm-filter');
    });
  });

  describe('Retro Vector Style Transformation & Highway / Street Name Separation', () => {
    const createMockDarkMatterStyle = () => ({
      version: 8,
      name: 'Dark Matter',
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#111111' } },
        { id: 'road_pri_fill', type: 'line', paint: { 'line-color': '#222222' } },
        { id: 'poi_stadium', type: 'symbol', paint: { 'text-color': '#515151', 'text-halo-color': '#151515' } },
        { id: 'poi_park', type: 'symbol', paint: { 'text-color': '#515151', 'text-halo-color': '#151515' } },
        { id: 'place_suburbs', type: 'symbol', paint: { 'text-color': '#666666', 'text-halo-color': '#222222' } },
        { id: 'watername_sea', type: 'symbol', paint: { 'text-color': '#3c3c3c', 'text-halo-color': 'rgba(0,0,0,0.7)' } },
        { id: 'watername_lake_line', type: 'symbol', paint: { 'text-color': '#444444', 'text-halo-color': '#181818' } },
        { id: 'waterway_label', type: 'symbol', paint: { 'text-color': 'rgba(164, 164, 164, 1)' } },
        { id: 'roadname_pri', type: 'symbol', paint: { 'text-color': 'rgba(189, 189, 189, 1)', 'text-halo-color': '#111111' } },
        { id: 'roadname_minor', type: 'symbol', paint: { 'text-color': 'rgba(181, 180, 180, 1)', 'text-halo-color': '#111111' } },
        { id: 'roadname_sec', type: 'symbol', paint: { 'text-color': 'rgba(146, 146, 146, 1)', 'text-halo-color': 'rgba(34, 34, 34, 1)' } },
        { id: 'roadname_major', type: 'symbol', paint: { 'text-color': '#383838', 'text-halo-color': '#111111' } }
      ]
    });

    it('transforms roadname_major to highwayLabels (#b0b0b0) in retro-green and retro-amber', () => {
      const mockStyle = createMockDarkMatterStyle();
      const greenTransformed = transformRetroVectorStyle(mockStyle, 'retro-green');
      const amberTransformed = transformRetroVectorStyle(mockStyle, 'retro-amber');

      const greenMajorRoad = greenTransformed.layers.find((l: any) => l.id === 'roadname_major');
      const amberMajorRoad = amberTransformed.layers.find((l: any) => l.id === 'roadname_major');

      expect(greenMajorRoad.paint['text-color']).toBe('#b0b0b0');
      expect(amberMajorRoad.paint['text-color']).toBe('#b0b0b0');
    });

    it('transforms secondary label layers to secondaryLabels (#b0b0b0) for retro-green', () => {
      const mockStyle = createMockDarkMatterStyle();
      const transformed = transformRetroVectorStyle(mockStyle, 'retro-green');

      const poiStadium = transformed.layers.find((l: any) => l.id === 'poi_stadium');
      const poiPark = transformed.layers.find((l: any) => l.id === 'poi_park');
      const placeSuburbs = transformed.layers.find((l: any) => l.id === 'place_suburbs');
      const waternameSea = transformed.layers.find((l: any) => l.id === 'watername_sea');
      const waternameLakeLine = transformed.layers.find((l: any) => l.id === 'watername_lake_line');

      expect(poiStadium.paint['text-color']).toBe('#b0b0b0');
      expect(poiPark.paint['text-color']).toBe('#b0b0b0');
      expect(placeSuburbs.paint['text-color']).toBe('#b0b0b0');
      expect(waternameSea.paint['text-color']).toBe('#b0b0b0');
      expect(waternameLakeLine.paint['text-color']).toBe('#b0b0b0');
    });

    it('strictly preserves ordinary street name layers (roadname_pri, roadname_minor, roadname_sec) unchanged', () => {
      const mockStyle = createMockDarkMatterStyle();
      const transformed = transformRetroVectorStyle(mockStyle, 'retro-green');

      const roadPri = transformed.layers.find((l: any) => l.id === 'roadname_pri');
      const roadMinor = transformed.layers.find((l: any) => l.id === 'roadname_minor');
      const roadSec = transformed.layers.find((l: any) => l.id === 'roadname_sec');

      expect(roadPri.paint['text-color']).toBe('rgba(189, 189, 189, 1)');
      expect(roadMinor.paint['text-color']).toBe('rgba(181, 180, 180, 1)');
      expect(roadSec.paint['text-color']).toBe('rgba(146, 146, 146, 1)');
    });

    it('strictly preserves Modern and Parchment themes without modifying any layer', () => {
      const mockStyle = createMockDarkMatterStyle();
      const modernResult = transformRetroVectorStyle(mockStyle, 'modern');
      expect(modernResult).toBe(mockStyle);

      const parchmentResult = transformRetroVectorStyle(mockStyle, 'parchment');
      expect(parchmentResult).toBe(mockStyle);
    });

    it('handles null or invalid style structures gracefully', () => {
      expect(transformRetroVectorStyle(null, 'retro-green')).toBeNull();
      expect(transformRetroVectorStyle(undefined, 'retro-green')).toBeUndefined();
      expect(transformRetroVectorStyle({} as any, 'retro-green')).toEqual({});
    });
  });

  describe('Runtime Map Helper (applyOSMThemeLayerStyles)', () => {
    it('applies highwayLabels to roadname_major and secondaryLabels to POI layers on a loaded MapLibre map', () => {
      const paintProperties: Record<string, any> = {
        'roadname_major': { 'text-color': '#383838' },
        'poi_stadium': { 'text-color': '#515151' },
        'poi_park': { 'text-color': '#515151' },
        'roadname_pri': { 'text-color': 'rgba(189, 189, 189, 1)' },
        'roadname_minor': { 'text-color': 'rgba(181, 180, 180, 1)' },
        'roadname_sec': { 'text-color': 'rgba(146, 146, 146, 1)' }
      };

      const mockMap = {
        getStyle: vi.fn().mockReturnValue({ version: 8 }),
        isStyleLoaded: vi.fn().mockReturnValue(true),
        getLayer: vi.fn().mockImplementation((id: string) => paintProperties[id] !== undefined),
        getPaintProperty: vi.fn().mockImplementation((layerId: string, prop: string) => paintProperties[layerId]?.[prop]),
        setPaintProperty: vi.fn().mockImplementation((layerId: string, prop: string, val: any) => {
          if (paintProperties[layerId]) {
            paintProperties[layerId][prop] = val;
          }
        })
      };

      applyOSMThemeLayerStyles(mockMap, 'retro-green');

      expect(mockMap.setPaintProperty).toHaveBeenCalledWith('roadname_major', 'text-color', '#b0b0b0');
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith('poi_stadium', 'text-color', '#b0b0b0');
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith('poi_park', 'text-color', '#b0b0b0');
      expect(mockMap.setPaintProperty).not.toHaveBeenCalledWith('roadname_pri', 'text-color', expect.anything());
      expect(mockMap.setPaintProperty).not.toHaveBeenCalledWith('roadname_minor', 'text-color', expect.anything());
      expect(mockMap.setPaintProperty).not.toHaveBeenCalledWith('roadname_sec', 'text-color', expect.anything());
    });

    it('does nothing when skin is modern or parchment', () => {
      const mockMap = {
        getStyle: vi.fn().mockReturnValue({ version: 8 }),
        isStyleLoaded: vi.fn().mockReturnValue(true),
        getLayer: vi.fn().mockReturnValue(true),
        getPaintProperty: vi.fn(),
        setPaintProperty: vi.fn()
      };

      applyOSMThemeLayerStyles(mockMap, 'modern');
      applyOSMThemeLayerStyles(mockMap, 'parchment');

      expect(mockMap.setPaintProperty).not.toHaveBeenCalled();
    });

    it('does nothing when map style is not loaded', () => {
      const mockMap = {
        getStyle: vi.fn().mockReturnValue({ version: 8 }),
        isStyleLoaded: vi.fn().mockReturnValue(false),
        getLayer: vi.fn().mockReturnValue(true),
        getPaintProperty: vi.fn(),
        setPaintProperty: vi.fn()
      };

      applyOSMThemeLayerStyles(mockMap, 'retro-green');
      expect(mockMap.setPaintProperty).not.toHaveBeenCalled();
    });

    it('avoids setting paint property if current property already matches target value', () => {
      const mockMap = {
        getStyle: vi.fn().mockReturnValue({ version: 8 }),
        isStyleLoaded: vi.fn().mockReturnValue(true),
        getLayer: vi.fn().mockReturnValue(true),
        getPaintProperty: vi.fn().mockReturnValue('#b0b0b0'),
        setPaintProperty: vi.fn()
      };

      applyOSMThemeLayerStyles(mockMap, 'retro-green');
      expect(mockMap.setPaintProperty).not.toHaveBeenCalled();
    });
  });

  describe('Retro CRT InfoPanel and Lightbox Image Treatment', () => {
    it('applies restrained, high-contrast monochrome green CRT filter in retro-green', () => {
      const activeFilter = getImageFilter('retro-green', 'active');
      expect(activeFilter).toBeDefined();
      expect(activeFilter).toContain('grayscale(100%)');
      expect(activeFilter).toContain('brightness(0.78)');
      expect(activeFilter).toContain('contrast(1.55)');
      expect(activeFilter).toContain('hue-rotate(88deg)');
      expect(activeFilter).toContain('saturate(180%)');

      const pile1Filter = getImageFilter('retro-green', 'pile1');
      expect(pile1Filter).toBeDefined();
      expect(pile1Filter).toContain('brightness(0.68)');

      const pile2Filter = getImageFilter('retro-green', 'pile2');
      expect(pile2Filter).toBeDefined();
      expect(pile2Filter).toContain('brightness(0.58)');
    });

    it('applies restrained, high-contrast monochrome amber CRT filter in retro-amber', () => {
      const activeFilter = getImageFilter('retro-amber', 'active');
      expect(activeFilter).toBeDefined();
      expect(activeFilter).toContain('grayscale(100%)');
      expect(activeFilter).toContain('brightness(0.80)');
      expect(activeFilter).toContain('contrast(1.50)');
      expect(activeFilter).toContain('hue-rotate(5deg)');
      expect(activeFilter).toContain('saturate(175%)');

      const pile1Filter = getImageFilter('retro-amber', 'pile1');
      expect(pile1Filter).toBeDefined();
      expect(pile1Filter).toContain('brightness(0.70)');

      const pile2Filter = getImageFilter('retro-amber', 'pile2');
      expect(pile2Filter).toBeDefined();
      expect(pile2Filter).toContain('brightness(0.60)');
    });

    it('preserves native full-color image presentation in modern and parchment themes', () => {
      expect(getImageFilter('modern')).toBeUndefined();
      expect(getImageFilter('parchment')).toBeUndefined();
    });
  });

  describe('Modern and Parchment Theme Preservation', () => {
    it('preserves native Modern palette and contrast filter', () => {
      const modern = getOsmPalette('modern');
      expect(modern).toEqual(modernOsmPalette);
      expect(modern.cssFilter).toBe('contrast(1.05)');
    });

    it('preserves native Parchment palette and contrast filter', () => {
      const parchment = getOsmPalette('parchment');
      expect(parchment).toEqual(parchmentOsmPalette);
      expect(parchment.cssFilter).toBe('contrast(1.05)');
    });
  });
});

