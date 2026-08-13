import { MapMarker } from '../../../types';
import { DiscoveryProvider, DiscoveryContext } from './DiscoveryProvider';

export class NominatimProvider implements DiscoveryProvider {
  name = "Nominatim";

  async searchNearby(context: DiscoveryContext): Promise<MapMarker[]> {
    const { lat, lng, radiusKm } = context;
    // Nominatim doesn't have a good pure radius search without building a complex bounding box
    // and using special endpoints. But we can use the reverse endpoint and then search around it,
    // or use the standard search with viewbox.
    // However, for POI discovery, Nominatim is quite limited. 
    // We'll use a bounding box search.
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&zoom=18`;

    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'TerraExplorer/1.0' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      
      const elapsed = Date.now() - startTime;
      console.log(`[NOMINATIM TRACE] {\n  endpoint: "reverse",\n  elapsedMs: ${elapsed},\n  resultCount: ${data.name ? 1 : 0},\n  status: "SUCCESS"\n}`);

      if (!data || !data.name) {
        return [];
      }

      // Check if it's a valid POI vs an address/administrative area. 
      // Nominatim provides `category` and `type`.
      const rejectedTypes = ["country", "state", "province", "county", "municipality", "administrative", "road", "house"];
      if (rejectedTypes.includes(data.category) || rejectedTypes.includes(data.type)) {
          // It is not a POI.
          return [];
      }

      const mBaseId = data.name.replace(/\s+/g, '-').toLowerCase();
      const marker: MapMarker = {
        id: `nom-${mBaseId}-${parseFloat(data.lat).toFixed(4)}-${parseFloat(data.lon).toFixed(4)}`,
        name: data.name,
        lat: parseFloat(data.lat),
        lng: parseFloat(data.lon),
        type: data.type || "poi",
        populationClass: "small",
        provenance: "Nominatim",
        discoverySignals: ["nominatim POI"]
      };

      return [marker];
    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      console.warn(`[NOMINATIM TRACE] {\n  endpoint: "reverse",\n  elapsedMs: ${elapsed},\n  error: "${error.message}",\n  status: "FAILURE"\n}`);
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export const nominatimProvider = new NominatimProvider();
