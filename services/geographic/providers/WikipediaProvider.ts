import { MapMarker } from '../../../types';
import { DiscoveryProvider, DiscoveryContext } from './DiscoveryProvider';

export class WikipediaProvider implements DiscoveryProvider {
  name = "Wikipedia";

  async searchNearby(context: DiscoveryContext): Promise<MapMarker[]> {
    const { lat, lng, radiusKm } = context;
    const radiusMeters = Math.min(radiusKm * 1000, 10000); // Wikipedia max radius is 10000m
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lng}&gsradius=${radiusMeters}&gslimit=100&format=json&origin=*`;

    const startTime = Date.now();
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      
      const elapsed = Date.now() - startTime;
      console.log(`[WIKIPEDIA TRACE] {\n  endpoint: "geosearch",\n  elapsedMs: ${elapsed},\n  resultCount: ${data.query?.geosearch?.length || 0},\n  status: "SUCCESS"\n}`);

      if (!data || !data.query || !data.query.geosearch) {
        return [];
      }

      const places: MapMarker[] = data.query.geosearch.map((item: any) => {
        const mBaseId = item.title.replace(/\s+/g, '-').toLowerCase();
        return {
          id: `wiki-${mBaseId}-${item.lat.toFixed(4)}-${item.lon.toFixed(4)}`,
          name: item.title,
          lat: item.lat,
          lng: item.lon,
          type: "landmark",
          populationClass: "small",
          provenance: "Wikipedia",
          discoverySignals: ["wikipedia article available"]
        };
      });

      return places;
    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      console.warn(`[WIKIPEDIA TRACE] {\n  endpoint: "geosearch",\n  elapsedMs: ${elapsed},\n  error: "${error.message}",\n  status: "FAILURE"\n}`);
      throw error;
    }
  }
}

export const wikipediaProvider = new WikipediaProvider();
