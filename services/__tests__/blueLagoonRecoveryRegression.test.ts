import { describe, it, expect } from 'vitest';
import { parseAndExtract, scoreMetadataObject } from '../../utils/jsonParser';
import { getEstimatedClimate, getClimateDescription } from '../geographic/climateEstimator';
import { validateResolvedEntity, isGenericPlaceholderDescription } from '../entityValidation';
import { resolveGeographicMetadata } from '../geographic/geographicResolver';
import { MapMarker } from '../../types';

describe('Blue Lagoon and Matterhorn Recovery & Enrichment Regressions', () => {
  it('1. Blue Lagoon receives Subpolar Oceanic / Maritime climate (Cfb/Cfc) and NOT Polar/Tundra', () => {
    const lat = 63.8791684;
    const lng = -22.4443196;
    const region = "Grindavíkurbær";
    const country = "Iceland";
    const entityType = "natural_feature";

    const est = getEstimatedClimate(lat, lng, region, country, entityType);
    expect(est.climateName).toBe("Subpolar Oceanic");
    expect(est.koppenCode).toBe("Cfb");
    expect(est.confidence).toBe("high");

    const desc = getClimateDescription(est.koppenCode, est.climateName);
    expect(desc.toLowerCase()).not.toContain("polar");
    expect(desc.toLowerCase()).not.toContain("tundra");
    expect(desc.toLowerCase()).toContain("oceanic");
  });

  it('2. Matterhorn receives Alpine climate (ET) and NOT Unavailable', () => {
    const lat = 45.9764263;
    const lng = 7.6586024;
    const region = "Valais";
    const country = "Switzerland";
    const entityType = "mountain";

    const est = getEstimatedClimate(lat, lng, region, country, entityType);
    expect(est.climateName).toBe("Alpine Climate");
    expect(est.koppenCode).toBe("ET");
    expect(est.confidence).toBe("high");

    const desc = getClimateDescription(est.koppenCode, est.climateName);
    expect(desc.toLowerCase()).toContain("alpine");
  });

  it('3. Nested climate JSON regression: parses top-level metadata instead of nested climate object', () => {
    const rawTraceResponse = `
Here is the educational metadata:

# Climate
{
  "description": "The Blue Lagoon enjoys a temperate maritime climate with cool summers and relatively mild winters.",
  "koppenCode": "Cfb"
}

# Main Metadata Object
{
  "name": "Blue Lagoon",
  "locationString": "Grindavík, Iceland",
  "description": "The Blue Lagoon is a world-renowned geothermal spa located in an 800-year-old lava field on the Reykjanes Peninsula in southwestern Iceland. The mineral-rich milky blue waters are supplied by water output from the nearby Svartsengi geothermal power plant.",
  "population": null,
  "climate": {
    "name": "Subpolar oceanic climate",
    "description": "Temperate maritime climate moderated by the North Atlantic Current.",
    "koppenCode": "Cfb"
  },
  "contextNotes": [
    "Formed accidentally in 1976 from geothermal wastewater",
    "Water temperature averages 37-39 °C (99-102 °F)"
  ],
  "notable": [
    "Rich in silica and sulfur minerals renowned for skincare",
    "Powered entirely by renewable geothermal energy"
  ]
}
`;

    const parsed = parseAndExtract(rawTraceResponse);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const data: any = parsed.value;

    // Must NOT be the isolated climate sub-object
    expect(data.koppenCode).toBeUndefined();
    expect(data.name).toBe("Blue Lagoon");
    expect(data.locationString).toBe("Grindavík, Iceland");
    expect(data.description).toContain("geothermal spa");
    expect(data.climate).toBeDefined();
    expect(data.climate.koppenCode).toBe("Cfb");
    expect(Array.isArray(data.contextNotes)).toBe(true);
    expect(data.contextNotes.length).toBeGreaterThan(0);
    expect(Array.isArray(data.notable)).toBe(true);
    expect(data.notable.length).toBeGreaterThan(0);
  });

  it('4. Rejects isolated climate-only description in Level 3 validation', () => {
    const climateOnlyEntity: any = {
      id: 'blue-lagoon',
      subject: {
        identity: {
          canonicalName: 'Blue Lagoon',
          entityType: 'natural_feature',
          category: 'place'
        },
        primaryLocation: {
          label: 'Blue Lagoon',
          featureType: 'natural_feature',
          location: {
            coordinates: { lat: 63.8791684, lng: -22.4443196, source: 'geocoder' },
            address: { country: 'Iceland', state: 'Grindavík' }
          },
          coordinateSource: 'geocoder',
          identityStatus: 'verified'
        }
      },
      metadata: {
        description: "The Blue Lagoon enjoys a temperate maritime climate.",
        koppenCode: "Cfb"
      }
    };

    expect(validateResolvedEntity(climateOnlyEntity)).toBe(false);
  });

  it('5. Accepts fully enriched Blue Lagoon entity with substantive description and maritime climate', () => {
    const fullEntity: any = {
      id: 'blue-lagoon',
      subject: {
        identity: {
          canonicalName: 'Blue Lagoon',
          entityType: 'natural_feature',
          category: 'place'
        },
        primaryLocation: {
          label: 'Blue Lagoon',
          featureType: 'natural_feature',
          location: {
            coordinates: { lat: 63.8791684, lng: -22.4443196, source: 'geocoder' },
            address: { country: 'Iceland', state: 'Grindavík' }
          },
          coordinateSource: 'geocoder',
          identityStatus: 'verified'
        }
      },
      metadata: {
        description: "The Blue Lagoon is a geothermal spa in southwestern Iceland located in an 800-year-old lava field on the Reykjanes Peninsula, famous for its mineral-rich waters and silica mud.",
        climate: {
          name: "Subpolar Oceanic",
          description: "Cool summers and mild winters moderated by oceanic currents.",
          koppenCode: "Cfb"
        },
        contextNotes: ["Formed in 1976 from geothermal wastewater"],
        notable: ["One of Iceland's most visited attractions"]
      }
    };

    expect(validateResolvedEntity(fullEntity)).toBe(true);
  });
});
