import { MapMarker } from '../../../types';
import { DiscoveryProvider, DiscoveryContext } from './DiscoveryProvider';

export class NominatimProvider implements DiscoveryProvider {
  name = "Nominatim";
  lastStatus?: 'SUCCESS_WITH_RESULTS' | 'SUCCESS_EMPTY' | 'RATE_LIMITED' | 'TIMEOUT' | 'FAILED';
  lastStatusMessage?: string;

  async searchNearby(context: DiscoveryContext): Promise<MapMarker[]> {
    const { lat, lng, radiusKm } = context;
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&zoom=18`;

    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'TerraExplorer/1.0' } });
      if (!response.ok) {
        this.lastStatus = response.status === 429 ? 'RATE_LIMITED' : 'FAILED';
        this.lastStatusMessage = `HTTP ${response.status}`;
        return [];
      }
      const data = await response.json();

      if (!data || !data.name) {
        this.lastStatus = 'SUCCESS_EMPTY';
        return [];
      }

      // Check if it's a valid POI vs an address/administrative area/hamlet. 
      const rejectedTypes = [
        "country", "state", "province", "county", "administrative", 
        "road", "house", "hamlet", "isolated_dwelling", "locality", "farm", "postcode",
        "suburb", "neighbourhood", "building", "residential"
      ];
      if (rejectedTypes.includes(data.category) || rejectedTypes.includes(data.type)) {
          this.lastStatus = 'SUCCESS_EMPTY';
          return [];
      }

      if (data.name && (data.name.toLowerCase().includes('farm-to-market') || data.name.toLowerCase().includes('county road') || data.name.match(/\b(fm|cr)\s*\d+\b/i))) {
          this.lastStatus = 'SUCCESS_EMPTY';
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

      this.lastStatus = 'SUCCESS_WITH_RESULTS';
      return [marker];
    } catch (error: any) {
      this.lastStatus = 'FAILED';
      this.lastStatusMessage = error?.message || 'Request failed';
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export const nominatimProvider = new NominatimProvider();
