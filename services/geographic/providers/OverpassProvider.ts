import { DiscoveryProvider, DiscoveryContext } from './DiscoveryProvider';
import { MapMarker } from '../../../types';

interface CacheEntry {
  result: MapMarker[];
  timestamp: number;
}

const overpassCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

export class OverpassProvider implements DiscoveryProvider {
  name = "OpenStreetMap";
  lastStatus?: 'SUCCESS_WITH_RESULTS' | 'SUCCESS_EMPTY' | 'RATE_LIMITED' | 'TIMEOUT' | 'FAILED';
  lastStatusMessage?: string;

  private async fetchOverpass(query: string, timeoutMs: number): Promise<any> {
    const endpoints = [
      "https://lz4.overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
      "https://overpass-api.de/api/interpreter"
    ];

    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Use Promise.any to race the endpoints and take the first successful one
      const response = await Promise.any(endpoints.map(async endpoint => {
        const res = await fetch(endpoint, {
          method: "POST",
          body: "data=" + encodeURIComponent(query),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          signal: controller.signal
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return { data, endpoint };
      }));
      
      controller.abort(); // Abort remaining requests
      this.lastStatus = response.data?.elements?.length > 0 ? 'SUCCESS_WITH_RESULTS' : 'SUCCESS_EMPTY';
      this.lastStatusMessage = undefined;
      return response.data;
    } catch (error: any) {
      const errStr = String(error?.message || error || '');
      if (errStr.includes('429')) {
        this.lastStatus = 'RATE_LIMITED';
        this.lastStatusMessage = 'HTTP 429 Too Many Requests';
      } else if (errStr.includes('abort') || errStr.includes('timeout')) {
        this.lastStatus = 'TIMEOUT';
        this.lastStatusMessage = 'Request timed out';
      } else {
        this.lastStatus = 'FAILED';
        this.lastStatusMessage = errStr || 'Endpoint request failed';
      }
      return { elements: [] };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async searchNearby(context: DiscoveryContext): Promise<MapMarker[]> {
    const { lat, lng, radiusKm, categoryFilter = 'all' } = context;
    const latRounded = lat.toFixed(4);
    const lngRounded = lng.toFixed(4);
    const cacheKey = `${latRounded},${lngRounded},${radiusKm},${categoryFilter}`;

    const cached = overpassCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      this.lastStatus = cached.result.length > 0 ? 'SUCCESS_WITH_RESULTS' : 'SUCCESS_EMPTY';
      return cached.result;
    }

    const radiusMeters = radiusKm * 1000;
    
    let subQueries = '';
    if (categoryFilter === 'settlements' || categoryFilter === 'all') {
      subQueries += `nwr["place"~"city|town|village|municipality|capital"](around:${radiusMeters},${lat},${lng});\n`;
    }
    if (categoryFilter === 'features' || categoryFilter === 'all') {
      subQueries += `
        nwr["natural"~"peak|water|bay|beach|lake|river|volcano|desert|forest|glacier|waterfall|canyon"](around:${radiusMeters},${lat},${lng});
        nwr["leisure"~"nature_reserve|park"](around:${radiusMeters},${lat},${lng});
        nwr["historic"~"monument|archaeological_site|ruins|castle|memorial|shipwreck"](around:${radiusMeters},${lat},${lng});
        nwr["tourism"~"museum|attraction|theme_park"](around:${radiusMeters},${lat},${lng});
        nwr["boundary"="national_park"](around:${radiusMeters},${lat},${lng});
        nwr["aeroway"="aerodrome"](around:${radiusMeters},${lat},${lng});
        nwr["man_made"~"lighthouse|observatory|bridge|dam"](around:${radiusMeters},${lat},${lng});
      `;
    }

    const query = `
      [out:json][timeout:10];
      (
        ${subQueries}
      );
      out center 150;
    `;

    let data: any = null;
    try {
      data = await this.fetchOverpass(query, 10000); // 10 second timeout
      if (!data || !data.elements || data.elements.length === 0) {
          return [];
      }
    } catch (e) {
      throw e;
    }

    const candidates: any[] = [];
    const seenNames = new Set<string>();
    const MIN_DISTANCE_KM = 0.5;

    if (data && data.elements) {
      for (const element of data.elements) {
        const name = element.tags?.name || element.tags?.['name:en'];
        if (!name) continue;

        // Skip unnamed or overly generic names like "Bench"
        if (name.toLowerCase() === 'bench' || name.toLowerCase() === 'tree') continue;
        if (element.tags?.place === 'hamlet' || element.tags?.place === 'isolated_dwelling') continue;

        const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (seenNames.has(normalizedName)) continue;

        const elLat = element.lat || element.center?.lat;
        const elLon = element.lon || element.center?.lon;
        if (elLat === undefined || elLon === undefined) continue;

        const distKmToClick = Math.sqrt(Math.pow((elLat - lat) * 111, 2) + Math.pow((elLon - lng) * 111, 2));
        if (distKmToClick > radiusKm) continue;

        // Ensure we don't have extremely close duplicates BEFORE scoring
        let isProxDuplicate = false;
        for (const existing of candidates) {
            const eLatDiff = Math.abs(existing.lat - elLat);
            const eLngDiff = Math.abs(existing.lng - elLon);
            const distKm = Math.sqrt(Math.pow(eLatDiff * 111, 2) + Math.pow(eLngDiff * 111, 2));
            if (distKm < MIN_DISTANCE_KM) {
                // If it's a proxy duplicate, maybe keep the one with more tags, but for now just skip
                isProxDuplicate = true;
                break;
            }
        }
        if (isProxDuplicate) continue;

        const tags = element.tags;
        
        let type = "poi";
        if (tags.place) type = tags.place;
        else if (tags.boundary === 'national_park') type = 'national_park';
        else if (tags.natural) type = tags.natural;
        else if (tags.leisure) type = tags.leisure;
        else if (tags.historic) type = tags.historic;
        else if (tags.tourism) type = tags.tourism;
        else if (tags.man_made) type = tags.man_made;
        else if (tags.aeroway) type = 'airport';

        let category = 'infrastructure';
        if (['city', 'town', 'village', 'capital', 'hamlet'].includes(type)) {
            category = 'place';
        } else if (tags.natural || tags.boundary === 'national_park' || tags.leisure === 'nature_reserve') {
            category = 'natural';
        } else if (tags.historic || tags.tourism || tags.leisure === 'park') {
            category = 'poi';
        }

        let populationClass: 'large' | 'medium' | 'small' = 'small';
        if (type === 'city') populationClass = 'large';
        if (type === 'town') populationClass = 'medium';

        // Scoring
        let score = 0;
        
        // Boosts for interestingness
        if (tags.historic) score += 60;
        if (tags.tourism === 'museum' || tags.tourism === 'attraction') score += 50;
        if (tags.heritage || tags['heritage:operator'] === 'UNESCO') score += 100;
        if (tags.natural && ['volcano', 'glacier', 'canyon', 'waterfall'].includes(tags.natural)) score += 80;
        
        // Boosts for significance
        if (tags.wikipedia) score += 50;
        if (tags.wikidata) score += 30;
        if (tags.population) {
            const pop = parseInt(tags.population, 10);
            if (!isNaN(pop) && pop > 0) {
                // Logarithmic boost up to +60
                score += Math.min(60, Math.log10(pop) * 10);
            }
        }
        if (tags.place === 'city' || tags.place === 'capital') score += 40;
        if (tags.boundary === 'national_park') score += 90;

        // Penalties
        if (tags.historic === 'memorial') score -= 30;
        if (tags.tourism === 'artwork') score -= 50;
        if (tags.amenity === 'bench') score -= 100;
        if (tags.power || tags.telecom || tags.utility) score -= 100;

        const discoverySignals: string[] = [];
        if (tags.historic) discoverySignals.push(`historical significance (${tags.historic})`);
        if (tags.tourism) discoverySignals.push(`tourism (${tags.tourism})`);
        if (tags.natural) discoverySignals.push(`natural feature (${tags.natural})`);
        if (tags.boundary === 'national_park') discoverySignals.push('national park');
        if (tags.heritage) discoverySignals.push('heritage site');
        if (tags.wikipedia) discoverySignals.push('wikipedia article available');
        if (tags.wikidata) discoverySignals.push('wikidata available');
        if (tags.religion) discoverySignals.push(`religious significance (${tags.religion})`);
        if (tags.sport) discoverySignals.push(`sports (${tags.sport})`);
        if (tags.water) discoverySignals.push(`water feature (${tags.water})`);
        if (tags.geological) discoverySignals.push(`geological feature (${tags.geological})`);
        if (tags.man_made) discoverySignals.push(`man-made structure (${tags.man_made})`);

        const mBaseId = name.replace(/\s+/g, '-').toLowerCase();
        
        let populationInfo;
        if (tags.population) {
            const popVal = parseInt(tags.population, 10);
            if (!isNaN(popVal)) {
                populationInfo = {
                    value: popVal,
                    source: "OpenStreetMap",
                    status: "available"
                };
            }
        }
        
        candidates.push({
          marker: {
              id: `nearby-${mBaseId}-${elLat.toFixed(4)}-${elLon.toFixed(4)}`,
              osmId: element.id ? element.id.toString() : undefined,
              osmType: element.type,
              wikidataId: tags.wikidata,
              wikipedia: tags.wikipedia,
              population: populationInfo,
              tags: tags,
              name,
              lat: elLat,
              lng: elLon,
              type,
              populationClass,
              provenance: "OpenStreetMap",
              discoverySignals
          },
          score,
          category,
          normalizedName
        });
        
        seenNames.add(normalizedName);
      }
    }

    // Adaptive Diversification
    const places: MapMarker[] = [];
    if (context.categoryFilter === 'settlements') {
        // Return all settlement candidates up to 35
        for (const c of candidates.slice(0, 35)) {
            places.push(c.marker);
        }
    } else {
        const N_RESULTS = 10;
        const categoryCounts: Record<string, number> = { 'place': 0, 'natural': 0, 'poi': 0, 'infrastructure': 0 };

        while (places.length < N_RESULTS && candidates.length > 0) {
            // Sort current candidates by score descending
            candidates.sort((a, b) => b.score - a.score);
            
            // Pick the top candidate
            const topCandidate = candidates.shift()!;
            places.push(topCandidate.marker);
            categoryCounts[topCandidate.category]++;

            // Penalize remaining candidates of the same category
            for (const candidate of candidates) {
                if (candidate.category === topCandidate.category) {
                    candidate.score -= 30; // Adaptive penalty
                }
            }
        }
    }

    const cityCandidates = places.filter(p => ['city', 'town', 'village', 'municipality'].includes(p.type));
    console.log(`[City Discovery - OverpassProvider]\nlocation: ${lat.toFixed(4)}, ${lng.toFixed(4)}\nradius: ${radiusKm} km\ncandidates found: ${cityCandidates.length}` +
      (cityCandidates.length > 0 ? '\n' + cityCandidates.map(c => `  - ${c.name} | ${c.type} | ${(Math.sqrt(Math.pow((c.lat - lat)*111, 2) + Math.pow((c.lng - lng)*111, 2))).toFixed(1)} km`).join('\n') : ''));

    overpassCache.set(cacheKey, { result: places, timestamp: Date.now() });
    
    if (overpassCache.size > 1000) {
      const firstKey = overpassCache.keys().next().value;
      if (firstKey) overpassCache.delete(firstKey);
    }

    this.lastStatus = places.length > 0 ? 'SUCCESS_WITH_RESULTS' : 'SUCCESS_EMPTY';
    return places;
  }
}

export const overpassProvider = new OverpassProvider();
