import { describe, it } from 'vitest';
import {
  validateImageCandidate,
  resolveImageIntent,
  extractHistoricalImageContext,
  buildHistoricalImageQueries
} from '../imageService';
import { DEFAULT_GENGHIS_ROUTE } from '../../App';

describe('Diagnostic Real Candidate Evaluation', () => {
  const wp1 = DEFAULT_GENGHIS_ROUTE.waypoints![0];

  it('fetches real Wikipedia candidates for Burkhan Khaldun and runs matcher', async () => {
    const locationInfo1 = {
      id: wp1.id,
      name: wp1.name, // "Burkhan Khaldun (Mongolia)"
      canonicalName: wp1.canonicalName, // "Burkhan Khaldun"
      coordinates: { lat: wp1.lat, lng: wp1.lng },
      waypoint: wp1,
      country: 'Mongolia',
      state: 'Khentii',
      entityType: 'historical_waypoint',
      description: wp1.description,
      historicalContext: wp1.context,
      routeTitle: wp1.routeTitle,
      routeGroupId: wp1.routeGroupId,
      routeContext: { title: wp1.routeGroupName, text: wp1.context }
    };

    const intent = resolveImageIntent(locationInfo1);
    const histContext = extractHistoricalImageContext(locationInfo1);
    const queries = buildHistoricalImageQueries(histContext);

    console.log('\n========================================');
    console.log('REAL WIKIPEDIA SEARCH FOR BURKHAN KHALDUN');
    console.log('Queries to run:', queries.slice(0, 5));
    console.log('========================================\n');

    for (const query of queries.slice(0, 5)) {
      const endpoint = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=6&prop=pageimages|description|coordinates&format=json&pithumbsize=800&origin=*`;
      try {
        const res = await fetch(endpoint);
        const data = await res.json();
        const pages = data.query?.pages;
        if (!pages) {
          console.log(`Query "${query}": No pages returned.`);
          continue;
        }

        console.log(`\n--- Results for Query: "${query}" ---`);
        for (const pageId of Object.keys(pages)) {
          const page = pages[pageId];
          if (pageId === '-1' || !page?.thumbnail?.source) continue;

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

          const validation = validateImageCandidate(candidate, locationInfo1, intent);

          console.log(`\n[HISTORICAL IMAGE CANDIDATE]`);
          console.log(`query="${query}"`);
          console.log(`title="${candidate.title}"`);
          console.log(`description="${candidate.description}"`);
          console.log(`candidateCoordinates=${candidateCoords ? `${candidateCoords.lat},${candidateCoords.lng}` : 'NONE'}`);
          console.log(`decision=${validation.decision}`);
          console.log(`score=${validation.score}`);
          console.log(`reason="${validation.reason}"`);
        }
      } catch (err) {
        console.error('Fetch error:', err);
      }
    }
  });
});
