import { describe, it, expect, vi } from 'vitest';
import { runSearchPipeline } from '../pipeline';
import { routeIntentAndExtractEntity } from '../geminiService';
import { validateHistoricalCoordinate } from '../geographic/historicalCoordinateValidator';
import * as geoResolver from '../geographic/geographicResolver';

describe('Strict Runtime Verification of 5 Target Queries', () => {
  it('Query 1: "Where was the Santa Maria found?"', async () => {
    const rawQuery = 'Where was the Santa Maria found?';
    console.log(`\n========================================`);
    console.log(`RUNNING QUERY 1: "${rawQuery}"`);
    console.log(`========================================`);
    
    const routed = routeIntentAndExtractEntity(rawQuery);
    console.log(`[ROUTING RESULT] Intent: ${routed.intent}, Entity: "${routed.entity}"`);
    expect(routed.intent).toBe('DISCOVERY_OBJECT_LOCATION');
    expect(routed.entity).toBe('Santa Maria');

    const result = await runSearchPipeline({ rawQuery });
    console.log(`[PIPELINE FINAL RESULT 1]`);
    console.log(`Mode: ${result.mode}`);
    console.log(`Valid: ${result.isValid}`);
    console.log(`Canonical Name: ${result.entity?.subject?.identity?.canonicalName}`);
    console.log(`Primary Label: ${result.entity?.subject?.primaryLocation?.label}`);
    console.log(`Coordinates:`, result.entity?.subject?.primaryLocation?.location?.coordinates);
    console.log(`Coordinate Source:`, (result.entity?.subject?.primaryLocation?.location?.coordinates as any)?.source);
    console.log(`Is Approximate:`, (result.entity?.subject?.primaryLocation as any)?.isApproximate);
    console.log(`Exact Location Known:`, (result.entity?.subject?.primaryLocation as any)?.exactLocationKnown);

    // 1. Strict unconditional assertions on pipeline result
    expect(result.isValid).toBe(true);
    expect(result.mode).toBe('location');
    expect(result.entity).toBeDefined();
    expect(result.entity?.subject).toBeDefined();
    expect(result.entity?.subject?.identity).toBeDefined();
    expect(result.entity?.subject?.primaryLocation).toBeDefined();
    expect(result.entity?.subject?.primaryLocation?.location).toBeDefined();
    expect(result.entity?.subject?.primaryLocation?.location?.coordinates).toBeDefined();

    // 2. Canonical identity & classification lock
    expect(result.entity?.subject?.identity?.canonicalName).toBe('Santa Maria');
    expect(result.entity?.subject?.primaryLocation?.label).toBe('Santa Maria');
    expect(result.entity?.subject?.identity?.canonicalName).not.toBe('Discovery Site of Santa Maria');
    expect(result.entity?.subject?.identity?.entityType).toBe('shipwreck_site');

    // 3. Coordinate bounds in Northern Hispaniola
    const coords = result.entity!.subject!.primaryLocation!.location!.coordinates!;
    expect(coords.lat).toBeGreaterThan(18.0);
    expect(coords.lat).toBeLessThan(21.0);
    expect(coords.lng).toBeGreaterThan(-75.0);
    expect(coords.lng).toBeLessThan(-71.0);
    expect((coords as any).source).toBe('historical_approximate');

    // 4. Uncertainty flags
    expect((result.entity!.subject!.primaryLocation as any).isApproximate).toBe(true);
    expect((result.entity!.subject!.primaryLocation as any).exactLocationKnown).toBe(false);
  });

  it('Query 2: "Where was the wreck of the Santa Maria discovered?"', async () => {
    const rawQuery = 'Where was the wreck of the Santa Maria discovered?';
    console.log(`\n========================================`);
    console.log(`RUNNING QUERY 2: "${rawQuery}"`);
    console.log(`========================================`);
    
    const routed = routeIntentAndExtractEntity(rawQuery);
    console.log(`[ROUTING RESULT] Intent: ${routed.intent}, Entity: "${routed.entity}"`);
    expect(routed.intent).toBe('DISCOVERY_OBJECT_LOCATION');
    expect(routed.entity).toBe('Santa Maria');

    const result = await runSearchPipeline({ rawQuery });
    console.log(`[PIPELINE FINAL RESULT 2]`);
    console.log(`Mode: ${result.mode}`);
    console.log(`Valid: ${result.isValid}`);
    console.log(`Canonical Name: ${result.entity?.subject?.identity?.canonicalName}`);
    console.log(`Coordinates:`, result.entity?.subject?.primaryLocation?.location?.coordinates);

    // Strict assertions
    expect(result.isValid).toBe(true);
    expect(result.mode).toBe('location');
    expect(result.entity).toBeDefined();
    expect(result.entity?.subject?.primaryLocation?.location?.coordinates).toBeDefined();
    expect(result.entity?.subject?.identity?.canonicalName).toBe('Santa Maria');

    const coords = result.entity!.subject!.primaryLocation!.location!.coordinates!;
    expect(coords.lat).toBeGreaterThan(18.0);
    expect(coords.lat).toBeLessThan(21.0);
    expect(coords.lng).toBeGreaterThan(-75.0);
    expect(coords.lng).toBeLessThan(-71.0);
    expect((coords as any).source).toBe('historical_approximate');
    expect((result.entity!.subject!.primaryLocation as any).isApproximate).toBe(true);
    expect((result.entity!.subject!.primaryLocation as any).exactLocationKnown).toBe(false);
  });

  it('Query 3: "Where did the Santa Maria sail?"', async () => {
    const rawQuery = 'Where did the Santa Maria sail?';
    console.log(`\n========================================`);
    console.log(`RUNNING QUERY 3: "${rawQuery}"`);
    console.log(`========================================`);
    
    const routed = routeIntentAndExtractEntity(rawQuery);
    console.log(`[ROUTING RESULT] Intent: ${routed.intent}, Entity: "${routed.entity}"`);
    
    const result = await runSearchPipeline({ rawQuery });
    console.log(`[PIPELINE FINAL RESULT 3]`);
    console.log(`Mode: ${result.mode}`);
    console.log(`Valid: ${result.isValid}`);
    console.log(`Waypoints count: ${result.waypoints?.length}`);

    // Strict unconditional route assertions
    expect(routed.intent).toBe('route');
    expect(routed.intent).not.toBe('DISCOVERY_OBJECT_LOCATION');
    expect(result.isValid).toBe(true);
    expect(result.mode).toBe('route');
    expect(result.waypoints).toBeDefined();
    expect(Array.isArray(result.waypoints)).toBe(true);
    // Proves the query entered the route pathway and never generated a discovery point entity or historical approximate wreck location
    expect(result.entity).toBeUndefined();
  });

  it('Query 4: "Where is Santa Maria, California?"', async () => {
    const rawQuery = 'Where is Santa Maria, California?';
    console.log(`\n========================================`);
    console.log(`RUNNING QUERY 4: "${rawQuery}"`);
    console.log(`========================================`);
    
    const routed = routeIntentAndExtractEntity(rawQuery);
    console.log(`[ROUTING RESULT] Intent: ${routed.intent}, Entity: "${routed.entity}"`);
    expect(routed.intent).toBe('NATURAL_LOCATION');
    expect(routed.entity).toBe('Santa Maria, California');

    const result = await runSearchPipeline({ rawQuery });
    console.log(`[PIPELINE FINAL RESULT 4]`);
    console.log(`Mode: ${result.mode}`);
    console.log(`Valid: ${result.isValid}`);
    console.log(`Canonical Name: ${result.entity?.subject?.identity?.canonicalName}`);
    console.log(`Coordinates:`, result.entity?.subject?.primaryLocation?.location?.coordinates);
    console.log(`Coordinate Source:`, (result.entity?.subject?.primaryLocation?.location?.coordinates as any)?.source);

    // Strict assertions for modern California place
    expect(result.isValid).toBe(true);
    expect(result.entity).toBeDefined();
    expect(result.entity?.subject?.primaryLocation?.location?.coordinates).toBeDefined();

    const coords = result.entity!.subject!.primaryLocation!.location!.coordinates!;
    expect(coords.lat).toBeGreaterThan(30);
    expect(coords.lat).toBeLessThan(40);
    expect(coords.lng).toBeGreaterThan(-125);
    expect(coords.lng).toBeLessThan(-114);
    expect((coords as any).source).not.toBe('historical_approximate');
    expect(result.entity?.subject?.identity?.canonicalName).toContain('Santa Maria');
  });

  it('Query 5: "Where is Santa Maria, Brazil?"', async () => {
    const rawQuery = 'Where is Santa Maria, Brazil?';
    console.log(`\n========================================`);
    console.log(`RUNNING QUERY 5: "${rawQuery}"`);
    console.log(`========================================`);
    
    const routed = routeIntentAndExtractEntity(rawQuery);
    console.log(`[ROUTING RESULT] Intent: ${routed.intent}, Entity: "${routed.entity}"`);
    expect(routed.intent).toBe('NATURAL_LOCATION');
    expect(routed.entity).toBe('Santa Maria, Brazil');

    const result = await runSearchPipeline({ rawQuery });
    console.log(`[PIPELINE FINAL RESULT 5]`);
    console.log(`Mode: ${result.mode}`);
    console.log(`Valid: ${result.isValid}`);
    console.log(`Canonical Name: ${result.entity?.subject?.identity?.canonicalName}`);
    console.log(`Coordinates:`, result.entity?.subject?.primaryLocation?.location?.coordinates);
    console.log(`Coordinate Source:`, (result.entity?.subject?.primaryLocation?.location?.coordinates as any)?.source);

    // Strict assertions for modern Brazil place
    expect(result.isValid).toBe(true);
    expect(result.entity).toBeDefined();
    expect(result.entity?.subject?.primaryLocation?.location?.coordinates).toBeDefined();

    const coords = result.entity!.subject!.primaryLocation!.location!.coordinates!;
    // Santa Maria, RS, Brazil: ~ -29.68° S, -53.80° W
    expect(coords.lat).toBeGreaterThan(-35);
    expect(coords.lat).toBeLessThan(-20);
    expect(coords.lng).toBeGreaterThan(-60);
    expect(coords.lng).toBeLessThan(-45);
    expect((coords as any).source).not.toBe('historical_approximate');
    expect(result.entity?.subject?.identity?.canonicalName).toContain('Santa Maria');
  });

  it('Regression 6: Hallucinated Brazil and Rhode Island recovery coordinates are rejected', async () => {
    const brazilCoord = { lat: -16.401389, lng: -43.951389 };
    const riCoord = { lat: 41.2354, lng: -71.6289 };

    const valBrazil = await validateHistoricalCoordinate('Santa Maria', brazilCoord, {
      rawQuery: 'Where was the Santa Maria found?',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      coordinateSource: 'ai'
    });
    expect(valBrazil.valid).toBe(false);
    expect(valBrazil.reason).toBe('GEOGRAPHIC_MISMATCH');

    const valRI = await validateHistoricalCoordinate('Santa Maria', riCoord, {
      rawQuery: 'Where was the Santa Maria found?',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      coordinateSource: 'ai'
    });
    expect(valRI.valid).toBe(false);
    expect(valRI.reason).toBe('GEOGRAPHIC_MISMATCH');
  });

  it('Regression 7: Case normalization preserves canonical entity name "Santa Maria"', async () => {
    const lowerQuery = 'where was the santa maria found?';
    const routed = routeIntentAndExtractEntity(lowerQuery);
    expect(routed.intent).toBe('DISCOVERY_OBJECT_LOCATION');
    expect(routed.entity).toBe('Santa Maria');

    const result = await runSearchPipeline({ rawQuery: lowerQuery });
    expect(result.isValid).toBe(true);
    expect(result.entity?.subject?.identity?.canonicalName).toBe('Santa Maria');
  });

  it('Regression 8: Semantic context-aware image selection rejects incompatible person and accepts ship', async () => {
    const { validateImageCandidate, buildEntityImageQueries } = await import('../imageService');

    // Context queries
    const queries = buildEntityImageQueries({
      name: 'Santa Maria',
      canonicalName: 'Santa Maria',
      entityType: 'shipwreck_site',
      intent: 'DISCOVERY_OBJECT_LOCATION',
      historicalContext: 'Christopher Columbus / 1492'
    });
    expect(queries.some(q => q.toLowerCase().includes('ship'))).toBe(true);
    expect(queries.some(q => q.toLowerCase().includes('columbus'))).toBe(true);

    // Incompatible candidate: Cara Santa Maria (person/podcaster)
    const personCandidate = {
      title: 'Cara Santa Maria',
      description: 'Cara Santa Maria is an American science communicator, journalist, and podcaster born in Texas.'
    };
    const personRes = validateImageCandidate(personCandidate, {
      name: 'Santa Maria',
      canonicalName: 'Santa Maria',
      entityType: 'shipwreck_site',
      intent: 'DISCOVERY_OBJECT_LOCATION'
    });
    expect(personRes.decision).toBe('REJECT');

    // Semantically matching candidate: Santa María (ship) without coordinates
    const shipCandidate = {
      title: 'Santa María (ship)',
      description: 'Replica of the Santa María, the flagship of Christopher Columbus on his 1492 voyage to the New World.'
    };
    const shipRes = validateImageCandidate(shipCandidate, {
      name: 'Santa Maria',
      canonicalName: 'Santa Maria',
      entityType: 'shipwreck_site',
      intent: 'DISCOVERY_OBJECT_LOCATION'
    });
    expect(shipRes.decision).toBe('ACCEPT');
    expect(shipRes.score).toBeGreaterThanOrEqual(50);
  });

  it('Regression 9: Related historical entity "La Navidad" does not displace canonical subject "Santa Maria"', async () => {
    const result = await runSearchPipeline({ rawQuery: 'Where was the Santa Maria found?' });
    expect(result.isValid).toBe(true);
    expect(result.entity?.subject?.identity?.canonicalName).toBe('Santa Maria');
    expect(result.entity?.subject?.identity?.canonicalName).not.toBe('La Navidad');
  });

  it('Regression 10: Metadata handoff to imageService preserves semantic classification, intent, and historical context', async () => {
    const result = await runSearchPipeline({ rawQuery: 'Where was the Santa Maria found?' });
    expect(result.isValid).toBe(true);

    const finalData = (result as any).finalData;
    expect(finalData).toBeDefined();
    expect(finalData.entityType).toBe('shipwreck_site');
    expect(finalData.intent).toBe('DISCOVERY_OBJECT_LOCATION');
    expect(finalData.historicalContext).toBeDefined();
    expect(finalData.historicalContext.length).toBeGreaterThan(0);

    const { buildEntityImageQueries } = await import('../imageService');
    const queries = buildEntityImageQueries(finalData);
    expect(queries).toBeDefined();
    expect(queries.length).toBeGreaterThan(0);
    // The queries must be contextual and historical-vessel-specific
    expect(queries[0]).toContain('Santa Maria ship');
    expect(queries.includes('Santa Maria')).toBe(false);
  });

  it('Regression 11: InfoPanel presentation suppresses redundant standalone detail headings', async () => {
    const { getCleanDescriptionLines } = await import('../../components/InfoPanel');
    const { NarrationService } = await import('../narrationService');
    const narration = NarrationService.getInstance();

    // 1. Santa Maria with raw "HMS Santa Maria" introductory heading
    const infoSantaMaria = {
      name: 'Santa Maria',
      canonicalName: 'Santa Maria',
      description: 'HMS Santa Maria\n\nHMS Santa Maria is a well-known British World War II submarine that was discovered in the waters off the coast of Santo Domingo, Dominican Republic.'
    };
    const lines1 = getCleanDescriptionLines(infoSantaMaria);
    expect(lines1.length).toBe(1);
    expect(lines1[0]).toBe('HMS Santa Maria is a well-known British World War II submarine that was discovered in the waters off the coast of Santo Domingo, Dominican Republic.');

    const script1 = narration.buildNarrationScript('Santa Maria', infoSantaMaria.description);
    expect(script1.includes('Santa Maria. HMS Santa Maria HMS Santa Maria')).toBe(false);

    // 2. Titanic with "RMS Titanic" introductory heading
    const infoTitanic = {
      name: 'Titanic',
      canonicalName: 'Titanic',
      description: 'RMS Titanic\n\nRMS Titanic was a British passenger liner operated by the White Star Line.'
    };
    const lines2 = getCleanDescriptionLines(infoTitanic);
    expect(lines2.length).toBe(1);
    expect(lines2[0]).toBe('RMS Titanic was a British passenger liner operated by the White Star Line.');

    // 3. Mayflower with "Mayflower" introductory heading
    const infoMayflower = {
      name: 'Mayflower',
      canonicalName: 'Mayflower',
      description: 'Mayflower\n\nThe Mayflower carried the Pilgrims from England to Plymouth in 1620.'
    };
    const lines3 = getCleanDescriptionLines(infoMayflower);
    expect(lines3.length).toBe(1);
    expect(lines3[0]).toBe('The Mayflower carried the Pilgrims from England to Plymouth in 1620.');

    // 4. Legitimate distinctive subtitle/heading preserved
    const infoDistinct = {
      name: 'Santa Maria',
      canonicalName: 'Santa Maria',
      description: 'Shipwreck Site\n\nHMS Santa Maria was discovered in 1995.'
    };
    const lines4 = getCleanDescriptionLines(infoDistinct);
    expect(lines4.length).toBe(2);
    expect(lines4[0]).toBe('Shipwreck Site');
    expect(lines4[1]).toBe('HMS Santa Maria was discovered in 1995.');

    // 5. Mount Everest natural prose preserved without truncation
    const infoEverest = {
      name: 'Mount Everest',
      canonicalName: 'Mount Everest',
      description: 'Mount Everest is Earth\'s highest mountain above sea level, located in the Mahalangur Himal sub-range of the Himalayas.'
    };
    const lines5 = getCleanDescriptionLines(infoEverest);
    expect(lines5.length).toBe(1);
    expect(lines5[0]).toBe('Mount Everest is Earth\'s highest mountain above sea level, located in the Mahalangur Himal sub-range of the Himalayas.');
  });

  it('Target Queries: Times Square, Dallas, Cairo, Budapest, HMS Victor', async () => {
    // 1. Times Square
    const rawTimesSquare = 'Show me Times Square';
    const routedTimesSquare = routeIntentAndExtractEntity(rawTimesSquare);
    expect(routedTimesSquare.entity).toBe('Times Square');
    const resTimesSquare = await runSearchPipeline({ rawQuery: rawTimesSquare, intent: routedTimesSquare.intent, entity: routedTimesSquare.entity });
    expect(resTimesSquare.isValid).toBe(true);
    expect(resTimesSquare.entity?.subject?.primaryLocation?.location?.coordinates?.lat).toBeCloseTo(40.758, 2);
    expect(resTimesSquare.entity?.subject?.primaryLocation?.location?.coordinates?.lng).toBeCloseTo(-73.9855, 2);

    // 1b. Times Square with animated suggestion dots
    const rawTimesSquareDots = 'Show me Times Square . . .';
    const routedTimesSquareDots = routeIntentAndExtractEntity(rawTimesSquareDots);
    expect(routedTimesSquareDots.entity).toBe('Times Square');
    const resTimesSquareDots = await runSearchPipeline({ rawQuery: rawTimesSquareDots, intent: routedTimesSquareDots.intent, entity: routedTimesSquareDots.entity });
    expect(resTimesSquareDots.isValid).toBe(true);
    expect(resTimesSquareDots.entity?.subject?.primaryLocation?.location?.coordinates?.lat).toBeCloseTo(40.758, 2);

    // 2. Dallas
    const rawDallas = 'Dallas';
    const routedDallas = routeIntentAndExtractEntity(rawDallas);
    expect(routedDallas.entity).toBe('Dallas');
    const resDallas = await runSearchPipeline({ rawQuery: rawDallas, intent: routedDallas.intent, entity: routedDallas.entity });
    expect(resDallas.isValid).toBe(true);
    expect(resDallas.entity?.subject?.primaryLocation?.location?.coordinates?.lat).toBeCloseTo(32.7767, 2);
    expect(resDallas.entity?.subject?.primaryLocation?.location?.coordinates?.lng).toBeCloseTo(-96.7970, 2);

    // 3. Cairo / Find Cairo...
    const rawCairo = 'Find Cairo...';
    const routedCairo = routeIntentAndExtractEntity(rawCairo);
    expect(routedCairo.entity).toBe('Cairo');
    const resCairo = await runSearchPipeline({ rawQuery: rawCairo, intent: routedCairo.intent, entity: routedCairo.entity });
    expect(resCairo.isValid).toBe(true);
    expect(resCairo.entity?.subject?.primaryLocation?.location?.coordinates?.lat).toBeCloseTo(30.0444, 2);
    expect(resCairo.entity?.subject?.primaryLocation?.location?.coordinates?.lng).toBeCloseTo(31.2357, 2);

    // 4. Budapest / Find Budapest...
    const rawBudapest = 'Find Budapest...';
    const routedBudapest = routeIntentAndExtractEntity(rawBudapest);
    expect(routedBudapest.entity).toBe('Budapest');
    const resBudapest = await runSearchPipeline({ rawQuery: rawBudapest, intent: routedBudapest.intent, entity: routedBudapest.entity });
    expect(resBudapest.isValid).toBe(true);
    expect(resBudapest.entity?.subject?.primaryLocation?.location?.coordinates?.lat).toBeCloseTo(47.4979, 2);
    expect(resBudapest.entity?.subject?.primaryLocation?.location?.coordinates?.lng).toBeCloseTo(19.0402, 2);

    // 6. Find hong kong (authoritative general geocoder resolution)
    const rawHongKong = 'Find hong kong';
    const routedHongKong = routeIntentAndExtractEntity(rawHongKong);
    expect(routedHongKong.entity.toLowerCase()).toBe('hong kong');
    const geoSpy = vi.spyOn(geoResolver, 'resolveGeographicEntity').mockResolvedValueOnce({
      name: 'Hong Kong, Central and Western District, Hong Kong Island, Hong Kong, China',
      coordinates: { lat: 22.3193, lng: 114.1694, source: 'geocoder' },
      entityType: 'city',
      source: geoResolver.GeographicSource.NOMINATIM,
      identityStatus: 'verified',
      confidence: 0.95,
      suggestedZoom: 8,
      normalizedQuery: 'hong kong',
      diagnostics: {
        resolverVersion: 1,
        matchedName: 'Hong Kong',
        confidenceAdjustments: [],
        warnings: [],
        ambiguity: { detected: false, candidates: [] }
      }
    });
    const resHongKong = await runSearchPipeline({ rawQuery: rawHongKong, intent: routedHongKong.intent, entity: routedHongKong.entity });
    geoSpy.mockRestore();
    expect(resHongKong.isValid).toBe(true);
    expect(resHongKong.mode).toBe('location');
    expect((resHongKong as any).finalData).toBeDefined();
    expect((resHongKong as any).finalData.coordinates).toBeDefined();
    expect((resHongKong as any).finalData.coordinates.lat).toBeCloseTo(22.3193, 1);
    expect((resHongKong as any).finalData.coordinates.lng).toBeCloseTo(114.1694, 1);

    // 7. Find Times Square
    const rawFindTimesSquare = 'Find Times Square';
    const routedFindTimesSquare = routeIntentAndExtractEntity(rawFindTimesSquare);
    expect(routedFindTimesSquare.entity).toBe('Times Square');
    const resFindTimesSquare = await runSearchPipeline({ rawQuery: rawFindTimesSquare, intent: routedFindTimesSquare.intent, entity: routedFindTimesSquare.entity });
    expect(resFindTimesSquare.isValid).toBe(true);
    expect(resFindTimesSquare.mode).toBe('location');
    expect((resFindTimesSquare as any).finalData).toBeDefined();
    expect((resFindTimesSquare as any).finalData.coordinates).toBeDefined();
    expect((resFindTimesSquare as any).finalData.coordinates.lat).toBeCloseTo(40.758, 2);
    expect((resFindTimesSquare as any).finalData.coordinates.lng).toBeCloseTo(-73.9855, 2);
  });
});
