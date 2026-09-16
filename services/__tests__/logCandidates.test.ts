import { describe, it } from 'vitest';
import * as fs from 'fs';
import {
  validateImageCandidate,
  resolveImageIntent,
  extractHistoricalImageContext,
  buildHistoricalImageQueries,
  deriveEntityAliases,
  classifyImageEvidence,
  detectGeographicMismatch
} from '../imageService';

describe('Candidate Logging Diagnostic', () => {
  it('Logs all Burkhan Khaldun candidates and why each is rejected/accepted', async () => {
    let out = '';
    const log = (msg: string) => { out += msg + '\n'; console.log(msg); };

    const wp = {
      id: 'wp-genghis-1',
      name: 'Burkhan Khaldun (Mongolia)',
      canonicalName: 'Burkhan Khaldun',
      lat: 48.9,
      lng: 109.0,
      country: 'Mongolia',
      state: 'Khentii',
      entityType: 'historical_waypoint',
      context: '1206: Temüjin unites the Mongol tribes and is proclaimed Genghis Khan.',
      description: 'Burkhan Khaldun is a sacred mountain in northeastern Mongolia where Temüjin sought spiritual refuge in his youth. Following decades of inter-tribal warfare, he convened a grand kurultai here in 1206, uniting the nomadic confederations and proclaiming the Mongol Empire.',
      routeTitle: 'Campaigns of Genghis Khan',
      routeGroupName: 'The Campaigns of Genghis Khan',
      routeGroupId: 'genghis-khan'
    };

    const locationInfo = {
      id: wp.id,
      name: wp.name,
      canonicalName: wp.canonicalName,
      coordinates: { lat: wp.lat, lng: wp.lng },
      waypoint: wp,
      country: wp.country,
      state: wp.state,
      entityType: wp.entityType,
      description: wp.description,
      historicalContext: wp.context,
      routeTitle: wp.routeTitle,
      routeGroupId: wp.routeGroupId,
      routeContext: { title: wp.routeGroupName, text: wp.context }
    };

    const intent = resolveImageIntent(locationInfo as any);
    const histContext = extractHistoricalImageContext(locationInfo as any);
    const queries = buildHistoricalImageQueries(histContext);
    const derivedAliases = deriveEntityAliases(wp.name, wp.canonicalName, (wp as any).aliases);

    log(`Queries to run (${queries.length}): ${JSON.stringify(queries)}`);
    log(`Derived aliases: ${JSON.stringify(derivedAliases)}`);

    const seenUrls = new Set<string>();

    for (const query of queries) {
      const endpoint = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=8&prop=pageimages|description|coordinates&format=json&pithumbsize=800&origin=*`;
      try {
        const res = await fetch(endpoint);
        const data = await res.json();
        const pages = data.query?.pages;
        if (!pages) continue;

        for (const pageId of Object.keys(pages)) {
          const page = pages[pageId];
          if (pageId === '-1' || !page?.thumbnail?.source) continue;
          if (seenUrls.has(page.thumbnail.source)) continue;
          seenUrls.add(page.thumbnail.source);

          const candidateCoords = page.coordinates && page.coordinates.length > 0
            ? { lat: page.coordinates[0].lat, lng: page.coordinates[0].lon }
            : undefined;

          const candidate = {
            url: page.thumbnail.source,
            title: page.title,
            description: page.description || '',
            caption: page.description || page.title,
            attribution: 'Wikimedia Commons',
            coordinates: candidateCoords
          };

          const evidence = classifyImageEvidence(candidate, {
            name: wp.name,
            canonicalName: wp.canonicalName,
            aliases: (wp as any).aliases
          });

          const geoMismatch = detectGeographicMismatch(candidate, {
            name: wp.name,
            city: histContext.cleanLocationName,
            state: histContext.region,
            country: histContext.country,
            coordinates: locationInfo.coordinates,
            entityType: wp.entityType
          });

          const validation = validateImageCandidate(candidate, locationInfo as any, intent);

          log(`\n[HISTORICAL IMAGE CANDIDATE]`);
          log(`query="${query}"`);
          log(`title="${candidate.title}"`);
          log(`description="${candidate.description}"`);
          log(`source="Wikimedia Commons"`);
          log(`candidateCoordinates=${candidateCoords ? `${candidateCoords.lat},${candidateCoords.lng}` : 'NONE'}`);
          log(`entityMatch=${evidence.entityMatchLevel}`);
          log(`aliasMatch=${evidence.matchedAlias || 'NONE'}`);
          log(`evidenceType=${evidence.evidenceType}`);
          log(`geoMismatch=${geoMismatch.mismatch ? `CONFLICT (${geoMismatch.reason})` : 'MATCH/OK'}`);
          log(`decision=${validation.decision}`);
          log(`score=${validation.score}`);
          log(`reason="${validation.reason}"`);
        }
      } catch (e) {
        log(`Query error for "${query}": ${e}`);
      }
    }

    fs.writeFileSync('/Users/chris/Projects/terra-explorer/scratch_candidates.txt', out);
  }, 30000);
});
