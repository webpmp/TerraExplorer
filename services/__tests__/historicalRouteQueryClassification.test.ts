import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeQueryScaffolding, detectHistoricalRouteEvent } from '../queryNormalizer';
import { routeIntentAndExtractEntity } from '../geminiService';
import { runSearchPipeline } from '../pipeline';
import * as geographicResolver from '../geographic/geographicResolver';

describe('Historical Route Query Classification and Entity Normalization', () => {
  beforeEach(() => {
    vi.spyOn(geographicResolver, 'reverseGeocode').mockImplementation(async (lat: number, lng: number) => {
      return {
        country: 'United States',
        state: 'Tennessee',
        displayName: 'Mock Location'
      };
    });
  });

  const queryVariants = [
    'where was the trail of tears take place?',
    'where did the trail of tears take place?',
    'where was the trail of tears?',
    'where did the trail of tears happen?',
    'show me the trail of tears',
    'trail of tears'
  ];

  describe('normalizeQueryScaffolding', () => {
    it('strips interrogative scaffolding to isolate the core entity candidate', () => {
      expect(normalizeQueryScaffolding('where was the trail of tears take place?').toLowerCase()).toBe('trail of tears');
      expect(normalizeQueryScaffolding('where did the trail of tears take place?').toLowerCase()).toBe('trail of tears');
      expect(normalizeQueryScaffolding('where was the trail of tears?').toLowerCase()).toBe('trail of tears');
      expect(normalizeQueryScaffolding('where did the trail of tears happen?').toLowerCase()).toBe('trail of tears');
      expect(normalizeQueryScaffolding('show me the trail of tears').toLowerCase()).toBe('trail of tears');
      expect(normalizeQueryScaffolding('trail of tears').toLowerCase()).toBe('trail of tears');
    });
  });

  describe('detectHistoricalRouteEvent', () => {
    it('detects Trail of Tears variants as authoritative historical route events', () => {
      for (const query of queryVariants) {
        const detection = detectHistoricalRouteEvent(query);
        expect(detection.isHistoricalRouteEvent).toBe(true);
        expect(detection.canonicalEntity).toBe('Trail of Tears');
        expect(detection.registryEventTitle).toBe('Trail of Tears');
        expect(detection.routeGroupsCount).toBe(4);
        expect(detection.routeIntent).toBe('MULTI_ROUTE_EVENT');
      }
    });
  });

  describe('routeIntentAndExtractEntity', () => {
    it('classifies Trail of Tears query variants into route intent with canonical entity', () => {
      for (const query of queryVariants) {
        const extracted = routeIntentAndExtractEntity(query);
        expect(extracted.intent).toBe('route');
        expect(extracted.entity).toBe('Trail of Tears');
        expect(extracted.resolutionMode).toBe('MULTI_LOCATION_EXPLORATION');
      }
    });
  });

  describe('runSearchPipeline - Trail of Tears End-to-End Resolution', () => {
    it('resolves all query variants to full multi-route topology with 4 route groups and 13 waypoints', async () => {
      for (const query of queryVariants) {
        const result = await runSearchPipeline({ rawQuery: query });
        expect(result.mode).toBe('route');
        expect(result.isValid).toBe(true);
        expect(result.waypoints).toBeDefined();
        expect(result.waypoints!.length).toBe(13);

        const groupIds = Array.from(new Set(result.waypoints!.map(w => w.routeGroupId || (w as any).groupId))).filter(Boolean);
        expect(groupIds.length).toBe(4);
        expect(groupIds).toContain('northern-route');
        expect(groupIds).toContain('benge-route');
        expect(groupIds).toContain('bell-route');
        expect(groupIds).toContain('water-route');
      }
    });
  });

  describe('Preserve normal behavior for genuine single-location questions', () => {
    it('maintains single-location intent and candidate for Mount Everest', () => {
      const extracted = routeIntentAndExtractEntity('where is Mount Everest?');
      expect(extracted.intent).toBe('NATURAL_LOCATION');
      expect(extracted.entity.toLowerCase()).toContain('mount everest');
    });

    it('maintains single-location intent and candidate for Yellowstone National Park', () => {
      const extracted = routeIntentAndExtractEntity('where is Yellowstone National Park?');
      expect(extracted.intent).toBe('NATURAL_LOCATION');
      expect(extracted.entity.toLowerCase()).toContain('yellowstone national park');
    });

    it('maintains historical event single-point / discovery extraction for Battle of Gettysburg', () => {
      const extracted = routeIntentAndExtractEntity('where was the Battle of Gettysburg?');
      expect(extracted.entity.toLowerCase()).toContain('battle of gettysburg');
    });
  });
});
