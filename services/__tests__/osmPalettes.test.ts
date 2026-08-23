import { describe, it, expect } from 'vitest';
import {
  getOsmPalette,
  getImageFilter,
  retroGreenOsmPalette,
  retroAmberOsmPalette,
  modernOsmPalette,
  parchmentOsmPalette
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

    it('includes valid CSS and SVG filter references', () => {
      expect(retroAmberOsmPalette.cssFilter).toContain('retro-amber-osm-filter');
      expect(retroAmberOsmPalette.svgFilterId).toBe('retro-amber-osm-filter');
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
