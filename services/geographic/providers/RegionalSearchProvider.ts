import { Candidate } from '../../../types';
import { DiscoveryProvider, DiscoveryContext } from './DiscoveryProvider';

export class RegionalSearchProvider implements DiscoveryProvider {
  name = "RegionalSearchProvider";

  async searchNearby(context: DiscoveryContext): Promise<Candidate[]> {
    const candidates: Candidate[] = [];
    const { country, state, county, municipality, lat, lng } = context;

    const seenIds = new Set<string>();

    const fetchNominatim = async (q: string, type: string, extraTags?: Partial<Candidate>) => {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=5`;
        try {
            const response = await fetch(url);
            if (!response.ok) return [];
            const data = await response.json();
            
            return data.map((item: any) => {
                let settlementConfidence = 0;
                if (item.category === 'place' && ['city', 'town', 'village'].includes(item.type)) settlementConfidence += 50;
                if (item.category === 'boundary' && item.type === 'administrative') settlementConfidence += 30;

                return {
                    id: `regional-${item.place_id || item.osm_id}`,
                    name: item.name || item.display_name.split(',')[0],
                    coordinates: { lat: parseFloat(item.lat), lng: parseFloat(item.lon) },
                    type: type,
                    providers: [this.name],
                    rawProviders: { [this.name]: item },
                    pipelineStatus: "collected",
                    identifiers: { osmId: item.osm_id ? item.osm_id.toString() : undefined },
                    settlementConfidence,
                    discoverySignals: [`Found by Regional Search for ${q}`],
                    ...extraTags
                } as Candidate;
            });
        } catch (err) {
            console.warn(`[RegionalSearchProvider] Failed querying "${q}"`, err);
            return [];
        }
    };

    const addCandidates = (newCandidates: Candidate[]) => {
        for (const c of newCandidates) {
            if (!seenIds.has(c.id)) {
                seenIds.add(c.id);
                candidates.push(c);
            }
        }
    };

    try {
        // 1. Reverse Geocode Hierarchy Expansion (Find the actual towns/counties returned by the geocoder)
        const hierarchyQueries = [];
        if (municipality) hierarchyQueries.push({ q: `${municipality}`, type: 'town', sig: 'hierarchy: municipality' });
        if (county) hierarchyQueries.push({ q: `${county}`, type: 'administrative', sig: 'hierarchy: county' });
        if (state) hierarchyQueries.push({ q: `${state}`, type: 'administrative', sig: 'hierarchy: state' });

        const hierarchyResults = await Promise.all(hierarchyQueries.map(h => fetchNominatim(h.q, h.type, { discoverySignals: [h.sig] })));
        hierarchyResults.forEach(addCandidates);

        // 2. Coordinate-based Place Queries (Overpass) for settlements up to 50km
        const overpassQuery = `
          [out:json][timeout:10];
          (
            node["place"~"city|town|village"](around:50000,${lat},${lng});
          );
          out center 10;
        `;
        try {
            const ovResponse = await fetch("https://overpass-api.de/api/interpreter", {
                method: "POST",
                body: "data=" + encodeURIComponent(overpassQuery),
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
            });
            if (ovResponse.ok) {
                const ovData = await ovResponse.json();
                if (ovData && ovData.elements) {
                    const ovCandidates = ovData.elements.filter((e:any) => e.tags?.name).map((e: any) => ({
                        id: `regional-ov-${e.id}`,
                        name: e.tags.name,
                        coordinates: { lat: e.lat, lng: e.lon },
                        type: e.tags.place,
                        providers: [this.name, "Overpass"],
                        rawProviders: { [this.name]: e },
                        pipelineStatus: "collected",
                        settlementConfidence: 50 + (e.tags.population ? 20 : 0),
                        discoverySignals: ["coordinate-based place query"]
                    } as Candidate));
                    addCandidates(ovCandidates);
                }
            }
        } catch (e) {
            console.warn(`[RegionalSearchProvider] Coordinate-based query failed`, e);
        }

        // Wikipedia local coordinate fallback (10km)
        try {
            const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lng}&gsradius=10000&gslimit=10&format=json&origin=*`;
            const wikiResponse = await fetch(wikiUrl);
            if (wikiResponse.ok) {
                const wikiData = await wikiResponse.json();
                if (wikiData?.query?.geosearch) {
                    const wikiCandidates = wikiData.query.geosearch.map((item: any) => ({
                        id: `regional-wiki-${item.pageid}`,
                        name: item.title,
                        coordinates: { lat: parseFloat(item.lat), lng: parseFloat(item.lon) },
                        type: 'poi',
                        providers: [this.name, "Wikipedia"],
                        rawProviders: { [this.name]: item },
                        pipelineStatus: "collected",
                        discoverySignals: ["Wikipedia local search"]
                    } as Candidate));
                    addCandidates(wikiCandidates);
                }
            }
        } catch (e) {}

        // 3. Administrative Fallback (if settlement count is low)
        const settlementCount = candidates.filter(c => ['city', 'town', 'village', 'administrative'].includes(c.type)).length;
        if (settlementCount < 3 && county && state) {
            console.log(`[RegionalSearchProvider] settlementCount is ${settlementCount}. Triggering administrative fallback.`);
            const adminQueries = [
                { q: `county seat of ${county}, ${state}`, type: 'city', sig: 'administrative fallback' },
                { q: `capital of ${state}`, type: 'city', sig: 'administrative fallback' }
            ];
            const adminResults = await Promise.all(adminQueries.map(h => fetchNominatim(h.q, h.type, { discoverySignals: [h.sig] })));
            adminResults.forEach(addCandidates);
        }

        // 4. Broad Text Search Last Resort
        if (candidates.length < 2 && country) {
            const fallbackResults = await fetchNominatim(`major cities in ${country}`, 'city', { discoverySignals: ['country text search fallback'] });
            addCandidates(fallbackResults);
        }

        console.log(`[REGIONAL SEARCH TRACE] {\n  results: ${candidates.length}\n}`);
    } catch (e) {
        console.warn(`[REGIONAL SEARCH TRACE] Failed overall: ${e}`);
    }

    return candidates;
  }
}

export const regionalSearchProvider = new RegionalSearchProvider();
