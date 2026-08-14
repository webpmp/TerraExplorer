import { Candidate } from '../../../types';
import { DiscoveryProvider, DiscoveryContext } from './DiscoveryProvider';
import { isLowSignificancePoi } from '../classification';
import { DETERMINISTIC_LOCATION_DB } from '../geographicData';

export class RegionalSearchProvider implements DiscoveryProvider {
  name = "RegionalSearchProvider";
  lastStatus?: 'SUCCESS_WITH_RESULTS' | 'SUCCESS_EMPTY' | 'RATE_LIMITED' | 'TIMEOUT' | 'FAILED';
  lastStatusMessage?: string;

  async searchNearby(context: DiscoveryContext): Promise<Candidate[]> {
    const candidates: Candidate[] = [];
    const { country, state, county, municipality, city, town, village, lat, lng } = context;

    const seenIds = new Set<string>();

    const addCandidates = (newCandidates: Candidate[]) => {
      for (const c of newCandidates) {
        if (!c.name || isLowSignificancePoi(c.name, c.type, c.discoverySignals || [])) continue;
        const normKey = `${c.name.toLowerCase().replace(/[^a-z0-9]/g, '')}-${c.coordinates.lat.toFixed(2)}-${c.coordinates.lng.toFixed(2)}`;
        if (!seenIds.has(normKey) && !seenIds.has(c.id)) {
          seenIds.add(normKey);
          seenIds.add(c.id);
          candidates.push(c);
        }
      }
    };

    const fetchNominatim = async (q: string, fallbackType: string, extraTags?: Partial<Candidate>) => {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=10&extratags=1`;
      try {
        const response = await fetch(url, { headers: { 'User-Agent': 'TerraExplorer/1.0' } });
        if (!response.ok) return [];
        const data = await response.json();
        
        return data
          .filter((item: any) => {
            const t = (item.type || item.category || item.addresstype || '').toLowerCase();
            const rejected = [
              'postcode', 'building', 'house', 'road', 'hamlet', 'isolated_dwelling', 'residential', 'suburb',
              'country', 'state', 'province', 'region', 'continent', 'administrative'
            ];
            if (rejected.includes(t)) return false;
            
            const cleanName = (item.name || item.display_name.split(',')[0]).trim();
            if (country && cleanName.toLowerCase() === country.toLowerCase()) return false;
            if (state && cleanName.toLowerCase() === state.toLowerCase()) return false;
            if (county && cleanName.toLowerCase() === county.toLowerCase()) return false;

            // Reject if distance to click is excessively far (> 200km)
            const itemLat = parseFloat(item.lat);
            const itemLon = parseFloat(item.lon);
            if (isNaN(itemLat) || isNaN(itemLon)) return false;
            const dist = Math.sqrt(Math.pow((itemLat - lat) * 111, 2) + Math.pow((itemLon - lng) * 111, 2));
            if (dist > 200) return false;

            return true;
          })
          .map((item: any) => {
            let settlementConfidence = 60;
            const itemType = item.type || item.category || fallbackType;
            if (item.category === 'place' && ['city', 'town', 'village', 'municipality'].includes(item.type)) settlementConfidence += 30;
            if (item.category === 'boundary' && item.type === 'administrative') settlementConfidence += 20;

            const cleanName = item.name || item.display_name.split(',')[0];
            return {
              id: `regional-nom-${item.place_id || item.osm_id}`,
              name: cleanName,
              coordinates: { lat: parseFloat(item.lat), lng: parseFloat(item.lon) },
              type: itemType,
              entityClass: ['city', 'town', 'village', 'municipality'].includes(itemType) ? 'settlement' : undefined,
              providers: [this.name, "Nominatim"],
              rawProviders: { [this.name]: item },
              pipelineStatus: "collected",
              identifiers: { osmId: item.osm_id ? item.osm_id.toString() : undefined },
              settlementConfidence,
              discoverySignals: [`Found by Regional Search for ${q}`],
              ...extraTags
            } as Candidate;
          });
      } catch (err) {
        return [];
      }
    };

    // 1. Spatial check against Deterministic Location DB within 200km
    for (const [key, entry] of Object.entries(DETERMINISTIC_LOCATION_DB)) {
      const dLat = Math.abs(entry.lat - lat);
      const dLng = Math.abs(entry.lng - lng);
      const distKm = Math.sqrt(Math.pow(dLat * 111, 2) + Math.pow(dLng * 111, 2));
      if (distKm <= 200) {
        const cleanName = entry.name.split(',')[0].trim();
        addCandidates([{
          id: `regional-db-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          name: cleanName,
          coordinates: { lat: entry.lat, lng: entry.lng },
          type: entry.entityType || 'city',
          entityClass: 'settlement',
          providers: [this.name, "DeterministicDB"],
          rawProviders: { DeterministicDB: entry },
          pipelineStatus: "collected",
          populationClass: entry.population && entry.population > 100000 ? 'large' : (entry.population && entry.population > 25000 ? 'medium' : 'small'),
          discoverySignals: [`Canonical regional entity (${Math.round(distKm)}km away)`],
          settlementConfidence: 90
        }]);
      }
    }

    // 2. Overpass Query (with graceful timeout handling)
    const overpassQuery = `
      [out:json][timeout:8];
      (
        node["place"~"city|town|village|municipality"](around:150000,${lat},${lng});
        way["place"~"city|town|village|municipality"](around:150000,${lat},${lng});
        rel["place"~"city|town|village|municipality"](around:150000,${lat},${lng});
        node["natural"~"strait|bay|water|sea|peak|volcano|desert|canyon|glacier"](around:150000,${lat},${lng});
        way["natural"~"strait|bay|water|sea|peak|volcano|desert|canyon|glacier"](around:150000,${lat},${lng});
        rel["natural"~"strait|bay|water|sea|peak|volcano|desert|canyon|glacier"](around:150000,${lat},${lng});
        node["waterway"~"river|canal"](around:150000,${lat},${lng});
        way["waterway"~"river|canal"](around:150000,${lat},${lng});
        rel["waterway"~"river|canal"](around:150000,${lat},${lng});
        node["leisure"="nature_reserve"](around:150000,${lat},${lng});
        way["leisure"="nature_reserve"](around:150000,${lat},${lng});
        rel["leisure"="nature_reserve"](around:150000,${lat},${lng});
        node["boundary"="national_park"](around:150000,${lat},${lng});
        way["boundary"="national_park"](around:150000,${lat},${lng});
        rel["boundary"="national_park"](around:150000,${lat},${lng});
      );
      out center 35;
    `;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const ovResponse = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: "data=" + encodeURIComponent(overpassQuery),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (ovResponse.ok) {
        const ovData = await ovResponse.json();
        if (ovData && ovData.elements) {
          const ovCandidates = ovData.elements
            .filter((e: any) => {
              const name = e.tags?.name || e.tags?.['name:en'];
              if (!name) return false;
              if (e.tags.place === 'hamlet' || e.tags.place === 'isolated_dwelling') return false;
              if (country && name.toLowerCase() === country.toLowerCase()) return false;
              if (state && name.toLowerCase() === state.toLowerCase()) return false;
              return true;
            })
            .map((e: any) => {
              const eLat = e.lat ?? e.center?.lat;
              const eLng = e.lon ?? e.center?.lon;
              if (eLat === undefined || eLng === undefined) return null;
              let placeType = e.tags.place || (e.tags.boundary === 'national_park' ? 'national_park' : (e.tags.leisure === 'nature_reserve' ? 'natural' : (e.tags.natural ? e.tags.natural : 'settlement')));
              if (e.tags.natural === 'strait' || e.tags.natural === 'bay' || e.tags.natural === 'water' || e.tags.waterway) {
                placeType = 'water_body';
              }
              const isSettlement = Boolean(e.tags.place);
              return {
                id: `regional-ov-${e.id}`,
                name: e.tags.name || e.tags['name:en'],
                coordinates: { lat: eLat, lng: eLng },
                type: placeType,
                entityClass: isSettlement ? 'settlement' : (placeType === 'water_body' || placeType === 'natural_feature' ? 'geographic_feature' : undefined),
                providers: [this.name, "Overpass"],
                rawProviders: { [this.name]: e },
                pipelineStatus: "collected",
                settlementConfidence: isSettlement ? (50 + (e.tags.population ? 20 : (placeType === 'city' || placeType === 'town' ? 20 : 0))) : 0,
                discoverySignals: ["coordinate-based regional place query"]
              } as Candidate;
            })
            .filter(Boolean);
          addCandidates(ovCandidates as Candidate[]);
        }
      }
    } catch (e) {
      // Overpass failure is captured gracefully in diagnostics
    }

    // 3. Multi-Offset Wikipedia Geosearch (Covers ~100km radius around click)
    const offsetD = 0.45; // ~50 km offset
    const searchGrid = [
      { lat, lng },
      { lat: lat + offsetD, lng },
      { lat: lat - offsetD, lng },
      { lat, lng: lng + offsetD },
      { lat, lng: lng - offsetD }
    ];

    try {
      const wikiPromises = searchGrid.map(async (pt) => {
        const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${pt.lat}|${pt.lng}&gsradius=10000&gslimit=15&format=json&origin=*`;
        try {
          const res = await fetch(wikiUrl);
          if (!res.ok) return [];
          const data = await res.json();
          if (!data?.query?.geosearch) return [];
          return data.query.geosearch
            .filter((item: any) => {
              if (!item.title) return false;
              if (item.title.match(/mine|quarry|claim|creek|road|bridge|school|station|parish/i)) return false;
              // Reject non-geographic events, conflicts, insurgencies, topics, elections
              if (item.title.match(/\b(insurgency|uprising|rebellion|revolution|war|battle|conflict|offensive|siege|campaign|massacre|crisis|protest|riot|incident|accord|treaty|election|referendum|coup|strike|bombing|assassination|movement|dynasty|regime)\b/i)) return false;
              if (country && item.title.toLowerCase() === country.toLowerCase()) return false;
              if (state && item.title.toLowerCase() === state.toLowerCase()) return false;
              return true;
            })
            .map((item: any) => {
              let wType = "landmark";
              if (item.title.match(/\b(Strait|Sea|Gulf|Bay|Channel|Ocean|Sound|River|Lake|Reservoir)\b/i)) {
                wType = "water_body";
              } else if (item.title.match(/\b(National Park|State Park|National Monument|Park|Reserve)\b/i)) {
                wType = item.title.includes('Park') ? 'national_park' : 'natural_feature';
              } else if (item.title.match(/\b(Mountain|Mount|Peak|Volcano|Range|Desert|Canyon|Gorge|Island|Isle)\b/i)) {
                wType = item.title.match(/\b(Island|Isle)\b/i) ? 'island' : (item.title.match(/\b(Mountain|Mount|Peak|Volcano)\b/i) ? 'mountain' : 'natural_feature');
              } else if (item.title.match(/,\s*(Costa Rica|Nicaragua|Honduras|Texas|Washington|California|Australia|Queensland|Western Cape|Iran|Yemen|Oman|Madagascar|[A-Z]{2})$/i)) {
                wType = "settlement";
              }
              return {
                id: `regional-wiki-${item.pageid}`,
                name: item.title,
                coordinates: { lat: parseFloat(item.lat), lng: parseFloat(item.lon) },
                type: wType,
                providers: [this.name, "Wikipedia"],
                rawProviders: { [this.name]: item },
                pipelineStatus: "collected",
                discoverySignals: ["Wikipedia regional multi-point geosearch"]
              } as Candidate;
            });
        } catch (e) {
          return [];
        }
      });

      const wikiResults = await Promise.all(wikiPromises);
      wikiResults.forEach(addCandidates);
    } catch (e) {
      // Handled gracefully
    }

    // 4. Structured Regional Settlement Searches
    const settlementQueries = [
      village ? { q: `${village}, ${state || country}`, type: 'village' } : null,
      town ? { q: `${town}, ${state || country}`, type: 'town' } : null,
      city ? { q: `${city}, ${state || country}`, type: 'city' } : null,
      municipality ? { q: `${municipality}, ${state || country}`, type: 'municipality' } : null,
      county ? { q: `${county} seat, ${state || country}`, type: 'city' } : null,
      county ? { q: `cities in ${county}, ${state || country}`, type: 'city' } : null,
      county ? { q: `towns in ${county}, ${state || country}`, type: 'town' } : null,
      state ? { q: `cities in ${state}, ${country || ''}`, type: 'city' } : null,
    ].filter(Boolean) as Array<{ q: string; type: string }>;

    try {
      const nomResults = await Promise.all(
        settlementQueries.slice(0, 6).map(item => fetchNominatim(item.q, item.type, { 
          discoverySignals: [`Regional settlement search for ${item.q}`],
          entityClass: 'settlement'
        }))
      );
      nomResults.forEach(addCandidates);
    } catch (e) {
      // Handled gracefully
    }

    // 5. Bounded Box City/Town Search in Nominatim (~100km box)
    try {
      const bboxUrl = `https://nominatim.openstreetmap.org/search?q=city+OR+town&format=jsonv2&viewbox=${(lng - 1.0).toFixed(4)},${(lat + 1.0).toFixed(4)},${(lng + 1.0).toFixed(4)},${(lat - 1.0).toFixed(4)}&bounded=1&limit=10&extratags=1`;
      const bboxRes = await fetch(bboxUrl, { headers: { 'User-Agent': 'TerraExplorer/1.0' } });
      if (bboxRes.ok) {
        const bboxData = await bboxRes.json();
        const bboxCandidates = (bboxData || [])
          .filter((item: any) => {
            const t = (item.type || item.category || '').toLowerCase();
            const cleanName = (item.name || item.display_name.split(',')[0]).trim();
            if (country && cleanName.toLowerCase() === country.toLowerCase()) return false;
            if (state && cleanName.toLowerCase() === state.toLowerCase()) return false;
            if (county && cleanName.toLowerCase() === county.toLowerCase()) return false;
            return ['city', 'town', 'village', 'municipality'].includes(t) || item.category === 'place';
          })
          .map((item: any) => {
            const cleanName = (item.name || item.display_name.split(',')[0]).trim();
            return {
              id: `regional-nom-bbox-${item.place_id || item.osm_id}`,
              name: cleanName,
              coordinates: { lat: parseFloat(item.lat), lng: parseFloat(item.lon) },
              type: item.type || 'city',
              entityClass: 'settlement',
              providers: [this.name, "Nominatim"],
              rawProviders: { [this.name]: item },
              pipelineStatus: "collected",
              identifiers: { osmId: item.osm_id ? item.osm_id.toString() : undefined },
              settlementConfidence: 80,
              discoverySignals: ["Bounded spatial city search in Nominatim"]
            } as Candidate;
          });
        addCandidates(bboxCandidates);
      }
    } catch (e) {
      // Handled gracefully
    }

    // 6. Wikipedia City / Settlement Article Search
    if (state || county || country) {
      const citySearchTopic = county ? `List of cities in ${county} ${state || country}` : `List of cities in ${state || country}`;
      try {
        const citySearchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(citySearchTopic)}&srlimit=8&format=json&origin=*`;
        const csRes = await fetch(citySearchUrl);
        if (csRes.ok) {
          const csData = await csRes.json();
          const titles = (csData?.query?.search || []).map((s: any) => s.title).filter(Boolean);
          if (titles.length > 0) {
            const coordUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles.join('|'))}&prop=coordinates&format=json&origin=*`;
            const coordRes = await fetch(coordUrl);
            if (coordRes.ok) {
              const coordData = await coordRes.json();
              const pages = coordData?.query?.pages || {};
              for (const pId of Object.keys(pages)) {
                const page = pages[pId];
                if (page.coordinates && page.coordinates[0]) {
                  const pLat = page.coordinates[0].lat;
                  const pLng = page.coordinates[0].lon;
                  const dist = Math.sqrt(Math.pow(pLat - lat, 2) + Math.pow(pLng - lng, 2)) * 111;
                  if (dist <= 150 && !page.title.toLowerCase().includes('list of') && !page.title.toLowerCase().includes('county')) {
                    const cleanName = page.title.split(',')[0].trim();
                    addCandidates([{
                      id: `regional-wikicity-${page.pageid}`,
                      name: cleanName,
                      coordinates: { lat: pLat, lng: pLng },
                      type: 'city',
                      entityClass: 'settlement',
                      providers: [this.name, "Wikipedia"],
                      rawProviders: { [this.name]: page },
                      pipelineStatus: "collected",
                      discoverySignals: [`Wikipedia regional city search: ${citySearchTopic}`]
                    }]);
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        // Handled gracefully
      }
    }

    // 7. Wikipedia Text Search for Regional Landmarks & Parks with Coordinates
    if (country || state) {
      const queryTopic = state ? `${state} National Park` : `${country} National Park`;
      try {
        const textSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(queryTopic)}&srlimit=5&format=json&origin=*`;
        const tsRes = await fetch(textSearchUrl);
        if (tsRes.ok) {
          const tsData = await tsRes.json();
          const titles = (tsData?.query?.search || []).map((s: any) => s.title).filter(Boolean);
          if (titles.length > 0) {
            const coordUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles.join('|'))}&prop=coordinates&format=json&origin=*`;
            const coordRes = await fetch(coordUrl);
            if (coordRes.ok) {
              const coordData = await coordRes.json();
              const pages = coordData?.query?.pages || {};
              for (const pId of Object.keys(pages)) {
                const page = pages[pId];
                if (page.coordinates && page.coordinates[0]) {
                  const pLat = page.coordinates[0].lat;
                  const pLng = page.coordinates[0].lon;
                  const dist = Math.sqrt(Math.pow(pLat - lat, 2) + Math.pow(pLng - lng, 2)) * 111;
                  if (dist <= 200) {
                    addCandidates([{
                      id: `regional-wikitext-${page.pageid}`,
                      name: page.title,
                      coordinates: { lat: pLat, lng: pLng },
                      type: page.title.includes('Park') ? 'national_park' : 'natural_feature',
                      providers: [this.name, "Wikipedia"],
                      rawProviders: { [this.name]: page },
                      pipelineStatus: "collected",
                      discoverySignals: [`Wikipedia regional landmark search: ${queryTopic}`]
                    }]);
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        // Handled gracefully
      }
    }

    const cityCandidates = candidates.filter(c => c.entityClass === 'settlement' || ['city', 'town', 'village', 'municipality'].includes(c.type));
    console.log(`[City Discovery]\nlocation: ${lat.toFixed(4)}, ${lng.toFixed(4)}\nradius: 150 km\ncandidates found: ${cityCandidates.length}` +
      (cityCandidates.length > 0 ? '\n' + cityCandidates.map(c => `  - ${c.name} | ${c.type} | ${(c.distanceKm ?? Math.sqrt(Math.pow((c.coordinates.lat - lat)*111, 2) + Math.pow((c.coordinates.lng - lng)*111, 2))).toFixed(1)} km | ${c.providers.join(', ')}`).join('\n') : ''));

    this.lastStatus = candidates.length > 0 ? 'SUCCESS_WITH_RESULTS' : 'SUCCESS_EMPTY';
    return candidates;
  }
}

export const regionalSearchProvider = new RegionalSearchProvider();

