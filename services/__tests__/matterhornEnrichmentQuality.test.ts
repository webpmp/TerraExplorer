import { describe, it, expect } from 'vitest';
import { validateResolvedEntity, isGenericPlaceholderDescription } from '../entityValidation';
import { getEstimatedClimate, getClimateDescription } from '../geographic/climateEstimator';
import { resolveGeographicMetadata } from '../geographic/geographicResolver';
import { mergeCoordinates } from '../coordinateAuthority';
import { MapMarker, GeoCoordinates } from '../../types';
import { ResolvedEntity } from '../../domain';

describe('Matterhorn Enrichment Quality & Geographic Integrity', () => {
  const canonicalMatterhorn: any = {
    id: 'matterhorn-1',
    pipelineVersion: 2,
    revision: 1,
    subject: {
      identity: {
        id: 'matterhorn-id',
        originalQuery: 'Where is the Matterhorn?',
        canonicalName: 'Matterhorn',
        category: 'place',
        entityType: 'mountain',
        entityProvenance: { provider: 'Nominatim', timestamp: Date.now(), cache: false },
        diagnostics: {}
      },
      primaryLocation: {
        label: 'Matterhorn',
        featureType: 'mountain',
        location: {
          coordinates: { lat: 45.9764263, lng: 7.6586024, source: 'geocoder' },
          address: {
            country: 'Switzerland',
            state: 'Valais',
            city: 'Visp'
          }
        },
        coordinateSource: 'geocoder',
        identityStatus: 'verified',
        provenance: { provider: 'Nominatim', timestamp: Date.now(), cache: false },
        diagnostics: {}
      }
    }
  };

  it('1. Matterhorn receives Swiss geographic context during enrichment & geographic resolution', async () => {
    const marker: MapMarker = {
      id: 'matterhorn',
      name: 'Matterhorn',
      lat: 45.9764,
      lng: 7.6586,
      type: 'mountain',
      populationClass: 'small'
    };

    const originalFetch = global.fetch;
    global.fetch = async (url: any) => {
      const urlStr = url.toString();
      if (urlStr.includes('nominatim') || urlStr.includes('reverse')) {
        return new Response(JSON.stringify({
          place_id: 12345,
          osm_id: 98765,
          osm_type: 'node',
          display_name: 'Matterhorn, Visp, Valais, Switzerland',
          lat: '45.9764263',
          lon: '7.6586024',
          address: {
            natural: 'peak',
            county: 'Visp',
            state: 'Valais',
            country: 'Switzerland'
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    };

    try {
      const resolved = await resolveGeographicMetadata(marker);
      expect(resolved.lat).toBeCloseTo(45.9764, 2);
      expect(resolved.lng).toBeCloseTo(7.6586, 2);
      expect(resolved.country?.toLowerCase()).toContain('switzerland');
      expect(resolved.state?.toLowerCase() || resolved.region?.toLowerCase()).toMatch(/valais|wallis/);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('2. "Information on Matterhorn." fails description-quality validation', () => {
    expect(isGenericPlaceholderDescription("Information on Matterhorn.")).toBe(true);
    expect(isGenericPlaceholderDescription("Information on Matterhorn")).toBe(true);
    expect(isGenericPlaceholderDescription("Information about Matterhorn.")).toBe(true);
    expect(isGenericPlaceholderDescription("Details about Matterhorn.")).toBe(true);
    expect(isGenericPlaceholderDescription("Overview of Matterhorn.")).toBe(true);
    expect(isGenericPlaceholderDescription("Summary of Matterhorn.")).toBe(true);

    const entityWithPlaceholder: any = {
      ...canonicalMatterhorn,
      metadata: {
        description: "Information on Matterhorn.",
        climate: { name: "Alpine Climate", description: "Cold temperatures with alpine conditions." }
      }
    };

    expect(validateResolvedEntity(entityWithPlaceholder)).toBe(false);
  });

  it('3. A legitimate Matterhorn description passes description-quality and entity validation', () => {
    const legitimateDescription = "The Matterhorn is a distinct pyramid-shaped mountain peak in the Pennine Alps, straddling the border between Switzerland and Italy at an elevation of 4,478 metres.";
    
    expect(isGenericPlaceholderDescription(legitimateDescription, "Matterhorn")).toBe(false);

    const entityWithValidDesc: any = {
      ...canonicalMatterhorn,
      metadata: {
        description: legitimateDescription,
        climate: {
          name: "Alpine Climate",
          description: "Characterized by cold alpine temperatures, glaciers, and permanent snow cover."
        }
      }
    };

    expect(validateResolvedEntity(entityWithValidDesc)).toBe(true);
  });

  it('4. Climate enrichment receives canonical Switzerland/Valais context and produces Alpine climate', () => {
    const climate = getEstimatedClimate(45.9764263, 7.6586024, "Valais", "Switzerland", "mountain");
    expect(climate.climateName).toBe("Alpine Climate");
    expect(climate.koppenCode).toBe("ET");
    expect(climate.confidence).toBe("high");

    const description = getClimateDescription(climate.koppenCode, climate.climateName);
    expect(description).not.toContain("unavailable");
    expect(description.toLowerCase()).toContain("alpine");
  });

  it('5. Verified Nominatim coordinates remain unchanged and authoritative', () => {
    const nominatimCoords = {
      lat: 45.9764263,
      lng: 7.6586024,
      source: 'geocoder' as const,
      confidence: 'high' as const
    };

    // AI recovery candidate with different coordinates
    const aiCandidate = {
      lat: 46.0000,
      lng: 7.7000,
      source: 'ai_recovery' as const
    };

    const merged = mergeCoordinates(nominatimCoords, aiCandidate);
    expect(merged.lat).toBe(45.9764263);
    expect(merged.lng).toBe(7.6586024);
    expect(merged.source).toBe('geocoder');
  });

  it('6. AI recovery cannot overwrite verified coordinates in mergeCoordinates', () => {
    const verifiedCoords = {
      lat: 45.9764263,
      lng: 7.6586024,
      source: 'geocoder' as const
    };

    const aiCoords = {
      lat: 37.2709,
      lng: -115.8187,
      source: 'ai_recovery' as const
    };

    const merged = mergeCoordinates(verifiedCoords, aiCoords);
    expect(merged.lat).toBe(45.9764263);
    expect(merged.lng).toBe(7.6586024);
    expect(merged.source).toBe('geocoder');
  });
});
