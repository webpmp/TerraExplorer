import { describe, it, expect } from 'vitest';
import { classifyEntityHierarchy } from '../geographic/classification';
import { classifyGeographicEntityWithEvidence } from '../classifierService';
import { Candidate } from '../../types';

describe('Populated-Place Classification and Protected Feature Protection', () => {
  describe('1. Protected Reserves & Geographic Features Classification', () => {
    it('does not classify Ambohijanahary Special Reserve as a city or POPULATED_PLACE even if provider labelled it city', async () => {
      const candidate: Candidate = {
        id: 'ov-12345',
        name: 'Ambohijanahary Special Reserve',
        coordinates: { lat: -19.1777, lng: 46.2117 },
        type: 'city',
        providers: ['Overpass'],
        rawProviders: {},
        pipelineStatus: 'collected'
      };

      const result = await classifyEntityHierarchy(candidate);

      expect(candidate.rankingClass).toBe('GEOGRAPHIC_FEATURE');
      expect(candidate.rankingClass).not.toBe('POPULATED_PLACE');
      expect(candidate.entityClass).toBe('geographic_feature');
      expect(candidate.classificationReason).toMatch(/protected reserve or geographic feature/i);
    });

    it('rejects protected areas, national reserves, wildlife reserves, grasslands, and parks from becoming POPULATED_PLACE', async () => {
      const testCases = [
        { name: 'Ambohijanahary Special Reserve', providerType: 'city' },
        { name: 'Analamazoatra Special Reserve', providerType: 'town' },
        { name: 'Maasai Mara National Reserve', providerType: 'village' },
        { name: 'Sinharaja Forest Reserve', providerType: 'city' },
        { name: 'Selous Game Reserve', providerType: 'town' },
        { name: 'Rita Blanca National Grassland', providerType: 'city' },
        { name: 'Paynes Prairie Preserve State Park', providerType: 'city' },
        { name: 'Bob Marshall Wilderness', providerType: 'town' },
        { name: 'Okefenokee National Wildlife Refuge', providerType: 'city' },
        { name: 'Carrizo Creek', providerType: 'city' },
        { name: 'Lake Tanglewood', providerType: 'town' },
        { name: 'Mount Rainier', providerType: 'city' },
        { name: 'Black Forest', providerType: 'city' }
      ];

      for (const tc of testCases) {
        const candidate: Candidate = {
          id: `test-${tc.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          name: tc.name,
          coordinates: { lat: 0, lng: 0 },
          type: tc.providerType,
          providers: ['TestProvider'],
          rawProviders: {},
          pipelineStatus: 'collected'
        };

        await classifyEntityHierarchy(candidate);

        expect(candidate.rankingClass).toBe('GEOGRAPHIC_FEATURE');
        expect(candidate.rankingClass).not.toBe('POPULATED_PLACE');
      }
    });
  });

  describe('2. Legitimate Populated Places Classification', () => {
    it('accurately verifies legitimate cities, towns, and villages as POPULATED_PLACE', async () => {
      const settlements = [
        { name: 'Tsiroanomandidy', type: 'town' },
        { name: 'Antananarivo', type: 'city' },
        { name: 'Kissimmee', type: 'city' },
        { name: 'Washtucna', type: 'town' },
        { name: 'Al Hamra', type: 'village' }
      ];

      for (const s of settlements) {
        const candidate: Candidate = {
          id: `test-${s.name.toLowerCase()}`,
          name: s.name,
          coordinates: { lat: 0, lng: 0 },
          type: s.type,
          providers: ['Nominatim'],
          rawProviders: {},
          pipelineStatus: 'collected'
        };

        await classifyEntityHierarchy(candidate);

        expect(candidate.rankingClass).toBe('POPULATED_PLACE');
        expect(candidate.entityClass).toBe('settlement');
      }
    });
  });

  describe('3. classifyGeographicEntityWithEvidence Evidence Integrity', () => {
    it('returns authoritative evidence when rejecting false populated place', async () => {
      const res = await classifyGeographicEntityWithEvidence(
        'Ambohijanahary Special Reserve',
        { lat: -19.1777, lng: 46.2117 },
        ['city', 'place'],
        { type: 'city' }
      );

      expect(res.entityType).toBe('natural_feature');
      expect(res.confidence).toBe('authoritative');
      expect(res.evidence).toMatch(/protected reserve/i);
    });
  });
});
