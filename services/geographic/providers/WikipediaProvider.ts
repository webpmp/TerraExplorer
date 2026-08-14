import { MapMarker } from '../../../types';
import { DiscoveryProvider, DiscoveryContext } from './DiscoveryProvider';
import { isLowSignificancePoi } from '../classification';

export class WikipediaProvider implements DiscoveryProvider {
  name = "Wikipedia";
  lastStatus?: 'SUCCESS_WITH_RESULTS' | 'SUCCESS_EMPTY' | 'RATE_LIMITED' | 'TIMEOUT' | 'FAILED';
  lastStatusMessage?: string;

  async searchNearby(context: DiscoveryContext): Promise<MapMarker[]> {
    const { lat, lng, radiusKm } = context;
    const radiusMeters = Math.min(radiusKm * 1000, 10000); // Wikipedia max radius is 10000m
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lng}&gsradius=${radiusMeters}&gslimit=100&format=json&origin=*`;

    const startTime = Date.now();
    try {
      const response = await fetch(url);
      if (!response.ok) {
        this.lastStatus = response.status === 429 ? 'RATE_LIMITED' : 'FAILED';
        this.lastStatusMessage = `HTTP ${response.status}`;
        return [];
      }
      const data = await response.json();

      if (!data || !data.query || !data.query.geosearch) {
        this.lastStatus = 'SUCCESS_EMPTY';
        return [];
      }

      const places: MapMarker[] = [];
      for (const item of data.query.geosearch) {
        if (!item.title || isLowSignificancePoi(item.title)) {
          continue;
        }

        let wType = "landmark";
        if (item.title.match(/,\s*(Texas|Washington|California|Oregon|Hawaii|BC|British Columbia|[A-Z]{2})$/i)) {
          wType = "settlement";
        } else if (item.title.match(/\b(National Park|State Park|Mountain|Mount|Peak|River|Lake|Island|Volcano|Canyon)\b/i)) {
          wType = "natural";
        } else if (item.title.match(/\b(Museum|Monument|Memorial|Castle|Fort|Ruins|Archaeological)\b/i)) {
          wType = "historic";
        }

        const mBaseId = item.title.replace(/\s+/g, '-').toLowerCase();
        places.push({
          id: `wiki-${mBaseId}-${item.lat.toFixed(4)}-${item.lon.toFixed(4)}`,
          name: item.title,
          lat: item.lat,
          lng: item.lon,
          type: wType,
          populationClass: "small",
          provenance: "Wikipedia",
          discoverySignals: ["wikipedia article available"]
        });
      }

      this.lastStatus = places.length > 0 ? 'SUCCESS_WITH_RESULTS' : 'SUCCESS_EMPTY';
      return places;
    } catch (error: any) {
      this.lastStatus = 'FAILED';
      this.lastStatusMessage = error?.message || 'Request failed';
      return [];
    }
  }
}

export const wikipediaProvider = new WikipediaProvider();
