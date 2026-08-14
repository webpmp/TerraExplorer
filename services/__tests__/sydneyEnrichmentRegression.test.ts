import { describe, it, expect, vi } from 'vitest';
import { runSearchPipeline } from '../pipeline';
import { isPlaceholderString } from '../../components/InfoPanel';
import { isEnglishText, validateResolvedEntity } from '../entityValidation';
import { getEstimatedClimate } from '../geographic/climateEstimator';

describe('Sydney Opera House and InfoPanel Enrichment Regression Suite', () => {
  it('1. Sydney Opera House maintains canonical coordinates, administrative context, and Cfa climate', async () => {
    const geminiService = await import('../geminiService');
    const spyMetadata = vi.spyOn(geminiService.ai.models, 'generateContent').mockResolvedValue({
      text: JSON.stringify({
        name: "Sydney Opera House",
        locationString: "Sydney, Australia",
        description: "The Sydney Opera House is a multi-venue performing arts centre at Sydney Harbour in Sydney, New South Wales, Australia. It is one of the 20th century's most famous and distinctive buildings.",
        population: null,
        climate: {
          name: "Humid Subtropical",
          description: "Warm summers and mild winters with consistent coastal rainfall.",
          koppenCode: "Cfa"
        },
        contextNotes: ["Designed by Danish architect Jørn Utzon", "Opened on 20 October 1973"],
        notable: ["UNESCO World Heritage Site designated in 2007"]
      })
    } as any);

    const result = await runSearchPipeline({
      rawQuery: "Where is the Sydney Opera House?",
      intent: "NATURAL_LOCATION",
      entity: "Sydney Opera House"
    });

    expect(result.isValid).toBe(true);
    expect(result.entity).toBeDefined();

    const entity = result.entity!;
    const coords = entity.subject.primaryLocation.location.coordinates;
    expect(coords.lat).toBeCloseTo(-33.8568, 3);
    expect(coords.lng).toBeCloseTo(151.2153, 3);

    const address = entity.subject.primaryLocation.location.address;
    expect(address?.country?.toLowerCase()).toBe('australia');
    expect(address?.state?.toLowerCase()).toBe('new south wales');
    expect(address?.city?.toLowerCase()).toBe('sydney');

    // Climate must be Humid Subtropical (Cfa) and not BSk (Semi-arid)
    const climate = (entity.metadata as any)?.climate;
    expect(climate).toBeDefined();
    expect(climate.koppenCode).toBe('Cfa');
    expect(climate.name.toLowerCase()).not.toContain('semi-arid');
    expect(climate.name.toLowerCase()).not.toContain('unknown');
    expect(climate.name.toLowerCase()).not.toContain('unavailable');

    // Population must be null/undefined for a landmark
    expect((entity.metadata as any)?.population).toBeUndefined();

    spyMetadata.mockRestore();
  });

  it('2. Language validation: rejects French response and accepts English response', () => {
    const frenchText = "Le Sydney Opera House est un édifice de spectacle situé à Sydney, en Nouvelle-Galles du Sud, Australie.";
    const englishText = "The Sydney Opera House is a multi-venue performing arts centre in Sydney, New South Wales, Australia.";

    expect(isEnglishText(frenchText)).toBe(false);
    expect(isEnglishText(englishText)).toBe(true);

    const frenchEntity: any = {
      id: 'sydney-opera-house',
      subject: {
        identity: { canonicalName: 'Sydney Opera House', entityType: 'landmark', category: 'place' },
        primaryLocation: {
          label: 'Sydney Opera House',
          featureType: 'landmark',
          location: {
            coordinates: { lat: -33.8568, lng: 151.2153, source: 'deterministic' },
            address: { country: 'Australia', state: 'New South Wales', city: 'Sydney' }
          },
          coordinateSource: 'deterministic',
          identityStatus: 'verified'
        }
      },
      metadata: {
        description: frenchText,
        climate: { name: "Humid Subtropical", koppenCode: "Cfa" },
        notable: ["Famous opera venue"]
      }
    };

    expect(validateResolvedEntity(frenchEntity)).toBe(false);

    const englishEntity: any = {
      ...frenchEntity,
      metadata: {
        ...frenchEntity.metadata,
        description: englishText
      }
    };

    expect(validateResolvedEntity(englishEntity)).toBe(true);
  });

  it('3. Placeholder validation: identifies all disallowed UI placeholder strings', () => {
    expect(isPlaceholderString("Unknown")).toBe(true);
    expect(isPlaceholderString("Unavailable")).toBe(true);
    expect(isPlaceholderString("N/A")).toBe(true);
    expect(isPlaceholderString("na")).toBe(true);
    expect(isPlaceholderString("Not available")).toBe(true);
    expect(isPlaceholderString("Not applicable")).toBe(true);
    expect(isPlaceholderString("No data")).toBe(true);
    expect(isPlaceholderString("none")).toBe(true);
    expect(isPlaceholderString("null")).toBe(true);
    expect(isPlaceholderString("undefined")).toBe(true);
    expect(isPlaceholderString("0")).toBe(true);
    expect(isPlaceholderString("Climate data unavailable for this location.")).toBe(true);

    expect(isPlaceholderString("Humid Subtropical")).toBe(false);
    expect(isPlaceholderString("Subpolar Oceanic")).toBe(false);
    expect(isPlaceholderString("Alpine Climate")).toBe(false);
  });

  it('4. Climate estimator produces Humid Subtropical (Cfa) for Sydney / New South Wales', () => {
    const lat = -33.8568;
    const lng = 151.2153;
    const region = "New South Wales";
    const country = "Australia";
    const entityType = "landmark";

    const est = getEstimatedClimate(lat, lng, region, country, entityType);
    expect(est.climateName).toBe("Humid Subtropical");
    expect(est.koppenCode).toBe("Cfa");
    expect(est.confidence).toBe("high");
  });

  it('5. Location with climate data vs location without climate data', () => {
    // Location with valid climate data
    const locationWithClimate = {
      name: "Sydney Opera House",
      climate: { name: "Humid Subtropical", description: "Warm coastal summers" }
    };
    expect(isPlaceholderString(locationWithClimate.climate.name)).toBe(false);

    // Location without climate data or with placeholder
    const locationWithoutClimate = {
      name: "Deep Sea Trench",
      climate: null
    };
    expect(locationWithoutClimate.climate).toBeNull();

    const locationWithPlaceholder = {
      name: "Unknown Entity",
      climate: { name: "Unavailable", description: "Climate data unavailable" }
    };
    expect(isPlaceholderString(locationWithPlaceholder.climate.name)).toBe(true);
    expect(isPlaceholderString(locationWithPlaceholder.climate.description)).toBe(true);
  });
});
