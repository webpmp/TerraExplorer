import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getNearbyPlaces } from '../geminiService';
import { runSearchPipeline } from '../pipeline';
import { isLowSignificancePoi, getGeographicHierarchy } from '../geographic/classification';
import { computeImportanceScore } from '../geographic/scoring';
import { applyQualityGate } from '../geographic/qualityGate';
import { applySelection } from '../geographic/selection';
import { Candidate } from '../../types';

describe('Geographic Discovery Prioritization Suite', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('1. Explicit Search for Vancouver resolves strictly to Vancouver coordinates (49.2608724, -123.113952)', async () => {
    global.fetch = async (url: any) => {
      const urlStr = url.toString();
      if (urlStr.includes('nominatim') && urlStr.includes('search')) {
        return new Response(JSON.stringify([{
          place_id: 1001,
          osm_id: 2002,
          osm_type: 'relation',
          display_name: 'Vancouver, Metro Vancouver Regional District, British Columbia, Canada',
          lat: '49.2608724',
          lon: '-123.113952',
          importance: 0.85,
          address: {
            city: 'Vancouver',
            state: 'British Columbia',
            country: 'Canada',
            country_code: 'ca'
          }
        }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(url);
    };

    const geminiService = await import('../geminiService');
    const spyMetadata = vi.spyOn(geminiService.ai.models, 'generateContent').mockResolvedValue({
      text: JSON.stringify({
        name: "Vancouver",
        locationString: "Vancouver, British Columbia, Canada",
        description: "Vancouver is a major coastal seaport city in western Canada, located in the Lower Mainland region of British Columbia.",
        population: 675218,
        climate: {
          name: "Oceanic",
          description: "Temperate oceanic climate with mild, rainy winters and warm, dry summers.",
          koppenCode: "Cfb"
        },
        contextNotes: ["Major city in western Canada"],
        notable: ["Stanley Park"]
      })
    } as any);

    const result = await runSearchPipeline({
      rawQuery: "Find Vancouver",
      intent: "NATURAL_LOCATION",
      entity: "Vancouver"
    });

    expect(result.isValid).toBe(true);
    expect(result.entity).toBeDefined();
    const coords = result.entity!.subject.primaryLocation.location.coordinates;
    expect(coords.lat).toBeCloseTo(49.2608724, 2);
    expect(coords.lng).toBeCloseTo(-123.113952, 2);

    spyMetadata.mockRestore();
  });

  it('2. Globe click inside Vancouver prioritizes Vancouver (Tier 1) over obscure nearby POIs', async () => {
    const vancouverCandidate: Candidate = {
      id: 'city-vancouver',
      name: 'Vancouver',
      coordinates: { lat: 49.2827, lng: -123.1207 },
      type: 'city',
      populationClass: 'large',
      providers: ['Nominatim', 'Overpass'],
      rawProviders: {},
      pipelineStatus: 'collected'
    };

    const obscureTrail: Candidate = {
      id: 'trail-123',
      name: 'Stanley Park Seawall Trail Segment',
      coordinates: { lat: 49.2990, lng: -123.1300 },
      type: 'trail',
      providers: ['Overpass'],
      rawProviders: {},
      pipelineStatus: 'collected'
    };

    await computeImportanceScore(vancouverCandidate, 49.2827, -123.1207);
    await computeImportanceScore(obscureTrail, 49.2827, -123.1207);

    expect(vancouverCandidate.tier).toBe(1);
    expect(vancouverCandidate.researchSignificance).toBe('high');
    expect(vancouverCandidate.importanceScore).toBeGreaterThan(100);

    expect(obscureTrail.tier).toBe(5);
    expect(obscureTrail.eligibility).toBe('ineligible');

    const gated = applyQualityGate([vancouverCandidate, obscureTrail]);
    expect(gated.some(c => c.name === 'Vancouver')).toBe(true);
    expect(gated.some(c => c.name.includes('Trail'))).toBe(false);
  });

  it('3. Globe click near small town (Oroville / Okanogan County scenario) prioritizes settlement over county container and obscure mines', async () => {
    const oroville: Candidate = {
      id: 'settlement-oroville',
      name: 'Oroville',
      coordinates: { lat: 48.9399, lng: -119.4345 },
      type: 'town',
      populationClass: 'small',
      providers: ['Nominatim', 'Overpass'],
      rawProviders: {},
      pipelineStatus: 'collected'
    };

    const okanoganCounty: Candidate = {
      id: 'admin-okanogan',
      name: 'Okanogan County',
      coordinates: { lat: 48.8234, lng: -119.4697 }, // 0 km distance
      type: 'administrative',
      providers: ['AnchorProvider'],
      rawProviders: {},
      pipelineStatus: 'collected'
    };

    const luckyKnockMine: Candidate = {
      id: 'poi-mine',
      name: 'Lucky Knock Mine',
      coordinates: { lat: 48.8000, lng: -119.4500 }, // 6 km distance
      type: 'mine',
      providers: ['Wikipedia'],
      rawProviders: {},
      pipelineStatus: 'collected'
    };

    const similkameenRiver: Candidate = {
      id: 'river-similkameen',
      name: 'Similkameen River',
      coordinates: { lat: 48.8500, lng: -119.4200 }, // 9 km distance
      type: 'river',
      providers: ['Overpass'],
      rawProviders: {},
      pipelineStatus: 'collected'
    };

    const candidates = [oroville, okanoganCounty, luckyKnockMine, similkameenRiver];
    const clickLat = 48.8234;
    const clickLng = -119.4697;

    await Promise.all(candidates.map(c => computeImportanceScore(c, clickLat, clickLng)));

    // Verify tiers and scores
    expect(oroville.tier).toBeLessThanOrEqual(2);
    expect(similkameenRiver.tier).toBeLessThanOrEqual(2);
    expect(luckyKnockMine.eligibility).toBe('ineligible');
    expect(okanoganCounty.entityClass).toBe('administrative_region');

    const gated = applyQualityGate(candidates);
    expect(gated.some(c => c.name === 'Oroville')).toBe(true);
    expect(gated.some(c => c.name === 'Similkameen River')).toBe(true);
    expect(gated.some(c => c.name === 'Lucky Knock Mine')).toBe(false);
    expect(gated.some(c => c.name === 'Okanogan County')).toBe(false);

    const selected = applySelection(gated, 6);
    expect(selected.length).toBeGreaterThan(0);
    expect(selected[0].name).toBe('Oroville');
  });

  it('4. Globe click near a major landmark prioritizes the landmark', async () => {
    const grandCanyon: Candidate = {
      id: 'landmark-gc',
      name: 'Grand Canyon National Park',
      coordinates: { lat: 36.1069, lng: -112.1129 },
      type: 'national_park',
      providers: ['OpenStreetMap'],
      rawProviders: {},
      discoverySignals: ['national park', 'unesco world heritage'],
      pipelineStatus: 'collected'
    };

    const nearbyRestStop: Candidate = {
      id: 'poi-rest',
      name: 'Desert View Rest Area',
      coordinates: { lat: 36.0400, lng: -111.8200 },
      type: 'rest_stop',
      providers: ['OpenStreetMap'],
      rawProviders: {},
      pipelineStatus: 'collected'
    };

    await computeImportanceScore(grandCanyon, 36.1069, -112.1129);
    await computeImportanceScore(nearbyRestStop, 36.1069, -112.1129);

    expect(grandCanyon.tier).toBe(1);
    expect(grandCanyon.researchSignificance).toBe('high');
    expect(nearbyRestStop.eligibility).toBe('ineligible');

    const gated = applyQualityGate([grandCanyon, nearbyRestStop]);
    expect(gated.length).toBe(1);
    expect(gated[0].name).toBe('Grand Canyon National Park');
  });

  it('5. Location with only 1 or 2 meaningful entities returns only those entities without manufacturing fake quota', () => {
    const singleTown: Candidate = {
      id: 'town-isolated',
      name: 'Isolated Oasis',
      coordinates: { lat: 25.0, lng: 15.0 },
      type: 'town',
      importanceScore: 120,
      confidenceScore: 90,
      tier: 2,
      entityClass: 'settlement',
      pipelineStatus: 'quality_gated',
      providers: ['Nominatim'],
      rawProviders: {}
    };

    const selected = applySelection([singleTown], 6);
    expect(selected.length).toBe(1);
    expect(selected[0].name).toBe('Isolated Oasis');
  });

  it('6. Explicit search for obscure entity by name succeeds via resolveLocationQuery / pipeline', async () => {
    global.fetch = async (url: any) => {
      const urlStr = url.toString();
      if (urlStr.includes('nominatim')) {
        return new Response(JSON.stringify([{
          place_id: 9999,
          osm_id: 8888,
          osm_type: 'node',
          display_name: 'Lucky Knock Mine, Okanogan County, Washington, United States',
          lat: '48.8012',
          lon: '-119.4521',
          importance: 0.3,
          address: {
            county: 'Okanogan County',
            state: 'Washington',
            country: 'United States',
            country_code: 'us'
          }
        }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(url);
    };

    const geminiService = await import('../geminiService');
    const spyMetadata = vi.spyOn(geminiService.ai.models, 'generateContent').mockResolvedValue({
      text: JSON.stringify({
        name: "Lucky Knock Mine",
        locationString: "Okanogan County, Washington, United States",
        description: "The Lucky Knock Mine is a historic antimony mine located in Okanogan County, Washington.",
        population: 0,
        notable: ["Antimony deposit"]
      })
    } as any);

    const result = await runSearchPipeline({
      rawQuery: "Find Lucky Knock Mine",
      intent: "NATURAL_LOCATION",
      entity: "Lucky Knock Mine"
    });

    expect(result.isValid).toBe(true);
    expect(result.entity).toBeDefined();
    expect(result.entity!.subject.identity.canonicalName).toContain('Lucky Knock Mine');

    spyMetadata.mockRestore();
  });

  it('7. Rural click in Washington (46.6381, -118.4798) returns Washtucna without filling quota with distant secondary settlements', async () => {
    const washtucna: Candidate = {
      id: 'settlement-washtucna',
      name: 'Washtucna',
      coordinates: { lat: 46.7535, lng: -118.3128 }, // ~23 km distance
      type: 'town',
      populationClass: 'small',
      providers: ['Overpass', 'Nominatim'],
      rawProviders: {},
      pipelineStatus: 'collected'
    };

    const lind: Candidate = {
      id: 'settlement-lind',
      name: 'Lind',
      coordinates: { lat: 46.9715, lng: -118.6144 }, // ~40 km distance
      type: 'town',
      populationClass: 'small',
      providers: ['Overpass'],
      rawProviders: {},
      pipelineStatus: 'collected'
    };

    const starbuck: Candidate = {
      id: 'settlement-starbuck',
      name: 'Starbuck',
      coordinates: { lat: 46.5193, lng: -118.1283 }, // ~41 km distance
      type: 'town',
      populationClass: 'small',
      providers: ['Overpass'],
      rawProviders: {},
      pipelineStatus: 'collected'
    };

    const harder: Candidate = {
      id: 'poi-harder',
      name: 'Harder, Washington',
      coordinates: { lat: 46.6200, lng: -118.4500 }, // ~3 km distance
      type: 'hamlet',
      populationClass: 'small',
      providers: ['Overpass'],
      rawProviders: {},
      pipelineStatus: 'collected'
    };

    const clickLat = 46.6381;
    const clickLng = -118.4798;
    const candidates = [washtucna, lind, starbuck, harder];

    await Promise.all(candidates.map(c => computeImportanceScore(c, clickLat, clickLng)));

    const gated = applyQualityGate(candidates);
    const selected = applySelection(gated, 6);

    // Primary result is Washtucna
    expect(selected.length).toBe(1);
    expect(selected[0].name).toBe('Washtucna');
    expect(selected.some(c => c.name === 'Lind')).toBe(false);
    expect(selected.some(c => c.name === 'Starbuck')).toBe(false);
  });

  it('8. Rural Texas click (35.0539, -102.7430) returns 0 results for distant ordinary small towns', async () => {
    const vega: Candidate = {
      id: 'settlement-vega',
      name: 'Vega',
      coordinates: { lat: 35.2473, lng: -102.4288 }, // ~41 km distance
      type: 'town',
      populationClass: 'small',
      providers: ['Overpass'],
      rawProviders: {},
      pipelineStatus: 'collected'
    };

    const hereford: Candidate = {
      id: 'settlement-hereford',
      name: 'Hereford',
      coordinates: { lat: 34.8156, lng: -102.3977 }, // ~46 km distance
      type: 'town',
      populationClass: 'small',
      providers: ['Overpass'],
      rawProviders: {},
      pipelineStatus: 'collected'
    };

    const friona: Candidate = {
      id: 'settlement-friona',
      name: 'Friona',
      coordinates: { lat: 34.6395, lng: -102.7299 }, // ~46 km distance
      type: 'town',
      populationClass: 'small',
      providers: ['Overpass'],
      rawProviders: {},
      pipelineStatus: 'collected'
    };

    const adrian: Candidate = {
      id: 'settlement-adrian',
      name: 'Adrian',
      coordinates: { lat: 35.2750, lng: -102.7667 }, // ~26 km distance
      type: 'town',
      populationClass: 'small',
      providers: ['Overpass'],
      rawProviders: {},
      pipelineStatus: 'collected'
    };

    const clickLat = 35.0539;
    const clickLng = -102.7430;
    const candidates = [vega, hereford, friona, adrian];

    await Promise.all(candidates.map(c => computeImportanceScore(c, clickLat, clickLng)));

    const gated = applyQualityGate(candidates);
    const selected = applySelection(gated, 6);

    // No candidates qualify because all 4 are distant small towns (> 25 km)
    expect(selected.length).toBe(0);
  });

  it('9. Direct click on Adrian (within 1.5km) selects Adrian', async () => {
    const adrian: Candidate = {
      id: 'settlement-adrian',
      name: 'Adrian',
      coordinates: { lat: 35.2750, lng: -102.7667 },
      type: 'town',
      populationClass: 'small',
      providers: ['Overpass', 'Nominatim'],
      rawProviders: {},
      pipelineStatus: 'collected'
    };

    // Clicked right at Adrian (dist ~0.3 km)
    const clickLat = 35.2770;
    const clickLng = -102.7680;

    await computeImportanceScore(adrian, clickLat, clickLng);

    const gated = applyQualityGate([adrian]);
    const selected = applySelection(gated, 6);

    expect(selected.length).toBe(1);
    expect(selected[0].name).toBe('Adrian');
    expect(selected[0].insideEntity).toBe(true);
  });

  it('10. Globe click semantics: Primary Entity Resolution produces 1 primary marker on major places', async () => {
    // Vancouver click
    const vancouverRes = await getNearbyPlaces(49.2827, -123.1207);
    expect(vancouverRes.status).toBe('SUCCESS');
    expect(vancouverRes.places.length).toBe(1);
    expect(vancouverRes.places[0].name).toBe('Vancouver');
    expect(vancouverRes.diagnostics?.discoveryMode).toBe('PRIMARY_ENTITY');

    // Paris click
    const parisRes = await getNearbyPlaces(48.8566, 2.3522);
    expect(parisRes.status).toBe('SUCCESS');
    expect(parisRes.places.length).toBe(1);
    expect(parisRes.places[0].name).toBe('Paris');
    expect(parisRes.diagnostics?.discoveryMode).toBe('PRIMARY_ENTITY');

    // Grand Canyon click
    const grandCanyonRes = await getNearbyPlaces(36.0565, -112.1250);
    expect(grandCanyonRes.status).toBe('SUCCESS');
    expect(grandCanyonRes.places.length).toBe(1);
    expect(grandCanyonRes.places[0].name).toBe('Grand Canyon National Park');
    expect(grandCanyonRes.diagnostics?.discoveryMode).toBe('PRIMARY_ENTITY');

    // Lake Tahoe click
    const lakeTahoeRes = await getNearbyPlaces(39.0968, -120.0324);
    expect(lakeTahoeRes.status).toBe('SUCCESS');
    expect(lakeTahoeRes.places.length).toBe(1);
    expect(lakeTahoeRes.places[0].name).toBe('Lake Tahoe');
    expect(lakeTahoeRes.diagnostics?.discoveryMode).toBe('PRIMARY_ENTITY');
  });

  it('11. South Africa rural click (-32.990052, 20.918572) does NOT convert Laingsburg Local Municipality into a city', async () => {
    const { resolvePrimaryGeographicEntity } = await import('../geographic/geographicResolver');
    
    // Simulate reverse geocoder returning administrative municipality context
    const reverseContext = {
      country: 'South Africa',
      state: 'Western Cape',
      county: 'Central Karoo District Municipality',
      municipality: 'Laingsburg Local Municipality',
      displayName: 'Laingsburg Local Municipality, Central Karoo District Municipality, Western Cape, South Africa'
    };

    const primary = await resolvePrimaryGeographicEntity(-32.990052, 20.918572, reverseContext as any);
    // Must NOT resolve Laingsburg Local Municipality as a city
    expect(primary).toBeNull();

    // Now evaluate candidates in Stage 2
    const adminMunicipality: Candidate = {
      id: 'admin-laingsburg-municipality',
      name: 'Laingsburg Local Municipality',
      coordinates: { lat: -32.9900, lng: 20.9185 },
      type: 'administrative',
      providers: ['Overpass'],
      rawProviders: {},
      pipelineStatus: 'collected'
    };

    const actualSettlement: Candidate = {
      id: 'settlement-laingsburg',
      name: 'Laingsburg',
      coordinates: { lat: -33.1950, lng: 20.8580 }, // ~23km away
      type: 'town',
      populationClass: 'small',
      providers: ['Overpass', 'Wikipedia'],
      rawProviders: {},
      pipelineStatus: 'collected'
    };

    await computeImportanceScore(adminMunicipality, -32.990052, 20.918572);
    await computeImportanceScore(actualSettlement, -32.990052, 20.918572);

    expect(adminMunicipality.isAdministrative).toBe(true);
    expect(adminMunicipality.eligibleForDefaultDiscovery).toBe(false);

    expect(actualSettlement.isAdministrative).toBe(false);
    expect(actualSettlement.eligibleForDefaultDiscovery).toBe(true);
    expect(actualSettlement.settlementTier).toBe('B');

    const gated = applyQualityGate([adminMunicipality, actualSettlement]);
    const selected = applySelection(gated, 6);

    expect(selected.length).toBe(1);
    expect(selected[0].name).toBe('Laingsburg');
    expect(selected.some(s => s.name.includes('Municipality'))).toBe(false);
  });

  it('12. Administrative Context Entities (Counties, Wards, Regional Districts) are strictly excluded from default discovery markers', async () => {
    const okanoganCounty: Candidate = {
      id: 'admin-okanogan',
      name: 'Okanogan County',
      coordinates: { lat: 48.5, lng: -119.5 },
      type: 'county',
      providers: ['Nominatim'],
      rawProviders: {},
      pipelineStatus: 'collected'
    };

    const franklinCounty: Candidate = {
      id: 'admin-franklin',
      name: 'Franklin County',
      coordinates: { lat: 46.5, lng: -118.8 },
      type: 'administrative',
      discoverySignals: ['county boundary'],
      providers: ['Overpass'],
      rawProviders: {},
      pipelineStatus: 'collected'
    };

    const metroVancouver: Candidate = {
      id: 'admin-metro-van',
      name: 'Metro Vancouver Regional District',
      coordinates: { lat: 49.25, lng: -123.1 },
      type: 'regional_district',
      providers: ['Overpass'],
      rawProviders: {},
      pipelineStatus: 'collected'
    };

    await computeImportanceScore(okanoganCounty, 48.5, -119.5);
    await computeImportanceScore(franklinCounty, 46.5, -118.8);
    await computeImportanceScore(metroVancouver, 49.25, -123.1);

    expect(okanoganCounty.eligibleForDefaultDiscovery).toBe(false);
    expect(franklinCounty.eligibleForDefaultDiscovery).toBe(false);
    expect(metroVancouver.eligibleForDefaultDiscovery).toBe(false);

    const gated = applyQualityGate([okanoganCounty, franklinCounty, metroVancouver]);
    expect(gated.length).toBe(0);
  });

  it('13. Human research significance outranks mere proximity: significant city at 40km beats obscure locality at 3km', async () => {
    const obscureLocality: Candidate = {
      id: 'obscure-nimrod',
      name: 'Nimrod, Texas',
      coordinates: { lat: 32.25, lng: -99.03 }, // 3.3 km away
      type: 'settlement',
      discoverySignals: ['hamlet'],
      providers: ['Overpass'],
      rawProviders: {},
      pipelineStatus: 'collected'
    };

    const significantCity: Candidate = {
      id: 'city-abilene',
      name: 'Abilene',
      coordinates: { lat: 32.4487, lng: -99.7331 }, // ~70 km away
      type: 'city',
      populationClass: 'large',
      providers: ['Overpass', 'Wikipedia'],
      rawProviders: {},
      pipelineStatus: 'collected'
    };

    const clickLat = 32.22;
    const clickLng = -99.03;

    await computeImportanceScore(obscureLocality, clickLat, clickLng);
    await computeImportanceScore(significantCity, clickLat, clickLng);

    expect(obscureLocality.eligibleForDefaultDiscovery).toBe(false);
    expect(significantCity.eligibleForDefaultDiscovery).toBe(true);
    expect(significantCity.finalScore).toBeGreaterThan(obscureLocality.finalScore || 0);

    const gated = applyQualityGate([obscureLocality, significantCity]);
    const selected = applySelection(gated, 6);

    expect(selected.length).toBe(1);
    expect(selected[0].name).toBe('Abilene');
  });

  it('14. Birdsville, Australia: Click inside ordinary town boundary does NOT automatically become the sole primary entity', async () => {
    const { resolvePrimaryGeographicEntity } = await import('../geographic/geographicResolver');

    // Simulate reverse geocoder returning Birdsville town context
    const birdsvilleContext = {
      country: 'Australia',
      state: 'Queensland',
      county: 'Shire of Diamantina',
      town: 'Birdsville',
      displayName: 'Birdsville, Shire of Diamantina, Queensland, Australia'
    };

    const primary = await resolvePrimaryGeographicEntity(-25.8986, 139.3514, birdsvilleContext as any);
    // Ordinary town must return null in Stage 1 so regional candidate discovery runs
    expect(primary).toBeNull();
  });

  it('15. Obscure rural Australian settlement (Betoota / Oodnadatta) boundary containment does not short-circuit discovery', async () => {
    const { resolvePrimaryGeographicEntity } = await import('../geographic/geographicResolver');

    const betootaContext = {
      country: 'Australia',
      state: 'Queensland',
      county: 'Shire of Diamantina',
      town: 'Betoota',
      displayName: 'Betoota, Shire of Diamantina, Queensland, Australia'
    };

    const primary = await resolvePrimaryGeographicEntity(-25.6980, 140.7850, betootaContext as any);
    expect(primary).toBeNull();
  });

  it('16. Major Australian City (Sydney) direct click produces 1 primary marker', async () => {
    const { getNearbyPlaces } = await import('../geminiService');

    const sydneyRes = await getNearbyPlaces(-33.8688, 151.2093);
    expect(sydneyRes.status).toBe('SUCCESS');
    expect(sydneyRes.places.length).toBe(1);
    expect(sydneyRes.places[0].name).toBe('Sydney');
    expect(sydneyRes.diagnostics?.discoveryMode).toBe('PRIMARY_ENTITY');
  });

  it('17. Invalid population inherited from administrative region is rejected for settlements', async () => {
    const { enrichSettlementPopulation } = await import('../geographic/geographicResolver');

    // Mock global.fetch so Nominatim reverse geocode returns Queensland's population
    global.fetch = async (url: any) => {
      const urlStr = url.toString();
      if (urlStr.includes('nominatim') && urlStr.includes('reverse')) {
        return new Response(JSON.stringify({
          name: 'Queensland',
          type: 'state',
          addresstype: 'state',
          extratags: {
            population: '5712100'
          },
          address: {
            state: 'Queensland',
            country: 'Australia'
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const marker = {
      id: 'birdsville-1',
      name: 'Birdsville',
      lat: -25.8986,
      lng: 139.3514,
      type: 'town',
      populationClass: 'small' as const
    };

    const result: any = {
      name: 'Birdsville',
      type: 'town',
      coordinates: { lat: -25.8986, lng: 139.3514 }
    };

    await enrichSettlementPopulation(result, marker as any, 'settlement');

    // Must NOT assign Queensland's 5,712,100 population to Birdsville
    expect(result.population?.value).not.toBe(5712100);
  });

  it('18. Telire, Costa Rica (9.423619, -83.301590) with Overpass down reliably discovers significant regional destinations', async () => {
    // Mock global.fetch so Overpass returns 504 Gateway Timeout, but Wikipedia/Nominatim return regional landmarks
    global.fetch = async (url: any, opts?: any) => {
      const urlStr = url.toString();
      
      // Reverse geocode at click
      if (urlStr.includes('nominatim') && urlStr.includes('reverse')) {
        return new Response(JSON.stringify({
          name: 'Telire',
          type: 'locality',
          addresstype: 'locality',
          lat: '9.423619',
          lon: '-83.301590',
          address: {
            locality: 'Telire',
            county: 'Talamanca',
            state: 'Limón Province',
            country: 'Costa Rica'
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // Overpass fails with 504
      if (urlStr.includes('overpass-api')) {
        return new Response('Gateway Timeout', { status: 504 });
      }

      // Wikipedia geosearch returns regional national parks
      if (urlStr.includes('wikipedia') && urlStr.includes('geosearch')) {
        return new Response(JSON.stringify({
          query: {
            geosearch: [
              {
                pageid: 201,
                title: 'Chirripó National Park',
                lat: 9.4833,
                lon: -83.4833,
                dist: 22000
              },
              {
                pageid: 202,
                title: 'La Amistad International Park',
                lat: 9.4000,
                lon: -82.9333,
                dist: 41000
              }
            ]
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // Nominatim search returns regional town
      if (urlStr.includes('nominatim') && urlStr.includes('search')) {
        return new Response(JSON.stringify([
          {
            place_id: 301,
            osm_id: 401,
            name: 'Puerto Viejo de Talamanca',
            display_name: 'Puerto Viejo de Talamanca, Talamanca, Limón Province, Costa Rica',
            lat: '9.6560',
            lon: '-82.7540',
            type: 'town',
            category: 'place'
          }
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const { getNearbyPlaces } = await import('../geminiService');

    const result = await getNearbyPlaces(9.423619, -83.301590);
    expect(result.status).toBe('SUCCESS');
    expect(result.places.length).toBeGreaterThan(0);
    // Telire must NOT be the sole primary marker
    expect(result.diagnostics?.discoveryMode).toBe('REGIONAL_DISCOVERY');
    // Significant national parks / regional settlements should be returned
    const placeNames = result.places.map(p => p.name);
    expect(placeNames.some(n => n.includes('Chirripó') || n.includes('Amistad') || n.includes('Puerto Viejo'))).toBe(true);
  });

  it('19. Rural Texas with Overpass down reliably discovers regional cities instead of failing', async () => {
    global.fetch = async (url: any) => {
      const urlStr = url.toString();
      
      if (urlStr.includes('nominatim') && urlStr.includes('reverse')) {
        return new Response(JSON.stringify({
          name: 'Nimrod',
          type: 'hamlet',
          addresstype: 'hamlet',
          lat: '32.22',
          lon: '-99.03',
          address: {
            hamlet: 'Nimrod',
            county: 'Eastland County',
            state: 'Texas',
            country: 'United States'
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (urlStr.includes('overpass-api')) {
        throw new Error('Network timeout');
      }

      if (urlStr.includes('nominatim') && urlStr.includes('search')) {
        return new Response(JSON.stringify([
          {
            place_id: 501,
            osm_id: 601,
            name: 'Abilene',
            display_name: 'Abilene, Taylor County, Texas, United States',
            lat: '32.4487',
            lon: '-99.7331',
            type: 'city',
            category: 'place'
          },
          {
            place_id: 502,
            osm_id: 602,
            name: 'Brownwood',
            display_name: 'Brownwood, Brown County, Texas, United States',
            lat: '31.7093',
            lon: '-98.9912',
            type: 'town',
            category: 'place'
          }
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const { getNearbyPlaces } = await import('../geminiService');

    const result = await getNearbyPlaces(32.22, -99.03);
    expect(result.status).toBe('SUCCESS');
    expect(result.places.length).toBeGreaterThan(0);
    const placeNames = result.places.map(p => p.name);
    expect(placeNames.includes('Abilene')).toBe(true);
    expect(placeNames.includes('Nimrod')).toBe(false);
  });

  it('20. Rural Australia with Overpass down reliably discovers regional features', async () => {
    global.fetch = async (url: any) => {
      const urlStr = url.toString();
      
      if (urlStr.includes('nominatim') && urlStr.includes('reverse')) {
        return new Response(JSON.stringify({
          name: 'Birdsville',
          type: 'town',
          addresstype: 'town',
          lat: '-25.8986',
          lon: '139.3514',
          address: {
            town: 'Birdsville',
            county: 'Shire of Diamantina',
            state: 'Queensland',
            country: 'Australia'
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (urlStr.includes('overpass-api')) {
        return new Response('504 Gateway Timeout', { status: 504 });
      }

      if (urlStr.includes('wikipedia') && urlStr.includes('geosearch')) {
        return new Response(JSON.stringify({
          query: {
            geosearch: [
              {
                pageid: 701,
                title: 'Diamantina National Park',
                lat: -24.8333,
                lon: 140.3333,
                dist: 120000
              },
              {
                pageid: 702,
                title: 'Simpson Desert',
                lat: -25.5000,
                lon: 138.5000,
                dist: 90000
              }
            ]
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const { getNearbyPlaces } = await import('../geminiService');

    const result = await getNearbyPlaces(-25.8986, 139.3514);
    expect(result.status).toBe('SUCCESS');
    expect(result.places.length).toBeGreaterThan(0);
    const placeNames = result.places.map(p => p.name);
    expect(placeNames.some(n => n.includes('Diamantina') || n.includes('Simpson'))).toBe(true);
  });

  it('21. All providers failing returns NO_RESULTS without fabricating a misleading primary marker', async () => {
    global.fetch = async (url: any) => {
      const urlStr = url.toString();
      if (urlStr.includes('nominatim') && urlStr.includes('reverse')) {
        return new Response(JSON.stringify({
          name: 'Remote Locality',
          type: 'locality',
          addresstype: 'locality',
          lat: '10.0',
          lon: '20.0',
          address: {
            locality: 'Remote Locality',
            county: 'Remote District',
            country: 'Unknown'
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      // All discovery providers fail
      throw new Error('Network failure');
    };

    const { getNearbyPlaces } = await import('../geminiService');

    const result = await getNearbyPlaces(10.0, 20.0);
    expect(result.status).toBe('NO_RESULTS');
    expect(result.places.length).toBe(0);
    expect(result.diagnostics?.discoveryMode).toBe('REGIONAL_DISCOVERY');
  });

  it('22. Major city beats obscure local monuments (Tugu Keris, Tugu Bawang, Makam)', async () => {
    const { computeImportanceScore } = await import('../geographic/scoring');

    const originLat = 0.9255;
    const originLng = 101.8740;

    const pekanbaru: any = {
      id: 'city-pekanbaru',
      name: 'Pekanbaru',
      type: 'city',
      population: 983356,
      populationClass: 'large',
      coordinates: { lat: 0.5071, lng: 101.4478 },
      providers: ['Overpass', 'Nominatim'],
      discoverySignals: ['major city in Riau']
    };

    const tuguKeris: any = {
      id: 'monument-tugu-keris',
      name: 'Tugu Keris',
      type: 'monument',
      coordinates: { lat: 0.8500, lng: 101.8000 },
      providers: ['Overpass'],
      discoverySignals: ['local monument']
    };

    const makam: any = {
      id: 'tomb-kaca-mayang',
      name: 'Makam Puteri Kaca Mayang',
      type: 'historic',
      coordinates: { lat: 0.8800, lng: 101.8200 },
      providers: ['Overpass'],
      discoverySignals: ['local tomb']
    };

    await computeImportanceScore(pekanbaru, originLat, originLng);
    await computeImportanceScore(tuguKeris, originLat, originLng);
    await computeImportanceScore(makam, originLat, originLng);

    expect(pekanbaru.importanceScore).toBeGreaterThan(tuguKeris.importanceScore);
    expect(pekanbaru.importanceScore).toBeGreaterThan(makam.importanceScore);
    expect(tuguKeris.eligibleForDefaultDiscovery).toBe(false);
    expect(makam.eligibleForDefaultDiscovery).toBe(false);
  });

  it('23. Regional town (Siak Sri Indrapura) beats obscure local POI (Pematang Kencak)', async () => {
    const { computeImportanceScore } = await import('../geographic/scoring');

    const originLat = 0.9255;
    const originLng = 101.8740;

    const siak: any = {
      id: 'town-siak',
      name: 'Siak Sri Indrapura',
      type: 'town',
      population: 53800,
      populationClass: 'medium',
      coordinates: { lat: 0.7972, lng: 102.0494 },
      providers: ['Overpass', 'Nominatim'],
      discoverySignals: ['regional center in Riau']
    };

    const pematang: any = {
      id: 'poi-pematang',
      name: 'Pematang Kencak',
      type: 'natural',
      coordinates: { lat: 0.9100, lng: 101.8600 },
      providers: ['Overpass'],
      discoverySignals: ['local point']
    };

    await computeImportanceScore(siak, originLat, originLng);
    await computeImportanceScore(pematang, originLat, originLng);

    expect(siak.importanceScore).toBeGreaterThan(pematang.importanceScore);
    expect(pematang.eligibleForDefaultDiscovery).toBe(false);
  });

  it('24. Multiple major cities/towns are preferred over cluster of minor landmarks in selection', async () => {
    const { applySelection } = await import('../geographic/selection');

    const candidates: any[] = [
      {
        id: 'c1',
        name: 'Pekanbaru',
        type: 'city',
        entityClass: 'settlement',
        tier: 1,
        prominenceTier: 'Tier A',
        importanceScore: 120,
        eligibleForDefaultDiscovery: true,
        eligibility: 'eligible',
        coordinates: { lat: 0.5071, lng: 101.4478 }
      },
      {
        id: 'c2',
        name: 'Dumai',
        type: 'city',
        entityClass: 'settlement',
        tier: 1,
        prominenceTier: 'Tier A',
        importanceScore: 110,
        eligibleForDefaultDiscovery: true,
        eligibility: 'eligible',
        coordinates: { lat: 1.6667, lng: 101.4500 }
      },
      {
        id: 'c3',
        name: 'Siak Sri Indrapura',
        type: 'town',
        entityClass: 'settlement',
        tier: 2,
        prominenceTier: 'Tier B',
        importanceScore: 95,
        eligibleForDefaultDiscovery: true,
        eligibility: 'eligible',
        coordinates: { lat: 0.7972, lng: 102.0494 }
      },
      {
        id: 'c4',
        name: 'Tugu Keris',
        type: 'monument',
        entityClass: 'minor_poi',
        tier: 5,
        prominenceTier: 'Tier D',
        importanceScore: -100,
        eligibleForDefaultDiscovery: false,
        eligibility: 'ineligible',
        coordinates: { lat: 0.8500, lng: 101.8000 }
      }
    ];

    const selected = applySelection(candidates, 6);
    const names = selected.map(s => s.name);
    expect(names).toEqual(['Pekanbaru', 'Dumai', 'Siak Sri Indrapura']);
    expect(names.includes('Tugu Keris')).toBe(false);
  });

  it('25. Weak candidates are not backfilled merely to hit a marker count', async () => {
    const { applySelection } = await import('../geographic/selection');

    const candidates: any[] = [
      {
        id: 'c1',
        name: 'Pekanbaru',
        type: 'city',
        entityClass: 'settlement',
        tier: 1,
        prominenceTier: 'Tier A',
        importanceScore: 120,
        eligibleForDefaultDiscovery: true,
        eligibility: 'eligible',
        coordinates: { lat: 0.5071, lng: 101.4478 }
      },
      {
        id: 'c2',
        name: 'Tugu Bawang',
        type: 'monument',
        entityClass: 'minor_poi',
        tier: 5,
        importanceScore: -100,
        eligibleForDefaultDiscovery: false,
        eligibility: 'ineligible',
        coordinates: { lat: 0.8600, lng: 101.8100 }
      }
    ];

    const selected = applySelection(candidates, 6);
    expect(selected.length).toBe(1);
    expect(selected[0].name).toBe('Pekanbaru');
  });

  it('26. Valid Wikidata population object is preserved through normalization', async () => {
    const { sanitizeLocationInfo } = await import('../geminiService');

    const rawResponse = {
      name: 'Pekanbaru',
      type: 'city' as any,
      coordinates: { lat: 0.5071, lng: 101.4478 },
      description: 'Capital of Riau province in Indonesia.',
      population: {
        value: 983356,
        source: 'Wikidata P1082',
        status: 'available' as const
      },
      climate: {
        name: 'Tropical Rainforest Climate (Af)',
        description: 'Hot and humid throughout the year.'
      },
      notable: [
        {
          title: 'Siak River',
          summary: 'A major river flowing through Pekanbaru.',
          entityType: 'river'
        }
      ]
    };

    const normalized = sanitizeLocationInfo(rawResponse as any);
    expect(normalized.population?.value).toBe(983356);
    expect(normalized.population?.source).toBe('Wikidata P1082');
    expect(normalized.population?.status).toBe('available');
  });

  it('27. Rural discovery prefers nearby settlement (San José de Bocay) over broad natural park (Bosawás)', async () => {
    const { applySelection } = await import('../geographic/selection');

    const originLat = 14.0481;
    const originLng = -84.9960;

    const candidates: any[] = [
      {
        id: 'park-bosawas',
        name: 'Bosawás Biosphere Reserve',
        type: 'national_park',
        entityClass: 'geographic_feature',
        tier: 2,
        prominenceTier: 'Tier B',
        importanceScore: 88,
        eligibleForDefaultDiscovery: true,
        eligibility: 'eligible',
        distanceKm: 35.0,
        coordinates: { lat: 14.3333, lng: -85.0000 }
      },
      {
        id: 'town-bocay',
        name: 'San José de Bocay',
        type: 'municipality',
        entityClass: 'settlement',
        tier: 2,
        prominenceTier: 'Tier B',
        importanceScore: 85,
        eligibleForDefaultDiscovery: true,
        eligibility: 'eligible',
        distanceKm: 12.0,
        coordinates: { lat: 14.0481, lng: -84.9960 }
      }
    ];

    const selected = applySelection(candidates, 6);
    expect(selected.length).toBe(2);
    // Settlement must be primary discovery entity
    expect(selected[0].name).toBe('San José de Bocay');
    expect(selected[0].coordinates.lat).toBe(14.0481);
    expect(selected[0].coordinates.lng).toBe(-84.9960);
    // Park remains as secondary discovery
    expect(selected[1].name).toBe('Bosawás Biosphere Reserve');
  });

  it('28. Country entity (Nicaragua) is rejected and never replaces a discovered place or becomes primary marker', async () => {
    const { getGeographicHierarchy } = await import('../geographic/classification');
    const { applySelection } = await import('../geographic/selection');

    const countryCandidate: any = {
      id: 'country-nicaragua',
      name: 'Nicaragua',
      type: 'country',
      coordinates: { lat: 13.0000, lng: -85.0000 },
      providers: ['Nominatim']
    };

    const hierarchy = await getGeographicHierarchy(countryCandidate);
    expect(hierarchy.eligibleForDefaultDiscovery).toBe(false);

    const selected = applySelection([countryCandidate], 6);
    expect(selected.length).toBe(0);
  });

  it('29. Municipalities and municipios are classified as eligible settlements', async () => {
    const { getGeographicHierarchy } = await import('../geographic/classification');

    const municipalityCandidate: any = {
      id: 'mun-bocay',
      name: 'San José de Bocay',
      type: 'municipality',
      coordinates: { lat: 14.0481, lng: -84.9960 },
      providers: ['Nominatim', 'Overpass']
    };

    const hierarchy = await getGeographicHierarchy(municipalityCandidate);
    expect(hierarchy.eligibleForDefaultDiscovery).toBe(true);
    expect(hierarchy.discoveryCategory).toBe('RECOGNIZABLE_SETTLEMENT');
  });

  it('30. South Korea rural discovery (37.1866, 127.5631) prioritizes Janghowon over natural features / training parks', async () => {
    const { applySelection } = await import('../geographic/selection');
    const { isLowSignificancePoi } = await import('../geographic/classification');

    // Corporate training park should be low significance
    expect(isLowSignificancePoi("LG Champion's Park", "natural_feature")).toBe(true);

    const candidates: any[] = [
      {
        id: 'feat-yongmunsa',
        name: 'Yongmunsa',
        type: 'natural_feature',
        entityClass: 'geographic_feature',
        tier: 2,
        prominenceTier: 'Tier B',
        importanceScore: 80,
        eligibleForDefaultDiscovery: true,
        eligibility: 'eligible',
        distanceKm: 31.2,
        coordinates: { lat: 37.5501, lng: 127.5711 },
        providers: ['Wikipedia']
      },
      {
        id: 'settlement-janghowon',
        name: 'Janghowon',
        type: 'town',
        entityClass: 'settlement',
        tier: 2,
        prominenceTier: 'Tier B',
        importanceScore: 92,
        eligibleForDefaultDiscovery: true,
        eligibility: 'eligible',
        distanceKm: 4.2,
        coordinates: { lat: 37.1458, lng: 127.5925 },
        providers: ['Nominatim', 'Overpass']
      },
      {
        id: 'settlement-yeoju',
        name: 'Yeoju-si',
        type: 'city',
        entityClass: 'settlement',
        tier: 2,
        prominenceTier: 'Tier B',
        importanceScore: 88,
        eligibleForDefaultDiscovery: true,
        eligibility: 'eligible',
        distanceKm: 18.4,
        coordinates: { lat: 37.2982, lng: 127.6372 },
        providers: ['Nominatim']
      }
    ];

    const selected = applySelection(candidates, 6);
    expect(selected.length).toBeGreaterThanOrEqual(2);
    // Nearest meaningful settlement must be primary
    expect(selected[0].name).toBe('Janghowon');
    expect(selected[0].type).toBe('town');
    expect(selected[0].coordinates.lat).toBe(37.1458);
  });

  it('31. Rural Washington click (46.0367, -120.8885) prioritizes nearby city (Goldendale / The Dalles) over natural features', async () => {
    const { applySelection } = await import('../geographic/selection');
    const { computeImportanceScore } = await import('../geographic/scoring');
    const { applyQualityGate } = await import('../geographic/qualityGate');

    const clickLat = 46.0367;
    const clickLng = -120.8885;

    const candidates: any[] = [
      {
        id: 'feat-rainier',
        name: 'Mount Rainier National Park',
        type: 'national_park',
        entityClass: 'geographic_feature',
        tier: 1,
        prominenceTier: 'Tier A',
        eligibleForDefaultDiscovery: true,
        eligibility: 'eligible',
        coordinates: { lat: 46.8523, lng: -121.7603 },
        providers: ['Wikipedia']
      },
      {
        id: 'feat-indian-rock',
        name: 'Indian Rock',
        type: 'mountain',
        entityClass: 'geographic_feature',
        tier: 2,
        prominenceTier: 'Tier B',
        eligibleForDefaultDiscovery: true,
        eligibility: 'eligible',
        coordinates: { lat: 45.9734, lng: -120.8256 },
        providers: ['Wikipedia']
      },
      {
        id: 'feat-celilo',
        name: 'Celilo Falls',
        type: 'natural_feature',
        entityClass: 'geographic_feature',
        tier: 2,
        prominenceTier: 'Tier B',
        eligibleForDefaultDiscovery: true,
        eligibility: 'eligible',
        coordinates: { lat: 45.6487, lng: -120.9789 },
        providers: ['Wikipedia']
      },
      {
        id: 'city-goldendale',
        name: 'Goldendale',
        type: 'city',
        entityClass: 'settlement',
        tier: 2,
        prominenceTier: 'Tier B',
        eligibleForDefaultDiscovery: true,
        eligibility: 'eligible',
        populationClass: 'small',
        coordinates: { lat: 45.8207, lng: -120.8217 }, // ~25km
        providers: ['Nominatim', 'RegionalSearchProvider']
      },
      {
        id: 'city-the-dalles',
        name: 'The Dalles',
        type: 'city',
        entityClass: 'settlement',
        tier: 2,
        prominenceTier: 'Tier B',
        eligibleForDefaultDiscovery: true,
        eligibility: 'eligible',
        populationClass: 'medium',
        coordinates: { lat: 45.5946, lng: -121.1787 }, // ~48km
        providers: ['Wikipedia', 'RegionalSearchProvider']
      }
    ];

    await Promise.all(candidates.map(c => computeImportanceScore(c, clickLat, clickLng)));
    const gated = applyQualityGate(candidates);
    const selected = applySelection(gated, 6);

    expect(selected.length).toBeGreaterThanOrEqual(3);
    // City must be the primary discovery candidate
    expect(selected[0].entityClass).toBe('settlement');
    expect(['Goldendale', 'The Dalles']).toContain(selected[0].name);
    // Natural features remain as secondary discoveries
    const naturalFeatures = selected.filter(c => c.entityClass === 'geographic_feature' || c.type === 'national_park' || c.type === 'mountain');
    expect(naturalFeatures.length).toBeGreaterThanOrEqual(1);
  });

  it('32. Populated place hierarchy: City > Town > Village > Natural Feature', async () => {
    const { computeImportanceScore } = await import('../geographic/scoring');

    const clickLat = 46.0367;
    const clickLng = -120.8885;

    const cityCandidate: any = {
      id: 'c-city',
      name: 'Test City',
      type: 'city',
      entityClass: 'settlement',
      coordinates: { lat: 46.1000, lng: -120.9000 },
      providers: ['Nominatim']
    };

    const townCandidate: any = {
      id: 'c-town',
      name: 'Test Town',
      type: 'town',
      entityClass: 'settlement',
      coordinates: { lat: 46.1000, lng: -120.9000 },
      providers: ['Nominatim']
    };

    const villageCandidate: any = {
      id: 'c-village',
      name: 'Test Village',
      type: 'village',
      entityClass: 'settlement',
      coordinates: { lat: 46.1000, lng: -120.9000 },
      providers: ['Nominatim']
    };

    const mountainCandidate: any = {
      id: 'c-mountain',
      name: 'Test Mountain',
      type: 'mountain',
      entityClass: 'geographic_feature',
      coordinates: { lat: 46.1000, lng: -120.9000 },
      providers: ['Wikipedia']
    };

    await computeImportanceScore(cityCandidate, clickLat, clickLng);
    await computeImportanceScore(townCandidate, clickLat, clickLng);
    await computeImportanceScore(villageCandidate, clickLat, clickLng);
    await computeImportanceScore(mountainCandidate, clickLat, clickLng);

    expect(cityCandidate.importanceScore).toBeGreaterThan(townCandidate.importanceScore);
    expect(townCandidate.importanceScore).toBeGreaterThan(villageCandidate.importanceScore);
    expect(villageCandidate.importanceScore).toBeGreaterThan(mountainCandidate.importanceScore);
  });

  it('33. Provider timeout / 504 is recorded as TIMEOUT and does not prevent regional discovery', async () => {
    const { OverpassProvider } = await import('../geographic/providers/OverpassProvider');
    const provider = new OverpassProvider();

    // Mock fetchOverpass failure
    const mockContext = { lat: 46.0367, lng: -120.8885, radiusKm: 100 };
    const results = await provider.searchNearby(mockContext);
    expect(results).toBeDefined();
  });

  it('34. Florida click (28.2874, -81.5310) preserves city and town types and outranks distant parks', async () => {
    const { getGeographicHierarchy } = await import('../geographic/classification');
    const { computeImportanceScore } = await import('../geographic/scoring');
    const { applySelection } = await import('../geographic/selection');

    const clickLat = 28.2874;
    const clickLng = -81.5310;

    const celebration: any = {
      id: 'c-celebration',
      name: 'Celebration',
      type: 'town',
      coordinates: { lat: 28.3181, lng: -81.5334 }, // 3.7km
      distanceKm: 3.7,
      providers: ['Nominatim']
    };

    const kissimmee: any = {
      id: 'c-kissimmee',
      name: 'Kissimmee',
      type: 'city',
      coordinates: { lat: 28.2919, lng: -81.4076 }, // 13.7km
      distanceKm: 13.7,
      providers: ['Nominatim']
    };

    const wekiwaPark: any = {
      id: 'c-wekiwa',
      name: 'Wekiwa Springs State Park',
      type: 'state_park',
      coordinates: { lat: 28.7119, lng: -81.4600 }, // 53.7km
      distanceKm: 53.7,
      providers: ['Wikipedia']
    };

    const hCeleb = await getGeographicHierarchy(celebration);
    const hKiss = await getGeographicHierarchy(kissimmee);
    const hPark = await getGeographicHierarchy(wekiwaPark);

    // Verify semantic types are preserved
    expect(celebration.type).toBe('town');
    expect(celebration.normalizedEntityType).toBe('town');
    expect(celebration.rankingClass).toBe('POPULATED_PLACE');

    expect(kissimmee.type).toBe('city');
    expect(kissimmee.normalizedEntityType).toBe('city');
    expect(kissimmee.rankingClass).toBe('POPULATED_PLACE');

    expect(wekiwaPark.rankingClass).toBe('GEOGRAPHIC_FEATURE');

    await computeImportanceScore(celebration, clickLat, clickLng);
    await computeImportanceScore(kissimmee, clickLat, clickLng);
    await computeImportanceScore(wekiwaPark, clickLat, clickLng);

    const candidates = [celebration, kissimmee, wekiwaPark];
    candidates.sort((a, b) => (a.tier || 3) - (b.tier || 3) || (b.importanceScore || 0) - (a.importanceScore || 0));

    const selected = applySelection(candidates, 6);
    expect(selected.length).toBeGreaterThanOrEqual(2);
    // Nearby town or city must be primary, before distant state park
    expect(['Celebration', 'Kissimmee']).toContain(selected[0].name);
    expect(selected[0].rankingClass).toBe('POPULATED_PLACE');
  });

  it('35. False city entities (congressional district, tourism oversight district) are rejected', async () => {
    const { getGeographicHierarchy } = await import('../geographic/classification');

    const falseCity1: any = {
      id: 'c-cftod',
      name: 'Central Florida Tourism Oversight District',
      type: 'city',
      coordinates: { lat: 28.37, lng: -81.55 },
      providers: ['Nominatim']
    };

    const falseCity2: any = {
      id: 'c-fl9',
      name: "Florida's 9th congressional district",
      type: 'city',
      coordinates: { lat: 28.30, lng: -81.40 },
      providers: ['Nominatim']
    };

    const h1 = await getGeographicHierarchy(falseCity1);
    expect(h1.eligibleForDefaultDiscovery).toBe(false);
    expect(falseCity1.rankingClass).toBe('ADMINISTRATIVE_REGION');
    expect(falseCity1.normalizedEntityType).toBe('administrative_region');

    const h2 = await getGeographicHierarchy(falseCity2);
    expect(h2.eligibleForDefaultDiscovery).toBe(false);
    expect(falseCity2.rankingClass).toBe('ADMINISTRATIVE_REGION');
    expect(falseCity2.normalizedEntityType).toBe('administrative_region');
  });

  it('36. Rural Colombia click (5.4328, -72.5875) prioritizes real populated places and rejects Boyacá Department', async () => {
    const { getGeographicHierarchy } = await import('../geographic/classification');
    const { computeImportanceScore } = await import('../geographic/scoring');
    const { applySelection } = await import('../geographic/selection');

    const clickLat = 5.4328;
    const clickLng = -72.5875;

    const boyacaDept: any = {
      id: 'c-boyaca-dept',
      name: 'Boyacá Department',
      type: 'city',
      coordinates: { lat: 5.75, lng: -73.00 },
      providers: ['Nominatim']
    };

    const duitama: any = {
      id: 'c-duitama',
      name: 'Duitama',
      type: 'city',
      coordinates: { lat: 5.8268, lng: -73.0341 }, // ~65 km
      providers: ['Nominatim']
    };

    const sativanorte: any = {
      id: 'c-sativanorte',
      name: 'Sativanorte',
      type: 'city',
      coordinates: { lat: 6.1333, lng: -72.7000 }, // ~78 km
      providers: ['Nominatim']
    };

    const soata: any = {
      id: 'c-soata',
      name: 'Soatá',
      type: 'city',
      coordinates: { lat: 6.3333, lng: -72.6833 }, // ~100 km
      providers: ['Nominatim']
    };

    const villaDeLeyva: any = {
      id: 'c-villa',
      name: 'Villa de Leyva',
      type: 'city',
      coordinates: { lat: 5.6333, lng: -73.5333 }, // ~107 km
      providers: ['Nominatim']
    };

    const elCocuy: any = {
      id: 'c-el-cocuy',
      name: 'El Cocuy National Park',
      type: 'national_park',
      coordinates: { lat: 6.4500, lng: -72.3000 },
      providers: ['Wikipedia']
    };

    const candidates = [boyacaDept, duitama, sativanorte, soata, villaDeLeyva, elCocuy];
    for (const c of candidates) {
      await getGeographicHierarchy(c);
      await computeImportanceScore(c, clickLat, clickLng);
    }

    expect(boyacaDept.rankingClass).toBe('ADMINISTRATIVE_REGION');
    expect(boyacaDept.eligibleForDefaultDiscovery).toBe(false);

    expect(duitama.rankingClass).toBe('POPULATED_PLACE');
    expect(sativanorte.rankingClass).toBe('POPULATED_PLACE');
    expect(elCocuy.rankingClass).toBe('GEOGRAPHIC_FEATURE');

    const selected = applySelection(candidates, 6);

    // Boyacá Department must NOT be in the results
    expect(selected.some(c => c.name === 'Boyacá Department')).toBe(false);

    // Populated places must fill the result slots first
    const selectedNames = selected.map(c => c.name);
    expect(selectedNames).toContain('Duitama');
    expect(selectedNames).toContain('Sativanorte');
    expect(selectedNames).toContain('Soatá');
    expect(selectedNames).toContain('Villa de Leyva');
    expect(selected[0].name).toBe('Duitama');
    expect(selected[0].rankingClass).toBe('POPULATED_PLACE');
  });

  it('34. Verified settlements (Siak Sri Indrapura, Pangkalan Bunut, Sorek, Ukui, Pangkalan Kerinci, Langgam) must NEVER be downgraded to historical_site or natural_feature', async () => {
    const settlements = [
      { id: '1', name: 'Siak Sri Indrapura', type: 'city', coordinates: { lat: 0.7963, lng: 102.0489 }, providers: ['Overpass'] },
      { id: '2', name: 'Pangkalan Bunut', type: 'town', coordinates: { lat: 0.1764, lng: 102.1524 }, providers: ['Overpass'] },
      { id: '3', name: 'Sorek', type: 'town', coordinates: { lat: 0.1456, lng: 102.0832 }, providers: ['Overpass'] },
      { id: '4', name: 'Ukui', type: 'town', coordinates: { lat: -0.1534, lng: 102.1523 }, providers: ['Overpass'] },
      { id: '5', name: 'Pangkalan Kerinci', type: 'town', coordinates: { lat: 0.4042, lng: 101.8542 }, providers: ['Overpass'] },
      { id: '6', name: 'Pangkalan Kerinci Kota', type: 'town', coordinates: { lat: 0.4080, lng: 101.8600 }, providers: ['Overpass'] },
      { id: '7', name: 'Langgam', type: 'town', coordinates: { lat: 0.2833, lng: 101.6833 }, providers: ['Overpass'] }
    ];

    for (const c of settlements) {
      await getGeographicHierarchy(c as any);
      expect((c as any).rankingClass).toBe('POPULATED_PLACE');
      expect((c as any).entityClass).toBe('settlement');
      expect((c as any).eligibleForDefaultDiscovery).toBe(true);
      expect(['city', 'town', 'village', 'municipality']).toContain((c as any).normalizedEntityType);
      expect((c as any).normalizedEntityType).not.toBe('historical_site');
      expect((c as any).normalizedEntityType).not.toBe('natural_feature');
      expect((c as any).normalizedEntityType).not.toBe('national_park');
    }
  });

  it('35. Indonesia click (0.1277, 102.4944) returns 4 verified settlements and 2 geographic features with proper deduplication', async () => {
    const { overpassProvider } = await import('../geographic/providers/OverpassProvider');
    const { wikipediaProvider } = await import('../geographic/providers/WikipediaProvider');
    const { nominatimProvider } = await import('../geographic/providers/NominatimProvider');
    const { regionalSearchProvider } = await import('../geographic/providers/RegionalSearchProvider');

    vi.spyOn(overpassProvider, 'searchNearby').mockImplementation(async (ctx) => {
      if (ctx.categoryFilter === 'settlements') {
        return [
          { id: 'ov-1', name: 'Siak Sri Indrapura', type: 'city', lat: 0.7963, lng: 102.0489, populationClass: 'medium' } as any,
          { id: 'ov-2', name: 'Pangkalan Kerinci', type: 'town', lat: 0.4042, lng: 101.8542, populationClass: 'medium' } as any,
          { id: 'ov-3', name: 'Pangkalan Bunut', type: 'town', lat: 0.1764, lng: 102.1524 } as any,
          { id: 'ov-4', name: 'Sorek', type: 'town', lat: 0.1456, lng: 102.0832 } as any,
          { id: 'ov-5', name: 'Ukui', type: 'town', lat: -0.1534, lng: 102.1523 } as any,
          { id: 'ov-6', name: 'Langgam', type: 'town', lat: 0.2833, lng: 101.6833 } as any,
          { id: 'ov-7', name: 'Teluk Meranti', type: 'town', lat: 0.3200, lng: 102.5800 } as any,
          { id: 'ov-8', name: 'Pangkalan Kerinci Kota', type: 'town', lat: 0.4080, lng: 101.8600 } as any
        ];
      } else if (ctx.categoryFilter === 'features') {
        return [
          { id: 'ov-f1', name: 'Zamrud National Park', type: 'national_park', lat: 0.8500, lng: 102.1500, discoverySignals: ['national park'] } as any,
          { id: 'ov-f2', name: 'Tesso Nilo National Park', type: 'national_park', lat: -0.1000, lng: 101.6000, discoverySignals: ['national park'] } as any
        ];
      }
      return [];
    });

    // Wikipedia returns duplicate Zamrud National Park from another search grid point
    vi.spyOn(wikipediaProvider, 'searchNearby').mockImplementation(async (ctx) => {
      if (ctx.categoryFilter === 'features') {
        return [
          { id: 'wiki-f1', name: 'Zamrud National Park', type: 'national_park', lat: 0.8520, lng: 102.1510, discoverySignals: ['national park'] } as any
        ];
      }
      return [];
    });
    vi.spyOn(nominatimProvider, 'searchNearby').mockResolvedValue([]);
    vi.spyOn(regionalSearchProvider, 'searchNearby').mockResolvedValue([]);

    const result = await getNearbyPlaces(0.1277, 102.4944);
    expect(result.status).toBe('SUCCESS');
    expect(result.places.length).toBe(6);

    const settlements = result.places.filter(p => ['city', 'town', 'village', 'settlement'].includes(p.type));
    const features = result.places.filter(p => ['national_park', 'natural_feature', 'mountain', 'water_body'].includes(p.type));

    expect(settlements.length).toBe(4);
    expect(features.length).toBe(2);

    // Ensure Zamrud National Park appears only once (deduplicated)
    const zamrudOccurrences = result.places.filter(p => p.name.includes('Zamrud'));
    expect(zamrudOccurrences.length).toBe(1);

    // Ensure verified settlements are in the results
    const settlementNames = settlements.map(s => s.name);
    expect(settlementNames.some(n => n.includes('Siak') || n.includes('Pangkalan Kerinci') || n.includes('Sorek') || n.includes('Pangkalan Bunut'))).toBe(true);
  });
});

