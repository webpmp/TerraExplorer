import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getHistoricalEntityKnowledge,
  validateHistoricalCoordinate
} from '../geographic/historicalCoordinateValidator';
import { determineHistoricalEventScope } from '../geographic/historicalEventScope';
import { resolveAlias } from '../geographic/geographicAliases';
import { DETERMINISTIC_LOCATION_DB } from '../geographic/geographicData';
import { validateEntityIdentity } from '../geographic/entityIdentityValidator';
import { recoverCoordinatesFromAi, resolveLocationQuery } from '../geminiService';
import { runSearchPipeline } from '../pipeline';

describe('Battle of Waterloo Resolution & Coordinate Recovery Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('A. Coordinate Recovery Safety Guard', () => {
    it('allows singular named historical battles through coordinate recovery', async () => {
      // 1. Battle of Waterloo
      const waterlooRes = await recoverCoordinatesFromAi(
        'Where did the Battle of Waterloo take place?',
        'HISTORICAL_EVENT',
        'Battle of Waterloo'
      );
      expect(waterlooRes).toBeDefined();
      expect(waterlooRes?.lat).toBeCloseTo(50.68, 2);
      expect(waterlooRes?.lng).toBeCloseTo(4.41, 2);

      // 2. Battle of Gettysburg
      const gettysburgRes = await recoverCoordinatesFromAi(
        'Where did the Battle of Gettysburg take place?',
        'HISTORICAL_EVENT',
        'Battle of Gettysburg'
      );
      expect(gettysburgRes).toBeDefined();
      expect(gettysburgRes?.lat).toBeCloseTo(39.8167, 2);
      expect(gettysburgRes?.lng).toBeCloseTo(-77.2333, 2);

      // 3. Battle of Trafalgar
      const trafalgarRes = await recoverCoordinatesFromAi(
        'Where did the Battle of Trafalgar take place?',
        'HISTORICAL_EVENT',
        'Battle of Trafalgar'
      );
      expect(trafalgarRes).toBeDefined();
      expect(trafalgarRes?.lat).toBeCloseTo(36.18, 2);
      expect(trafalgarRes?.lng).toBeCloseTo(-6.03, 2);
    });

    it('blocks generic and multi-event discovery queries from single-point coordinate recovery', async () => {
      // battles of the Civil War (generic/multi-event)
      const civilWarBattles = await recoverCoordinatesFromAi(
        'What were the major battles of the Civil War?',
        'HISTORICAL_EVENT',
        'battles of the Civil War'
      );
      expect(civilWarBattles).toBeNull();

      // where were battles fought (query sentence)
      const foughtQuery = await recoverCoordinatesFromAi(
        'where were battles fought',
        'HISTORICAL_EVENT',
        'where were battles fought'
      );
      expect(foughtQuery).toBeNull();

      // other unsafe query phrases
      const placesQuery = await recoverCoordinatesFromAi(
        'what are the places where it took place',
        'HISTORICAL_EVENT',
        'what are the places'
      );
      expect(placesQuery).toBeNull();

      const filmedQuery = await recoverCoordinatesFromAi(
        'where was the movie filmed',
        'NATURAL_LOCATION',
        'where was the movie filmed'
      );
      expect(filmedQuery).toBeNull();
    });
  });

  describe('B. Historical Alias Resolution & Knowledge Base', () => {
    it('resolves "battle of waterloo" to canonical "waterloo" alias without duplicating records', () => {
      const alias = resolveAlias('battle of waterloo');
      expect(alias.aliasApplied).toBe(true);
      expect(alias.canonical).toBe('waterloo');
      expect(DETERMINISTIC_LOCATION_DB[alias.canonical]).toBeDefined();
      expect(DETERMINISTIC_LOCATION_DB[alias.canonical].name).toBe('Waterloo Battlefield');
    });

    it('retrieves canonical knowledge base entry for Battle of Waterloo variations', () => {
      const variations = [
        'Battle of Waterloo',
        'battle of waterloo',
        'the battle of waterloo',
        'The Battle of Waterloo',
        'waterloo'
      ];
      for (const query of variations) {
        const entry = getHistoricalEntityKnowledge(query);
        expect(entry).toBeDefined();
        expect(entry?.entity).toBe('Battle of Waterloo');
        expect(entry?.country).toBe('Belgium');
        expect(entry?.geographicScope).toBe('POINT_EVENT');
        expect(entry?.singleLocation).toBe(true);
        expect(entry?.approximateCoordinates?.lat).toBeCloseTo(50.68, 2);
        expect(entry?.approximateCoordinates?.lng).toBeCloseTo(4.41, 2);
      }
    });

    it('determineHistoricalEventScope classifies Battle of Waterloo as POINT_EVENT with SINGLE_LOCATION routing', () => {
      const scope = determineHistoricalEventScope('Battle of Waterloo');
      expect(scope.scope).toBe('POINT_EVENT');
      expect(scope.singleLocation).toBe(true);
      expect(scope.routing).toBe('SINGLE_LOCATION');
    });

    it('validateHistoricalCoordinate accepts coordinates in Waterloo, Belgium and rejects incorrect regions', async () => {
      // Valid coordinates (Waterloo, Belgium)
      const validCheck = await validateHistoricalCoordinate(
        'Battle of Waterloo',
        { lat: 50.6800, lng: 4.4116 },
        {
          rawQuery: 'Where did the Battle of Waterloo take place?',
          intent: 'HISTORICAL_EVENT',
          coordinateSource: 'deterministic'
        }
      );
      expect(validCheck.valid).toBe(true);

      // Invalid coordinates in Iowa (Waterloo, Iowa)
      const iowaCheck = await validateHistoricalCoordinate(
        'Battle of Waterloo',
        { lat: 42.4928, lng: -92.3426 },
        {
          rawQuery: 'Where did the Battle of Waterloo take place?',
          intent: 'HISTORICAL_EVENT',
          coordinateSource: 'ai_recovery'
        }
      );
      expect(iowaCheck.valid).toBe(false);
      expect(iowaCheck.reason).toMatch(/FORBIDDEN_REGION|GEOGRAPHIC_MISMATCH/);
    });
  });

  describe('C. Entity Identity Protection', () => {
    it('strictly rejects substituting tactical landmarks/farms for the Battle of Waterloo', () => {
      const checkFarm = validateEntityIdentity(
        'Battle Of Waterloo',
        'Baluwarter Farm',
        {
          rawQuery: 'Where did the Battle of Waterloo take place?',
          intent: 'HISTORICAL_EVENT',
          candidateEntityType: 'historical_event_site',
          candidateCanonicalName: 'Baluwarter Farm'
        }
      );
      expect(checkFarm.matches).toBe(false);
      expect(checkFarm.rejectionReason).toBe('ENTITY_IDENTITY_MISMATCH');

      const checkHougoumont = validateEntityIdentity(
        'Battle Of Waterloo',
        'Hougoumont Farm',
        {
          rawQuery: 'Where did the Battle of Waterloo take place?',
          intent: 'HISTORICAL_EVENT',
          candidateEntityType: 'historical_event_site',
          candidateCanonicalName: 'Hougoumont Farm'
        }
      );
      expect(checkHougoumont.matches).toBe(false);
      expect(checkHougoumont.rejectionReason).toBe('ENTITY_IDENTITY_MISMATCH');
    });

    it('accepts legitimate canonical name variants of the battlefield', () => {
      const check1 = validateEntityIdentity('Battle Of Waterloo', 'Waterloo Battlefield');
      expect(check1.matches).toBe(true);

      const check2 = validateEntityIdentity('Battle of Waterloo', 'Battle of Waterloo');
      expect(check2.matches).toBe(true);

      const check3 = validateEntityIdentity(
        'Battle of Waterloo',
        'Waterloo Battlefield',
        { rawQuery: 'Where did the Battle of Waterloo take place?' }
      );
      expect(check3.matches).toBe(true);
    });
  });

  describe('D. End-to-End Search Pipeline Regression', () => {
    it('resolves "Where did the Battle of Waterloo take place?" to valid geographic data', async () => {
      const result = await runSearchPipeline({
        rawQuery: 'Where did the Battle of Waterloo take place?'
      });

      expect(result).toBeDefined();
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.entity).toBeDefined();

      const canonicalName = result.entity?.subject?.identity?.canonicalName ?? (result as any).finalData?.canonicalName;
      expect(['Battle of Waterloo', 'Waterloo Battlefield']).toContain(canonicalName);

      const coordinates = result.entity?.subject?.primaryLocation?.location?.coordinates ?? (result as any).finalData?.coordinates;
      expect(coordinates).toBeDefined();
      expect(coordinates?.lat).toBeCloseTo(50.68, 1);
      expect(coordinates?.lng).toBeCloseTo(4.41, 1);
    });
  });
});
