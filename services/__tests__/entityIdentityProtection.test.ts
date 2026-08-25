import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSearchPipeline, ResolutionStage, IntentStage } from '../pipeline';
import { validateEntityIdentity, extractDistinctiveEntityTokens } from '../geographic/entityIdentityValidator';
import * as geminiService from '../geminiService';

describe('Entity Identity Protection Suite (Coordinate Recovery)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Token extraction and entity identity matching logic', () => {
    it('extracts distinctive tokens while filtering stopwords and category terms', () => {
      const tokens1 = extractDistinctiveEntityTokens('Shipwreck Of The El Faro');
      expect(tokens1).toContain('el');
      expect(tokens1).toContain('faro');
      expect(tokens1).not.toContain('shipwreck');
      expect(tokens1).not.toContain('the');
      expect(tokens1).not.toContain('of');

      const tokens2 = extractDistinctiveEntityTokens('Site No. 1, USS Eldorado');
      expect(tokens2).toContain('eldorado');
      expect(tokens2).not.toContain('site');
      expect(tokens2).not.toContain('no');
      expect(tokens2).not.toContain('1');
    });

    it('accepts valid entity variants (SS El Faro, El Faro shipwreck)', () => {
      const check1 = validateEntityIdentity('Shipwreck Of The El Faro', 'SS El Faro');
      expect(check1.matches).toBe(true);
      expect(check1.rejectionReason).toBe('NONE');

      const check2 = validateEntityIdentity('El Faro', 'El Faro wreck');
      expect(check2.matches).toBe(true);
      expect(check2.rejectionReason).toBe('NONE');

      const check3 = validateEntityIdentity('El Faro', 'El Faro shipwreck');
      expect(check3.matches).toBe(true);
      expect(check3.rejectionReason).toBe('NONE');
    });

    it('rejects unrelated entities (USS Eldorado, another shipwreck in Haiti)', () => {
      const check1 = validateEntityIdentity('El Faro', 'USS Eldorado');
      expect(check1.matches).toBe(false);
      expect(check1.rejectionReason).toBe('ENTITY_IDENTITY_MISMATCH');

      const check2 = validateEntityIdentity('Shipwreck Of The El Faro', 'Site No. 1, USS Eldorado');
      expect(check2.matches).toBe(false);
      expect(check2.rejectionReason).toBe('ENTITY_IDENTITY_MISMATCH');

      const check3 = validateEntityIdentity('El Faro', 'another shipwreck in Haiti');
      expect(check3.matches).toBe(false);
      expect(check3.rejectionReason).toBe('ENTITY_IDENTITY_MISMATCH');
    });
  });

  describe('Pipeline regression test cases', () => {
    it('1. "where was shipwreck of the el faro" must NOT resolve to Site No. 1, USS Eldorado and must preserve El Faro identity', async () => {
      // Mock resolver returning substituted entity "Site No. 1, USS Eldorado"
      vi.spyOn(geminiService, 'resolveLocationQuery').mockResolvedValue({
        error: 'NO_GEOGRAPHIC_DATA',
        locationInfo: {
          name: 'Site No. 1, USS Eldorado',
          entityType: 'shipwreck_site',
          coordinates: { lat: 19.4333, lng: -72.4714 }
        }
      } as any);

      // Mock AI recovery returning null / rejected
      vi.spyOn(geminiService, 'recoverCoordinatesFromAi').mockResolvedValue(null);

      const res = await runSearchPipeline({ rawQuery: 'where was shipwreck of the el faro' });

      // Must not resolve to USS Eldorado
      expect(res.entity).toBeUndefined();
      expect(res.finalData?.canonicalName).not.toContain('Eldorado');
      expect(res.finalData?.name).not.toContain('Eldorado');

      // Must preserve El Faro identity
      expect(res.finalData?.canonicalName || res.finalData?.name).toContain('El Faro');
      // Unresolved status
      expect(res.isValid).toBe(false);
      expect(res.error).toBe('NO_GEOGRAPHIC_DATA');
    });

    it('2. Requested El Faro -> AI recovery returns USS Eldorado -> recovery must be rejected', async () => {
      // AI returns USS Eldorado coordinates
      const check = validateEntityIdentity('El Faro', 'USS Eldorado');
      expect(check.matches).toBe(false);
      expect(check.rejectionReason).toBe('ENTITY_IDENTITY_MISMATCH');
    });

    it('3. Requested El Faro -> AI recovery returns valid coordinates for unrelated shipwreck -> recovery must be rejected', async () => {
      vi.spyOn(geminiService, 'resolveLocationQuery').mockResolvedValue({
        error: 'NO_GEOGRAPHIC_DATA',
        locationInfo: { name: 'El Faro' }
      } as any);

      // AI recovery generates coordinates for unrelated wreck in Haiti
      const entityResult = IntentStage({ rawQuery: 'where was shipwreck of the el faro' });
      
      const check = validateEntityIdentity(entityResult.entity, 'Wreck of the USS Memphis');
      expect(check.matches).toBe(false);
      expect(check.rejectionReason).toBe('ENTITY_IDENTITY_MISMATCH');
    });

    it('4. Requested El Faro -> AI recovery returns SS El Faro with matching coordinates -> recovery may be accepted', async () => {
      vi.spyOn(geminiService, 'resolveLocationQuery').mockResolvedValue({
        error: 'NO_GEOGRAPHIC_DATA',
        locationInfo: {
          name: 'El Faro',
          entityType: 'shipwreck',
          description: 'SS El Faro was a United States-flagged combination roll-on/roll-off and container ship that sank in the Atlantic Ocean during Hurricane Joaquin in October 2015.'
        }
      } as any);

      vi.spyOn(geminiService, 'recoverCoordinatesFromAi').mockResolvedValue({
        lat: 23.8644,
        lng: -74.4989,
        source: 'ai_recovery'
      });

      const entityResult = IntentStage({ rawQuery: 'where was the el faro' });
      const stageRes = await ResolutionStage(entityResult);

      expect(stageRes.isValid).toBe(true);
      expect(stageRes.entity?.subject.identity.canonicalName).toContain('El Faro');
      expect(stageRes.entity?.subject.primaryLocation.location.coordinates.lat).toBeCloseTo(23.8644, 3);
      expect(stageRes.entity?.subject.primaryLocation.location.coordinates.lng).toBeCloseTo(-74.4989, 3);
    });

    it('5. Requested entity has no authoritative coordinates and AI cannot establish a matching entity -> Result remains unresolved without substituting another location', async () => {
      vi.spyOn(geminiService, 'resolveLocationQuery').mockResolvedValue({
        error: 'NO_GEOGRAPHIC_DATA',
        locationInfo: { name: 'Lost Unknown Submarine' }
      } as any);

      vi.spyOn(geminiService, 'recoverCoordinatesFromAi').mockResolvedValue(null);

      const res = await runSearchPipeline({ rawQuery: 'where is the lost unknown submarine' });
      expect(res.isValid).toBe(false);
      expect(res.entity).toBeUndefined();
      expect(res.finalData?.canonicalName).toContain('Lost Unknown Submarine');
      expect(res.error).toBe('NO_GEOGRAPHIC_DATA');
    });

    it('6. Existing successful coordinate-recovery cases continue to work', async () => {
      vi.spyOn(geminiService, 'resolveLocationQuery').mockResolvedValue({
        error: 'LOCATION_SYSTEM_UNAVAILABLE',
        locationInfo: {
          name: 'Dead Sea',
          entityType: 'natural_feature',
          description: 'A salt lake bordered by Jordan to the east and Israel and the West Bank to the west.'
        }
      } as any);

      vi.spyOn(geminiService, 'recoverCoordinatesFromAi').mockResolvedValue({
        lat: 31.5590,
        lng: 35.4732,
        source: 'ai_recovery'
      });

      const res = await runSearchPipeline({ rawQuery: 'Show me the Dead Sea' });
      expect(res.isValid).toBe(true);
      expect(res.entity?.subject.identity.canonicalName).toBe('Dead Sea');
      expect(res.entity?.subject.primaryLocation.location.coordinates.lat).toBeCloseTo(31.5590, 3);
      expect(res.entity?.subject.primaryLocation.location.coordinates.lng).toBeCloseTo(35.4732, 3);
    });
  });
});
