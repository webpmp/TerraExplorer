import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSearchPipeline } from '../pipeline';
import * as geminiService from '../geminiService';
import * as geoResolver from '../geographic/geographicResolver';
import { formatGeographicContext } from '../../components/InfoPanel';

describe('Landmark InfoPanel Geographic Context & Location Subtitle Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Parthenon resolves canonicalName "Parthenon", city "Athens", state "Attica", country "Greece" with subtitle "Athens, Greece"', async () => {
    const query = 'Where is the Parthenon?';

    // Mock Nominatim search for Parthenon
    vi.spyOn(geoResolver, 'resolveGeographicEntity').mockResolvedValue({
      name: 'Parthenon, Athens, Attica, Greece',
      coordinates: { lat: 37.9715034, lng: 23.7266177, source: 'geocoder' },
      entityType: 'archaeological_site',
      source: geoResolver.GeographicSource.NOMINATIM,
      identityStatus: 'verified',
      confidence: 0.95,
      suggestedZoom: 11,
      normalizedQuery: 'parthenon',
      context: {
        city: 'Athens',
        state: 'Attica',
        country: 'Greece'
      },
      diagnostics: { resolverVersion: 1, matchedName: 'Parthenon', confidenceAdjustments: [], warnings: [] }
    } as any);

    // Mock reverseGeocode
    vi.spyOn(geoResolver, 'reverseGeocode').mockResolvedValue({
      city: 'Athens',
      state: 'Attica',
      country: 'Greece',
      displayName: 'Parthenon, Athens, Attica, Greece'
    } as any);

    vi.spyOn(geminiService, 'recoverLocationMetadata').mockResolvedValue({
      description: 'The Parthenon is a monumental marble temple on the Athenian Acropolis, dedicated to Athena and built in the 5th century BC.',
      locationString: 'Athens, Attica, Greece',
      notable: [{ title: 'Doric Masterpiece', description: 'Acropolis temple representing classical Greek architecture.' }]
    } as any);

    const result = await runSearchPipeline({ rawQuery: query });

    expect(result.isValid).toBe(true);
    expect((result as any).finalData).toBeDefined();
    const finalData = (result as any).finalData;
    expect(finalData.canonicalName).toBe('Parthenon');
    expect(finalData.city).toBe('Athens');
    expect(finalData.state).toBe('Attica');
    expect(finalData.country).toBe('Greece');

    // Check InfoPanel formatting
    const subtitle = formatGeographicContext(finalData, 'Parthenon');
    expect(subtitle).toContain('Athens');
    expect(subtitle).toContain('Greece');
  });

  it('2. Less-specific AI metadata locationString ("Attica, Greece") does not overwrite authoritative reverse-geocoded city ("Athens")', async () => {
    const consoleSpy = vi.spyOn(console, 'log');

    // Simulate geocoder returning coordinates
    vi.spyOn(geoResolver, 'resolveGeographicEntity').mockResolvedValue({
      name: 'Parthenon',
      coordinates: { lat: 37.9715034, lng: 23.7266177, source: 'geocoder' },
      entityType: 'archaeological_site',
      source: geoResolver.GeographicSource.NOMINATIM,
      identityStatus: 'verified',
      confidence: 0.95,
      suggestedZoom: 11,
      normalizedQuery: 'parthenon',
      context: {
        city: 'Athens',
        state: 'Attica',
        country: 'Greece'
      },
      diagnostics: { resolverVersion: 1, matchedName: 'Parthenon', confidenceAdjustments: [], warnings: [] }
    } as any);

    vi.spyOn(geoResolver, 'reverseGeocode').mockResolvedValue({
      city: 'Athens',
      state: 'Attica',
      country: 'Greece',
      displayName: 'Parthenon, Athens, Attica, Greece'
    } as any);

    // Simulate AI metadata recovery returning less specific locationString
    vi.spyOn(geminiService, 'recoverLocationMetadata').mockResolvedValue({
      description: 'The Parthenon is a former temple on the Athenian Acropolis, Greece.',
      locationString: 'Attica, Greece',
      notable: [{ title: 'Classical Architecture', description: 'Masterpiece of the Doric order.' }]
    } as any);

    const result = await runSearchPipeline({ rawQuery: 'Where is the Parthenon?' });
    expect(result.isValid).toBe(true);
    const finalData = (result as any).finalData;
    expect(finalData.city).toBe('Athens');
    expect(finalData.state).toBe('Attica');
    expect(finalData.country).toBe('Greece');

    // Check that GEOGRAPHIC CONTEXT PRESERVED was logged
    const preservedLog = consoleSpy.mock.calls.find(c => String(c[0]).includes('[GEOGRAPHIC CONTEXT PRESERVED]'));
    expect(preservedLog).toBeDefined();

    const subtitle = formatGeographicContext(finalData, 'Parthenon');
    expect(subtitle).toContain('Athens');
    expect(subtitle).toContain('Greece');
  });

  it('3. No city available: when only state ("Attica") and country ("Greece") exist, displays "Attica, Greece"', () => {
    const dataWithoutCity = {
      name: 'Cape Sounion Temple',
      canonicalName: 'Cape Sounion Temple',
      state: 'Attica',
      country: 'Greece',
      locationString: 'Attica, Greece'
    };

    const subtitle = formatGeographicContext(dataWithoutCity, 'Cape Sounion Temple');
    expect(subtitle).toBe('Attica, Greece');
  });

  it('4. City entity: "Boston, Massachusetts" continues to resolve correctly without duplicate location string', async () => {
    vi.spyOn(geoResolver, 'resolveGeographicEntity').mockResolvedValue({
      name: 'Boston, Massachusetts, United States',
      coordinates: { lat: 42.3601, lng: -71.0589, source: 'geocoder' },
      entityType: 'city',
      source: geoResolver.GeographicSource.NOMINATIM,
      identityStatus: 'verified',
      confidence: 0.95,
      suggestedZoom: 11,
      normalizedQuery: 'boston massachusetts',
      context: {
        city: 'Boston',
        state: 'Massachusetts',
        country: 'United States'
      },
      diagnostics: { resolverVersion: 1, matchedName: 'Boston', confidenceAdjustments: [], warnings: [] }
    } as any);

    vi.spyOn(geoResolver, 'reverseGeocode').mockResolvedValue({
      city: 'Boston',
      state: 'Massachusetts',
      country: 'United States',
      displayName: 'Boston, Massachusetts, United States'
    } as any);

    vi.spyOn(geminiService, 'recoverLocationMetadata').mockResolvedValue({
      description: 'Boston is the capital and largest city of the Commonwealth of Massachusetts in the United States.',
      locationString: 'Boston, Massachusetts, United States',
      notable: [{ title: 'Historical Heritage', description: 'Founded in 1630 on the Shawmut Peninsula.' }]
    } as any);

    const result = await runSearchPipeline({ rawQuery: 'Boston, Massachusetts' });
    expect(result.isValid).toBe(true);
    const finalData = (result as any).finalData;
    expect(finalData.city).toBe('Boston');
    expect(finalData.state).toBe('Massachusetts');
    expect(finalData.country).toBe('United States');

    const subtitle = formatGeographicContext(finalData, 'Boston');
    expect(subtitle).toBe('Massachusetts, United States');
  });

  it('5. Colosseum resolves city "Rome", country "Italy"', async () => {
    vi.spyOn(geoResolver, 'resolveGeographicEntity').mockResolvedValue({
      name: 'Colosseum, Piazza del Colosseo, Rome, Lazio, Italy',
      coordinates: { lat: 41.8902, lng: 12.4922, source: 'geocoder' },
      entityType: 'archaeological_site',
      source: geoResolver.GeographicSource.NOMINATIM,
      identityStatus: 'verified',
      confidence: 0.95,
      suggestedZoom: 11,
      normalizedQuery: 'colosseum',
      context: {
        city: 'Rome',
        state: 'Lazio',
        country: 'Italy'
      },
      diagnostics: { resolverVersion: 1, matchedName: 'Colosseum', confidenceAdjustments: [], warnings: [] }
    } as any);

    vi.spyOn(geoResolver, 'reverseGeocode').mockResolvedValue({
      city: 'Rome',
      state: 'Lazio',
      country: 'Italy',
      displayName: 'Colosseum, Rome, Lazio, Italy'
    } as any);

    vi.spyOn(geminiService, 'recoverLocationMetadata').mockResolvedValue({
      description: 'The Colosseum is an elliptical amphitheatre in the centre of the city of Rome, Italy.',
      locationString: 'Rome, Lazio, Italy',
      notable: [{ title: 'Flavian Amphitheatre', description: 'Largest ancient amphitheatre ever built.' }]
    } as any);

    const result = await runSearchPipeline({ rawQuery: 'Where is the Colosseum?' });
    expect(result.isValid).toBe(true);
    const finalData = (result as any).finalData;
    expect(finalData.canonicalName).toBe('Colosseum');
    expect(finalData.city).toBe('Rome');
    expect(finalData.country).toBe('Italy');

    const subtitle = formatGeographicContext(finalData, 'Colosseum');
    expect(subtitle).toContain('Rome');
    expect(subtitle).toContain('Italy');
  });

  it('6. Eiffel Tower resolves city "Paris", country "France"', async () => {
    vi.spyOn(geoResolver, 'resolveGeographicEntity').mockResolvedValue({
      name: 'Eiffel Tower, 5, Avenue Anatole France, Quartier du Gros-Caillou, Paris 7e Arrondissement, Paris, Île-de-France, France',
      coordinates: { lat: 48.8584, lng: 2.2945, source: 'geocoder' },
      entityType: 'monument',
      source: geoResolver.GeographicSource.NOMINATIM,
      identityStatus: 'verified',
      confidence: 0.95,
      suggestedZoom: 11,
      normalizedQuery: 'eiffel tower',
      context: {
        city: 'Paris',
        state: 'Île-de-France',
        country: 'France'
      },
      diagnostics: { resolverVersion: 1, matchedName: 'Eiffel Tower', confidenceAdjustments: [], warnings: [] }
    } as any);

    vi.spyOn(geoResolver, 'reverseGeocode').mockResolvedValue({
      city: 'Paris',
      state: 'Île-de-France',
      country: 'France',
      displayName: 'Eiffel Tower, Paris, France'
    } as any);

    vi.spyOn(geminiService, 'recoverLocationMetadata').mockResolvedValue({
      description: 'The Eiffel Tower is a wrought-iron lattice tower on the Champ de Mars in Paris, France.',
      locationString: 'Paris, Île-de-France, France',
      notable: [{ title: 'Gustave Eiffel', description: 'Constructed from 1887 to 1889 as the centerpiece of the 1889 World\'s Fair.' }]
    } as any);

    const result = await runSearchPipeline({ rawQuery: 'Where is the Eiffel Tower?' });
    expect(result.isValid).toBe(true);
    const finalData = (result as any).finalData;
    expect(finalData.canonicalName).toBe('Eiffel Tower');
    expect(finalData.city).toBe('Paris');
    expect(finalData.country).toBe('France');

    const subtitle = formatGeographicContext(finalData, 'Eiffel Tower');
    expect(subtitle).toContain('Paris');
    expect(subtitle).toContain('France');
  });
});
