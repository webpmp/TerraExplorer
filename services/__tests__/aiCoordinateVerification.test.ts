import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateEntityCoordinates, logAiCoordinateTrust, logEntityCoordinateValidation } from '../geographic/entityIdentityValidator';
import { validateResolvedEntity } from '../entityValidation';
import { validateImageCandidate } from '../imageService';
import { DETERMINISTIC_LOCATION_DB } from '../geographic/geographicData';
import { ImageCandidate } from '../../types';

describe('AI Coordinate Recovery Geographic Verification & Image Evidence Trust', () => {

  it('Test 1: Wrong AI coordinates in Mohave County rejected for Antelope Canyon with ENTITY_COORDINATE_MISMATCH', () => {
    // Antelope Canyon authoritative context in Page, Coconino County, AZ
    const authoritativeEntry = DETERMINISTIC_LOCATION_DB['antelope canyon'];
    expect(authoritativeEntry).toBeDefined();
    expect(authoritativeEntry.context?.state).toBe('Arizona');
    expect(authoritativeEntry.context?.county).toBe('Coconino County');

    // AI returns syntactically valid coordinates in Mohave County, AZ (36.352894, -112.975046)
    const result = validateEntityCoordinates({
      requestedEntity: 'Antelope Canyon',
      recoveredEntity: 'Antelope Canyon',
      coordinates: { lat: 36.352894, lng: -112.975046 },
      reverseGeographicContext: {
        country: 'United States',
        state: 'Arizona',
        county: 'Mohave County',
        city: 'Colorado City'
      },
      authoritativeEntityContext: {
        country: authoritativeEntry.context?.country,
        state: authoritativeEntry.context?.state,
        county: authoritativeEntry.context?.county,
        city: authoritativeEntry.context?.city,
        lat: authoritativeEntry.lat,
        lng: authoritativeEntry.lng
      }
    });

    expect(result.consistent).toBe(false);
    expect(result.result).toBe('ENTITY_COORDINATE_MISMATCH');
    expect(result.coordinateTrust).toBe('unverified');
    expect(result.rejectionReason).toContain('County mismatch');
  });

  it('Test 2: Unverified AI coordinates cannot establish final validity', () => {
    // Entity with syntactically valid coordinates, but coordinateSource=ai_recovery and coordinateTrust=unverified
    const unverifiedEntity: any = {
      id: 'antelope-canyon',
      pipelineVersion: 2,
      revision: 1,
      subject: {
        identity: {
          id: 'test-antelope',
          originalQuery: 'show me antelope canyon',
          canonicalName: 'Antelope Canyon',
          category: 'place',
          entityType: 'canyon',
          entityProvenance: { provider: 'Gemini', timestamp: Date.now(), cache: false },
          diagnostics: {}
        },
        primaryLocation: {
          label: 'Antelope Canyon',
          featureType: 'canyon',
          location: {
            coordinates: { lat: 36.352894, lng: -112.975046, source: 'ai_recovery' }
          },
          coordinateSource: 'ai_recovery',
          coordinateTrust: 'unverified',
          identityStatus: 'unverified',
          provenance: { provider: 'ai_recovery', timestamp: Date.now(), cache: false },
          diagnostics: {}
        }
      },
      metadata: {
        description: 'A famous slot canyon located in the American Southwest.'
      }
    };

    const isValid = validateResolvedEntity(unverifiedEntity);
    expect(isValid).toBe(false);

    // When coordinateTrust is promoted to verified after authoritative corroboration
    unverifiedEntity.subject.primaryLocation.coordinateTrust = 'verified';
    unverifiedEntity.subject.primaryLocation.identityStatus = 'verified';
    const isValidAfterVerification = validateResolvedEntity(unverifiedEntity);
    expect(isValidAfterVerification).toBe(true);
  });

  it('Test 3: Authentic Antelope Canyon image survives untrusted coordinate conflict', () => {
    // Target entity with provisional/unverified canonical coordinates
    const entityContext: any = {
      name: 'Antelope Canyon',
      canonicalName: 'Antelope Canyon',
      entityType: 'canyon',
      city: 'Page',
      state: 'Arizona',
      country: 'United States',
      coordinateSource: 'ai_recovery',
      identityStatus: 'unverified',
      coordinates: {
        lat: 36.352894,
        lng: -112.975046
      }
    };

    // Authentic candidate image of Antelope Canyon
    const authenticCandidate: ImageCandidate = {
      title: 'Antelope Canyon, Arizona',
      url: 'https://example.com/antelope_canyon.jpg',
      description: 'Sunlight beaming through the sandstone slots of Antelope Canyon near Page, Arizona',
      tags: ['antelope canyon', 'slot canyon', 'sandstone', 'page', 'arizona']
    };

    const result = validateImageCandidate(authenticCandidate, entityContext, {
      policy: 'GEOGRAPHIC_FEATURE',
      shape: 'GEOGRAPHIC_FEATURE',
      featureType: 'canyon'
    });

    // Should NOT be rejected for GEOGRAPHIC_CONFLICT
    expect(result.decision).toBe('ACCEPT');
    expect(result.reason).not.toBe('GEOGRAPHIC_CONFLICT');
  });

  it('Test 4: Genuine different entities remain rejected', () => {
    const entityContext: any = {
      name: 'Antelope Canyon',
      canonicalName: 'Antelope Canyon',
      entityType: 'canyon',
      city: 'Page',
      state: 'Arizona',
      country: 'United States',
      coordinateSource: 'ai_recovery',
      identityStatus: 'unverified',
      coordinates: {
        lat: 36.8619,
        lng: -111.3743
      }
    };

    // 1. Antelope, Oregon (settlement)
    const oregonCandidate: ImageCandidate = {
      title: 'Antelope, Oregon',
      url: 'https://example.com/antelope_oregon.jpg',
      description: 'A quiet town in Wasco County, Oregon, formerly known as Rajneeshpuram.',
      tags: ['antelope', 'oregon', 'wasco county']
    };

    const resOregon = validateImageCandidate(oregonCandidate, entityContext, {
      policy: 'GEOGRAPHIC_FEATURE',
      shape: 'GEOGRAPHIC_FEATURE',
      featureType: 'canyon'
    });
    expect(resOregon.decision).toBe('REJECT');

    // 2. Soledad Canyon (different canyon)
    const soledadCandidate: ImageCandidate = {
      title: 'Soledad Canyon',
      url: 'https://example.com/soledad_canyon.jpg',
      description: 'A rugged canyon in the Sierra Pelona Mountains of Southern California.',
      tags: ['soledad canyon', 'california', 'mountains']
    };

    const resSoledad = validateImageCandidate(soledadCandidate, entityContext, {
      policy: 'GEOGRAPHIC_FEATURE',
      shape: 'GEOGRAPHIC_FEATURE',
      featureType: 'canyon'
    });
    expect(resSoledad.decision).toBe('REJECT');
  });

  it('Test 5: Valid AI coordinates + matching reverse-geographic context promotes to verified', () => {
    const authoritativeEntry = DETERMINISTIC_LOCATION_DB['antelope canyon'];
    const matchingResult = validateEntityCoordinates({
      requestedEntity: 'Antelope Canyon',
      recoveredEntity: 'Antelope Canyon',
      coordinates: { lat: 36.8619, lng: -111.3743 },
      reverseGeographicContext: {
        country: 'United States',
        state: 'Arizona',
        county: 'Coconino County',
        city: 'Page'
      },
      authoritativeEntityContext: {
        country: authoritativeEntry.context?.country,
        state: authoritativeEntry.context?.state,
        county: authoritativeEntry.context?.county,
        city: authoritativeEntry.context?.city,
        lat: authoritativeEntry.lat,
        lng: authoritativeEntry.lng
      }
    });

    expect(matchingResult.consistent).toBe(true);
    expect(matchingResult.result).toBe('MATCH');
    expect(matchingResult.coordinateTrust).toBe('verified');
  });

  it('Test 6: Reverse geocoding unavailable leaves AI coordinates provisional/unverified', () => {
    const authoritativeEntry = DETERMINISTIC_LOCATION_DB['antelope canyon'];
    const noRevResult = validateEntityCoordinates({
      requestedEntity: 'Antelope Canyon',
      recoveredEntity: 'Antelope Canyon',
      coordinates: { lat: 36.8619, lng: -111.3743 },
      reverseGeographicContext: null,
      authoritativeEntityContext: {
        country: authoritativeEntry.context?.country,
        state: authoritativeEntry.context?.state,
        county: authoritativeEntry.context?.county,
        city: authoritativeEntry.context?.city,
        lat: authoritativeEntry.lat,
        lng: authoritativeEntry.lng
      }
    });

    expect(noRevResult.consistent).toBe(true);
    expect(noRevResult.result).toBe('UNVERIFIED');
    expect(noRevResult.coordinateTrust).toBe('provisional');
  });

  it('Test 7: Trusted deterministic/geocoder coordinates + genuine geographic conflict rejects image', () => {
    // Verified canonical location in London
    const trustedEntity: any = {
      name: "St. Mary's Hospital",
      canonicalName: "St. Mary's Hospital",
      entityType: 'landmark',
      city: 'London',
      country: 'United Kingdom',
      coordinateSource: 'deterministic',
      identityStatus: 'verified',
      coordinates: {
        lat: 51.5173,
        lng: -0.1745
      }
    };

    // Hospital in Sydney (conflicting geography)
    const sydneyCandidate: ImageCandidate = {
      title: "St. Mary's Hospital (Sydney)",
      url: 'https://example.com/sydney_hospital.jpg',
      description: 'Hospital in Sydney, Australia',
      tags: ['hospital', 'sydney', 'australia']
    };

    const res = validateImageCandidate(sydneyCandidate, trustedEntity, {
      policy: 'STRICT_ENTITY',
      shape: 'SPECIFIC_ENTITY'
    });

    expect(res.decision).toBe('REJECT');
    expect(res.reason).toBe('GEOGRAPHIC_CONFLICT');
  });

  it('Test 8: Expected region with subnational hierarchy (City of London, England) matches UK reverse-geocoded coordinates', () => {
    const result = validateEntityCoordinates({
      requestedEntity: 'Great Fire Of London',
      recoveredEntity: 'Great Fire Of London',
      coordinates: { lat: 51.512398, lng: -0.107604 },
      reverseGeographicContext: {
        country: 'United Kingdom',
        state: 'England',
        city: 'City of London'
      },
      expectedRegion: 'City of London, England'
    });

    expect(result.consistent).toBe(true);
    expect(result.result).toBe('MATCH');
    expect(result.coordinateTrust).toBe('verified');
  });

  it('Test 9: Expected region with full hierarchy (London, England, United Kingdom) matches UK coordinates', () => {
    const result = validateEntityCoordinates({
      requestedEntity: 'Great Fire Of London',
      recoveredEntity: 'Great Fire Of London',
      coordinates: { lat: 51.512398, lng: -0.107604 },
      reverseGeographicContext: {
        country: 'United Kingdom',
        state: 'England',
        city: 'London'
      },
      expectedRegion: 'London, England, United Kingdom'
    });

    expect(result.consistent).toBe(true);
    expect(result.result).toBe('MATCH');
    expect(result.coordinateTrust).toBe('verified');
  });

  it('Test 10: Genuine country mismatch (expected UK, reverse-geocoded France) is rejected with ENTITY_COORDINATE_MISMATCH', () => {
    const result = validateEntityCoordinates({
      requestedEntity: 'Great Fire Of London',
      recoveredEntity: 'Great Fire Of London',
      coordinates: { lat: 48.8566, lng: 2.3522 },
      reverseGeographicContext: {
        country: 'France',
        state: 'Île-de-France',
        city: 'Paris'
      },
      expectedRegion: 'London, England, United Kingdom'
    });

    expect(result.consistent).toBe(false);
    expect(result.result).toBe('ENTITY_COORDINATE_MISMATCH');
    expect(result.rejectionReason).toContain('Country mismatch');
  });

  it('Test 11: Genuine state/subnational mismatch (expected England, reverse-geocoded Scotland) is rejected with ENTITY_COORDINATE_MISMATCH', () => {
    const result = validateEntityCoordinates({
      requestedEntity: 'Great Fire Of London',
      recoveredEntity: 'Great Fire Of London',
      coordinates: { lat: 55.9533, lng: -3.1883 },
      reverseGeographicContext: {
        country: 'United Kingdom',
        state: 'Scotland',
        city: 'Edinburgh'
      },
      expectedRegion: 'City of London, England'
    });

    expect(result.consistent).toBe(false);
    expect(result.result).toBe('ENTITY_COORDINATE_MISMATCH');
    expect(result.rejectionReason).toContain('State/Region mismatch');
  });

});
