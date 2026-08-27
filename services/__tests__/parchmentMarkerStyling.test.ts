import { describe, it, expect } from 'vitest';
import {
  calculateMarkerFontSize,
  calculateMarkerBorderWidth,
  calculateGlobeMarkerZoomScale,
  calculateGlobeMarkerDiameter,
  getThemeMarkerColors,
  getMarkerBoxShadow,
  getWaypointNumberStyle
} from '../../utils/markerStyleUtils';

describe('Parchment Theme & Proportional Marker Styling System', () => {
  describe('1. Parchment Visual Marker Colors & Consistency', () => {
    it('provides identical fill (#8b5a2b) and outline (#f4ead5) for Parchment waypoints', () => {
      const parchmentWp = getThemeMarkerColors('parchment', { isWaypoint: true });
      expect(parchmentWp.fill).toBe('#8b5a2b');
      expect(parchmentWp.outline).toBe('#f4ead5');
    });

    it('provides warm parchment fill and cream outline for regular markers and deep red for favorites', () => {
      const regular = getThemeMarkerColors('parchment', { isWaypoint: false });
      expect(regular.fill).toBe('#8b5a2b');
      expect(regular.outline).toBe('#f4ead5');

      const favorite = getThemeMarkerColors('parchment', { isFavorite: true });
      expect(favorite.fill).toBe('#8b0000');
      expect(favorite.outline).toBe('#f4ead5');
    });

    it('preserves other theme marker colors with black waypoint fill for Retro Green and Retro Amber', () => {
      const modernWp = getThemeMarkerColors('modern', { isWaypoint: true });
      expect(modernWp.fill).toBe('#00e5ff');
      expect(modernWp.outline).toBe('#00e5ff'); // Modern inner ring matches center fill

      const modernRegular = getThemeMarkerColors('modern', { isWaypoint: false });
      expect(modernRegular.fill).toBe('#ff0000');
      expect(modernRegular.outline).toBe('#ff0000'); // Modern inner ring matches center fill

      const modernFavorite = getThemeMarkerColors('modern', { isFavorite: true });
      expect(modernFavorite.fill).toBe('#d946ef');
      expect(modernFavorite.outline).toBe('#d946ef');

      const modernAnchor = getThemeMarkerColors('modern', { isAnchor: true });
      expect(modernAnchor.fill).toBe('#3b82f6');
      expect(modernAnchor.outline).toBe('#3b82f6');

      const greenWp = getThemeMarkerColors('retro-green', { isWaypoint: true });
      expect(greenWp.fill).toBe('#000000');
      expect(greenWp.outline).toBe('#4ade80');

      const greenRegular = getThemeMarkerColors('retro-green', { isWaypoint: false });
      expect(greenRegular.fill).toBe('#a3e635');
      expect(greenRegular.outline).toBe('#4ade80');

      const amberWp = getThemeMarkerColors('retro-amber', { isWaypoint: true });
      expect(amberWp.fill).toBe('#000000');
      expect(amberWp.outline).toBe('#fbbf24');

      const amberRegular = getThemeMarkerColors('retro-amber', { isWaypoint: false });
      expect(amberRegular.fill).toBe('#fcd34d');
      expect(amberRegular.outline).toBe('#fbbf24');
    });

    describe('Modern Theme Marker Ring Layer Invariants', () => {
      it('1. MODERN marker outer ring remains white via box-shadow', () => {
        const unselectedShadow = getMarkerBoxShadow('modern', false);
        expect(unselectedShadow).toBe('0 1px 4px rgba(0, 0, 0, 0.4)');

        const selectedShadow = getMarkerBoxShadow('modern', true);
        expect(selectedShadow).toContain('0 0 0 3px rgba(255, 255, 255, 0.85)');
      });

      it('2. MODERN marker inner ring uses the center-fill color', () => {
        const defaultMarker = getThemeMarkerColors('modern', { isWaypoint: false });
        expect(defaultMarker.outline).toBe(defaultMarker.fill);

        const waypointMarker = getThemeMarkerColors('modern', { isWaypoint: true });
        expect(waypointMarker.outline).toBe(waypointMarker.fill);

        const customMarker = getThemeMarkerColors('modern', { customColor: '#00ffff' });
        expect(customMarker.outline).toBe('#00ffff');
        expect(customMarker.fill).toBe('#00ffff');
      });

      it('3. MODERN marker center fill remains unchanged', () => {
        expect(getThemeMarkerColors('modern', { isWaypoint: false }).fill).toBe('#ff0000');
        expect(getThemeMarkerColors('modern', { isWaypoint: true }).fill).toBe('#00e5ff');
        expect(getThemeMarkerColors('modern', { isFavorite: true }).fill).toBe('#d946ef');
        expect(getThemeMarkerColors('modern', { isAnchor: true }).fill).toBe('#3b82f6');
      });

      it('4. CRT Green marker colors remain unchanged', () => {
        const regular = getThemeMarkerColors('retro-green', { isWaypoint: false });
        expect(regular.fill).toBe('#a3e635');
        expect(regular.outline).toBe('#4ade80');

        const waypoint = getThemeMarkerColors('retro-green', { isWaypoint: true });
        expect(waypoint.fill).toBe('#000000');
        expect(waypoint.outline).toBe('#4ade80');
      });

      it('5. CRT Amber marker colors remain unchanged', () => {
        const regular = getThemeMarkerColors('retro-amber', { isWaypoint: false });
        expect(regular.fill).toBe('#fcd34d');
        expect(regular.outline).toBe('#fbbf24');

        const waypoint = getThemeMarkerColors('retro-amber', { isWaypoint: true });
        expect(waypoint.fill).toBe('#000000');
        expect(waypoint.outline).toBe('#fbbf24');
      });

      it('6. Parchment marker colors remain unchanged', () => {
        const regular = getThemeMarkerColors('parchment', { isWaypoint: false });
        expect(regular.fill).toBe('#8b5a2b');
        expect(regular.outline).toBe('#f4ead5');

        const waypoint = getThemeMarkerColors('parchment', { isWaypoint: true });
        expect(waypoint.fill).toBe('#8b5a2b');
        expect(waypoint.outline).toBe('#f4ead5');

        const favorite = getThemeMarkerColors('parchment', { isFavorite: true });
        expect(favorite.fill).toBe('#8b0000');
        expect(favorite.outline).toBe('#f4ead5');
      });
    });
  });

  describe('2. Waypoint Number Typography & Shadow', () => {
    it('uses crisp white bold text (#ffffff) for Parchment waypoint numbers matching OSM', () => {
      const style = getWaypointNumberStyle('parchment');
      expect(style.color).toBe('#ffffff');
      expect(style.fontWeight).toBe('bold');
      expect(style.lineHeight).toBe(1);
    });

    it('uses crisp white bold text (#ffffff) across MODERN, RETRO GREEN, RETRO AMBER, and PARCHMENT', () => {
      const modernStyle = getWaypointNumberStyle('modern');
      expect(modernStyle.color).toBe('#ffffff');
      expect(modernStyle.fontWeight).toBe('bold');

      const greenStyle = getWaypointNumberStyle('retro-green');
      expect(greenStyle.color).toBe('#ffffff');
      expect(greenStyle.fontWeight).toBe('bold');

      const amberStyle = getWaypointNumberStyle('retro-amber');
      expect(amberStyle.color).toBe('#ffffff');
      expect(amberStyle.fontWeight).toBe('bold');
    });

    it('provides subtle white separation and soft drop shadow for Parchment', () => {
      const unselectedShadow = getMarkerBoxShadow('parchment', false);
      expect(unselectedShadow).toContain('0 0 0 1px rgba(255, 255, 255, 0.6)');
      expect(unselectedShadow).toContain('0 1px 4px rgba(0, 0, 0, 0.4)');

      const selectedShadow = getMarkerBoxShadow('parchment', true);
      expect(selectedShadow).toContain('0 0 0 1.5px rgba(255, 255, 255, 0.85)');
      expect(selectedShadow).toContain('0 2px 6px rgba(0, 0, 0, 0.5)');

      // Modern skin retains standard 3px ring on selection
      const modernSelectedShadow = getMarkerBoxShadow('modern', true);
      expect(modernSelectedShadow).toContain('0 0 0 3px rgba(255, 255, 255, 0.85)');
    });
  });

  describe('3. Waypoint Number Proportional Scaling Logic', () => {
    it('scales single-digit waypoint numbers proportionally with dynamic marker diameter', () => {
      // Standard small OSM pin size (16px) -> ~9.3px
      const size16 = calculateMarkerFontSize(16, false);
      expect(size16).toBeGreaterThanOrEqual(9.0);
      expect(size16).toBeLessThanOrEqual(10.0);

      // Selected OSM pin size (22px) -> ~12.8px
      const size22 = calculateMarkerFontSize(22, false);
      expect(size22).toBeGreaterThanOrEqual(12.0);
      expect(size22).toBeLessThanOrEqual(13.5);

      // Dynamically scaled globe marker (e.g. 26px base diameter) -> ~15.1px
      const size26 = calculateMarkerFontSize(26, false);
      expect(size26).toBeGreaterThanOrEqual(14.5);
      expect(size26).toBeLessThanOrEqual(16.0);
    });

    it('scales multi-digit waypoint numbers (10+) appropriately to avoid circle clipping', () => {
      // Multi-digit at 16px pin -> ~7.0px
      const size16Multi = calculateMarkerFontSize(16, true);
      expect(size16Multi).toBeGreaterThanOrEqual(7.0);
      expect(size16Multi).toBeLessThanOrEqual(7.5);

      // Multi-digit at 26px -> ~11.4px
      const size26Multi = calculateMarkerFontSize(26, true);
      expect(size26Multi).toBeGreaterThanOrEqual(11.0);
      expect(size26Multi).toBeLessThanOrEqual(12.0);
    });

    it('scales border thickness proportionally and keeps Parchment perimeter thin (~3px at 49.4px diameter)', () => {
      // Parchment: At 49.4px diameter, target ~3px border
      const parchmentBorder49 = calculateMarkerBorderWidth(49.4, 'parchment');
      expect(parchmentBorder49).toBeCloseTo(3.0, 1);

      // Modern: At 49.4px diameter, standard 12% stroke -> ~5.9px
      const modernBorder49 = calculateMarkerBorderWidth(49.4, 'modern');
      expect(modernBorder49).toBeCloseTo(5.9, 1);
    });
  });

  describe('4. Zoom-Aware Globe Marker Scaling across All Themes', () => {
    it('scales marker factor continuously between 0.72 (zoomed in) and 1.0 (zoomed out)', () => {
      // Zoomed all the way in (at OSM threshold 1.45)
      const scaleZoomedIn = calculateGlobeMarkerZoomScale(1.45);
      expect(scaleZoomedIn).toBe(0.72);

      // Below threshold (safety clamping)
      expect(calculateGlobeMarkerZoomScale(1.0)).toBe(0.72);

      // Zoomed out (overview distance >= 5.0)
      const scaleZoomedOut = calculateGlobeMarkerZoomScale(5.0);
      expect(scaleZoomedOut).toBe(1.0);

      // Further out (safety clamping)
      expect(calculateGlobeMarkerZoomScale(8.0)).toBe(1.0);

      // Intermediate distance (e.g. distance = 3.225 is halfway between 1.45 and 5.0)
      const midScale = calculateGlobeMarkerZoomScale(3.225);
      expect(midScale).toBeCloseTo(0.86, 2);
    });

    it('reduces marker diameter and font size when zooming into the globe while respecting minimum readable thresholds', () => {
      // Base diameter 26px - zoomed in clamp reaches MIN_GLOBE_MARKER_DIAMETER (22px)
      const diameterZoomedIn = calculateGlobeMarkerDiameter(1.45, 26);
      expect(diameterZoomedIn).toBe(22.0); // clamped at 22px minimum

      // Intermediate zoom distance (e.g. 4.0)
      const diameterMid = calculateGlobeMarkerDiameter(4.0, 26);
      expect(diameterMid).toBeGreaterThanOrEqual(22.0);
      expect(diameterMid).toBeLessThan(26.0);

      // Zoomed out (overview distance 5.0)
      const diameterZoomedOut = calculateGlobeMarkerDiameter(5.0, 26);
      expect(diameterZoomedOut).toBe(26.0); // 26 * 1.0

      // Verify font size scales down proportionally with diameter while respecting legibility thresholds
      const fontZoomedIn = calculateMarkerFontSize(diameterZoomedIn, false);
      const fontZoomedOut = calculateMarkerFontSize(diameterZoomedOut, false);
      expect(fontZoomedIn).toBeLessThan(fontZoomedOut);
      expect(fontZoomedIn).toBe(12.8); // 22 * 0.58
      expect(fontZoomedOut).toBe(15.1); // 26 * 0.58

      // Multi-digit at minimum diameter
      const fontMultiDigitZoomedIn = calculateMarkerFontSize(diameterZoomedIn, true);
      expect(fontMultiDigitZoomedIn).toBe(9.7); // 22 * 0.44 = 9.68 -> 9.7px

      // Verify border scales down proportionally
      const borderZoomedIn = calculateMarkerBorderWidth(diameterZoomedIn, 'modern');
      const borderZoomedOut = calculateMarkerBorderWidth(diameterZoomedOut, 'modern');
      expect(borderZoomedIn).toBeLessThan(borderZoomedOut);
      expect(borderZoomedIn).toBe(2.6); // 22 * 0.12
      expect(borderZoomedOut).toBe(3.1); // 26 * 0.12
    });
  });
});
