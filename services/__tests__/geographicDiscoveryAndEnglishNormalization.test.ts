import { describe, it, expect } from 'vitest';
import { getGeographicHierarchy } from '../geographic/classification';
import { applySelection } from '../geographic/selection';
import { normalizeEnglishDisplayName } from '../../utils/englishNameNormalization';
import { classifyGeographicEntityWithEvidence } from '../classifierService';
import { Candidate } from '../../types';

describe('Geographic Discovery: Major Features, Non-Geographic Rejection, and English Normalization', () => {
  describe('1. Rejection of Non-Geographic Events, Conflicts, and Topics', () => {
    it('strictly rejects Lahij insurgency even when provider declared it city', async () => {
      const candidate: Candidate = {
        id: 'wiki-lahij-insurgency',
        name: 'Lahij insurgency',
        coordinates: { lat: 12.5777, lng: 43.8016 },
        type: 'city',
        providers: ['RegionalSearchProvider', 'Wikipedia'],
        rawProviders: {},
        pipelineStatus: 'collected'
      };

      const result = await getGeographicHierarchy(candidate);

      expect(candidate.rankingClass).toBe('REJECTED');
      expect(candidate.rankingClass).not.toBe('POPULATED_PLACE');
      expect(candidate.eligibleForDefaultDiscovery).toBe(false);
      expect(candidate.eligibility).toBe('ineligible');
      expect(candidate.classificationReason).toMatch(/event\/conflict\/topic/i);
      expect(result.discoveryCategory).toBe('OBSCURE_LOCAL_FEATURE');
    });

    it('rejects various conflict, election, war, and political event topics', async () => {
      const eventCandidates = [
        'Battle of Aden',
        'Yemeni Civil War',
        'Siege of Minab',
        '2024 General Election',
        'Arab Spring uprising',
        'Treaty of Versailles'
      ];

      for (const name of eventCandidates) {
        const candidate: Candidate = {
          id: `test-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          name,
          coordinates: { lat: 0, lng: 0 },
          type: 'city',
          providers: ['TestProvider'],
          rawProviders: {},
          pipelineStatus: 'collected'
        };

        await getGeographicHierarchy(candidate);

        expect(candidate.rankingClass).toBe('REJECTED');
        expect(candidate.eligibleForDefaultDiscovery).toBe(false);
      }
    });

    it('returns authoritative rejection in classifyGeographicEntityWithEvidence', async () => {
      const res = await classifyGeographicEntityWithEvidence(
        'Lahij insurgency',
        { lat: 12.5777, lng: 43.8016 },
        ['city'],
        { type: 'city' }
      );

      expect(res.confidence).toBe('authoritative');
      expect(res.evidence).toMatch(/event\/conflict\/topic/i);
    });
  });

  describe('2. Major Geographic Features Prominence & Balanced Selection', () => {
    it('classifies Strait of Hormuz as Tier 1 Tier A GEOGRAPHIC_FEATURE', async () => {
      const candidate: Candidate = {
        id: 'strait-hormuz',
        name: 'Strait of Hormuz',
        coordinates: { lat: 26.3731, lng: 57.1055 },
        type: 'water_body',
        providers: ['RegionalSearchProvider', 'Wikipedia'],
        rawProviders: {},
        pipelineStatus: 'collected'
      };

      const result = await getGeographicHierarchy(candidate);

      expect(candidate.rankingClass).toBe('GEOGRAPHIC_FEATURE');
      expect(result.tier).toBe(1);
      expect(result.prominenceTier).toBe('Tier A');
      expect(candidate.eligibleForDefaultDiscovery).toBe(true);
    });

    it('does not allow minor settlements to completely displace major geographic features', () => {
      const candidates: Candidate[] = [
        {
          id: '1',
          name: 'Strait of Hormuz',
          coordinates: { lat: 26.37, lng: 57.10 },
          type: 'water_body',
          rankingClass: 'GEOGRAPHIC_FEATURE',
          entityClass: 'geographic_feature',
          tier: 1,
          importanceScore: 95,
          eligibleForDefaultDiscovery: true,
          providers: ['Test'],
          rawProviders: {},
          pipelineStatus: 'scored'
        },
        {
          id: '2',
          name: 'Sirik',
          coordinates: { lat: 26.30, lng: 57.12 },
          type: 'town',
          rankingClass: 'POPULATED_PLACE',
          entityClass: 'settlement',
          tier: 2,
          importanceScore: 80,
          eligibleForDefaultDiscovery: true,
          providers: ['Test'],
          rawProviders: {},
          pipelineStatus: 'scored'
        },
        {
          id: '3',
          name: 'Sarzeh',
          coordinates: { lat: 26.32, lng: 57.15 },
          type: 'village',
          rankingClass: 'POPULATED_PLACE',
          entityClass: 'settlement',
          tier: 3,
          importanceScore: 70,
          eligibleForDefaultDiscovery: true,
          providers: ['Test'],
          rawProviders: {},
          pipelineStatus: 'scored'
        },
        {
          id: '4',
          name: 'Minab',
          coordinates: { lat: 26.40, lng: 57.20 },
          type: 'town',
          rankingClass: 'POPULATED_PLACE',
          entityClass: 'settlement',
          tier: 2,
          importanceScore: 75,
          eligibleForDefaultDiscovery: true,
          providers: ['Test'],
          rawProviders: {},
          pipelineStatus: 'scored'
        },
        {
          id: '5',
          name: 'Garandu',
          coordinates: { lat: 26.42, lng: 57.22 },
          type: 'village',
          rankingClass: 'POPULATED_PLACE',
          entityClass: 'settlement',
          tier: 3,
          importanceScore: 65,
          eligibleForDefaultDiscovery: true,
          providers: ['Test'],
          rawProviders: {},
          pipelineStatus: 'scored'
        }
      ];

      const selected = applySelection(candidates, 6);

      // Strait of Hormuz must be included alongside settlements
      expect(selected.length).toBeGreaterThanOrEqual(2);
      expect(selected.some(c => c.name === 'Strait of Hormuz')).toBe(true);
      expect(selected.some(c => c.name === 'Sirik' || c.name === 'Minab')).toBe(true);
    });
  });

  describe('3. English Display Name Normalization', () => {
    it('normalizes Persian, Arabic, and Urdu geographic names to English', () => {
      expect(normalizeEnglishDisplayName('میناب')).toBe('Minab');
      expect(normalizeEnglishDisplayName('صنعاء')).toBe('Sanaa');
      expect(normalizeEnglishDisplayName('لحج')).toBe('Lahij');
      expect(normalizeEnglishDisplayName('بندر عباس')).toBe('Bandar Abbas');
      expect(normalizeEnglishDisplayName('سبی')).toBe('Sibi');
      expect(normalizeEnglishDisplayName('کوئٹہ')).toBe('Quetta');
      expect(normalizeEnglishDisplayName('پشاور')).toBe('Peshawar');
      expect(normalizeEnglishDisplayName('لاہور')).toBe('Lahore');
      expect(normalizeEnglishDisplayName('کراچی')).toBe('Karachi');
      expect(normalizeEnglishDisplayName('کابل')).toBe('Kabul');
      expect(normalizeEnglishDisplayName('ہرات')).toBe('Herat');
    });

    it('extracts English name from provider metadata if available', () => {
      const rawProviders = {
        Overpass: {
          tags: {
            name: 'میناب',
            'name:en': 'Minab'
          }
        }
      };

      expect(normalizeEnglishDisplayName('میناب', rawProviders)).toBe('Minab');
    });

    it('extracts clean city name from Nominatim display_name and address without administrative suffixes', () => {
      const rawProviders = {
        Nominatim: {
          display_name: 'سبی, Sibi District, Balochistan, Pakistan'
        }
      };

      expect(normalizeEnglishDisplayName('سبی', rawProviders)).toBe('Sibi');
    });

    it('preserves canonical name while setting displayName on candidate', async () => {
      const candidate: Candidate = {
        id: 'ov-sibi',
        name: 'سبی',
        coordinates: { lat: 29.55, lng: 67.88 },
        type: 'town',
        providers: ['Overpass'],
        rawProviders: {
          Overpass: { tags: { name: 'سبی', 'name:en': 'Sibi' } }
        },
        pipelineStatus: 'collected'
      };

      await getGeographicHierarchy(candidate);

      expect(candidate.name).toBe('سبی');
      expect(candidate.displayName).toBe('Sibi');
    });
  });
});
