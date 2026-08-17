import { normalizeEnglishDisplayName } from '../../utils/englishNameNormalization';
import { getFallbackFeaturesForViewport } from './osmFallbackData';

export type OSMFeatureType =
  | 'boundary'
  | 'road_motorway'
  | 'road_primary'
  | 'road_secondary'
  | 'road_street'
  | 'waterway'
  | 'water'
  | 'park'
  | 'place_city'
  | 'place_town'
  | 'place_village'
  | 'place_neighborhood';

export type OSMMapDetailLevel = 'global' | 'regional' | 'local' | 'close' | 'street' | 'street_close';

export interface ViewportExtent {
  centerLat: number;
  centerLng: number;
  distance: number;
  detailLevel: OSMMapDetailLevel;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

interface CacheItem {
  features: OSMVectorFeature[];
  source: 'overpass' | 'fallback';
  timestamp: number;
}

interface EndpointHealth {
  url: string;
  consecutiveFailures: number;
  lastFailureAt: number;
  cooldownUntil: number;
}

const NON_PHYSICAL_PATTERNS = [
  /\binsurgency\b/i,
  /\bconflict\b/i,
  /\bwar\b/i,
  /\bbattle\b/i,
  /\btreaty\b/i,
  /\brevolution\b/i,
  /\bmovement\b/i,
  /\borganization\b/i,
  /\bincident\b/i,
  /\bprotest\b/i,
  /\brebellion\b/i,
  /\bmilitia\b/i,
  /\boperation\b/i,
  /\bcrisis\b/i,
  /\belection\b/i
];

const INITIAL_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];

export class OSMMapDataProvider {
  private cache = new Map<string, CacheItem>();
  private maxCacheEntries = 150;
  private cacheTTLMs = 24 * 60 * 60 * 1000; // 24 hours
  private globalRateLimitUntil = 0;

  private endpointStates: EndpointHealth[] = INITIAL_ENDPOINTS.map((url) => ({
    url,
    consecutiveFailures: 0,
    lastFailureAt: 0,
    cooldownUntil: 0
  }));

  /**
   * Determine detail level based on camera distance to globe center (radius = 1.0).
   * EXPANDED ZOOM HIERARCHY:
   * - distance > 3.2: global (Gate CLOSED)
   * - distance > 1.8: regional (Gate CLOSED)
   * - distance > 1.45: local (Gate CLOSED)
   * - distance > 1.20: close / city level (Gate OPEN)
   * - distance > 1.08: street / neighborhood level (Gate OPEN)
   * - distance <= 1.08: street_close / dense local grid (Gate OPEN)
   */
  public getDetailLevel(distance: number): OSMMapDetailLevel {
    if (distance > 3.2) return 'global';
    if (distance > 1.8) return 'regional';
    if (distance > 1.45) return 'local';
    if (distance > 1.20) return 'close';
    if (distance > 1.08) return 'street';
    return 'street_close';
  }

  /**
   * Compute bounded viewport bounding box.
   * Strictly returns null unless detail level is CLOSE, STREET, or STREET_CLOSE.
   */
  public calculateViewportExtent(centerLat: number, centerLng: number, distance: number): ViewportExtent | null {
    const detailLevel = this.getDetailLevel(distance);
    if (detailLevel === 'global' || detailLevel === 'regional' || detailLevel === 'local') {
      return null;
    }

    // Dynamic viewport half-span scaling based on zoom depth:
    // close (city): ~0.12 deg (approx 12-15km)
    // street (neighborhood): ~0.04 deg (approx 4-5km)
    // street_close (block level): ~0.015 deg (approx 1.5-2km)
    let halfSpanDeg = 0.12;
    if (detailLevel === 'street') {
      halfSpanDeg = 0.04;
    } else if (detailLevel === 'street_close') {
      halfSpanDeg = 0.015;
    }

    const cosLat = Math.max(0.2, Math.cos((centerLat * Math.PI) / 180));
    const halfLngSpanDeg = Math.min(1.0, halfSpanDeg / cosLat);

    const minLat = Math.max(-85, centerLat - halfSpanDeg);
    const maxLat = Math.min(85, centerLat + halfSpanDeg);
    let minLng = centerLng - halfLngSpanDeg;
    let maxLng = centerLng + halfLngSpanDeg;

    if (minLng < -180) minLng = -180;
    if (maxLng > 180) maxLng = 180;

    return {
      centerLat,
      centerLng,
      distance,
      detailLevel,
      minLat: Number(minLat.toFixed(4)),
      maxLat: Number(maxLat.toFixed(4)),
      minLng: Number(minLng.toFixed(4)),
      maxLng: Number(maxLng.toFixed(4))
    };
  }

  /**
   * Compute stable quantized spatial cache key
   */
  public getCacheKey(extent: ViewportExtent): string {
    let gridStep = 0.05;
    if (extent.detailLevel === 'street') {
      gridStep = 0.02;
    } else if (extent.detailLevel === 'street_close') {
      gridStep = 0.008;
    }

    const gridLat = Math.floor(extent.centerLat / gridStep) * gridStep;
    const gridLng = Math.floor(extent.centerLng / gridStep) * gridStep;
    return `${extent.detailLevel}:${gridLat.toFixed(4)}:${gridLng.toFixed(4)}`;
  }

  /**
   * Check if an entity is a valid physical geographic entity
   */
  public isPhysicalGeographicEntity(name: string): boolean {
    if (!name || name.trim().length === 0) return false;
    const trimmed = name.trim();
    for (const pattern of NON_PHYSICAL_PATTERNS) {
      if (pattern.test(trimmed)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Clean and deduplicate name
   */
  public cleanGeographicName(rawName: string, categoryType?: string): string {
    if (!rawName) return '';
    let name = rawName.trim();

    const commonCategories = [
      'National Park',
      'Park',
      'Nature Reserve',
      'State Park',
      'City',
      'Town',
      'Village',
      'Capital',
      'River',
      'Lake',
      'Mountain',
      'Range',
      'Canyon',
      'Forest'
    ];

    if (categoryType) {
      commonCategories.unshift(categoryType);
    }

    for (const cat of commonCategories) {
      const catRegex = new RegExp(`\\s*[-–—:]\\s*${cat}\\s*$`, 'i');
      const parenRegex = new RegExp(`\\s*\\(${cat}\\)\\s*$`, 'i');
      if (catRegex.test(name)) {
        name = name.replace(catRegex, '').trim();
      } else if (parenRegex.test(name)) {
        name = name.replace(parenRegex, '').trim();
      }
    }

    name = name.replace(/\b(\w+)\s+\1\b/gi, '$1').trim();
    return name;
  }

  /**
   * Generate fast, high-performance Overpass QL covering all streets, roads, and waterways
   */
  public buildOverpassQuery(extent: ViewportExtent): string {
    const { minLat, minLng, maxLat, maxLng, detailLevel } = extent;
    const bbox = `${minLat},${minLng},${maxLat},${maxLng}`;
    const limit = detailLevel === 'close' ? 250 : 350;

    return `[out:json][timeout:10];(way["highway"](${bbox});way["waterway"](${bbox});way["natural"="water"](${bbox});way["leisure"="park"](${bbox});node["place"](${bbox}););out geom ${limit};`;
  }

  /**
   * Get healthy endpoints sorted by priority
   */
  public getHealthyEndpoints(): EndpointHealth[] {
    const now = Date.now();
    return [...this.endpointStates]
      .filter((ep) => ep.cooldownUntil <= now)
      .sort((a, b) => a.consecutiveFailures - b.consecutiveFailures);
  }

  /**
   * Fetch from Overpass sequentially with a strict maximum of 3 endpoint attempts and cooldowns
   */
  private async fetchOverpassSequential(query: string, requestId: number, signal?: AbortSignal): Promise<any> {
    const now = Date.now();
    if (this.globalRateLimitUntil > now) {
      console.log(`[OSM Map] REQUEST_SUPPRESSED reason=endpoint-cooldown`);
      return null;
    }

    const endpoints = this.getHealthyEndpoints().slice(0, 3); // Max 3 endpoint attempts

    if (endpoints.length === 0) {
      console.log(`[OSM Map] REQUEST_SUPPRESSED reason=endpoint-cooldown`);
      return null;
    }

    for (const ep of endpoints) {
      if (signal?.aborted) return null;

      console.log(`[OSM Map] OVERPASS_REQUEST_STARTED requestId=${requestId} endpoint=${ep.url}`);

      const timeoutController = new AbortController();
      const onSignalAbort = () => timeoutController.abort();
      if (signal) {
        signal.addEventListener('abort', onSignalAbort);
      }
      const timeoutId = setTimeout(() => timeoutController.abort(), 6000);

      try {
        const res = await fetch(ep.url, {
          method: 'POST',
          body: 'data=' + encodeURIComponent(query),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal: timeoutController.signal
        });

        if (res.status === 429) {
          ep.consecutiveFailures++;
          ep.lastFailureAt = Date.now();
          ep.cooldownUntil = Date.now() + 60000;
          this.globalRateLimitUntil = Date.now() + 60000;
          console.log('[OSM Map] OVERPASS_RATE_LIMITED cooldown=60000ms');
          return null;
        }

        if (res.status === 503 || res.status === 504) {
          ep.consecutiveFailures++;
          ep.lastFailureAt = Date.now();
          ep.cooldownUntil = Date.now() + 30000;
          console.log(`[OSM Map] REQUEST_FAILED requestId=${requestId} endpoint=${ep.url} reason=server-status-${res.status}`);
          continue;
        }

        if (!res.ok) {
          ep.consecutiveFailures++;
          ep.lastFailureAt = Date.now();
          ep.cooldownUntil = Date.now() + 30000;
          console.log(`[OSM Map] REQUEST_FAILED requestId=${requestId} endpoint=${ep.url} reason=status-${res.status}`);
          continue;
        }

        const json = await res.json();
        if (json && Array.isArray(json.elements)) {
          ep.consecutiveFailures = 0;
          ep.cooldownUntil = 0;
          console.log(`[OSM Map] OVERPASS_RESPONSE requestId=${requestId} elements=${json.elements.length}`);
          return json;
        }
      } catch (err: any) {
        if (signal?.aborted || err?.name === 'AbortError') {
          return null;
        }
        ep.consecutiveFailures++;
        ep.lastFailureAt = Date.now();
        ep.cooldownUntil = Date.now() + 30000;
        console.log(`[OSM Map] REQUEST_FAILED requestId=${requestId} endpoint=${ep.url} reason=${err?.message || 'connection-failure'}`);
      } finally {
        clearTimeout(timeoutId);
        if (signal) {
          signal.removeEventListener('abort', onSignalAbort);
        }
      }
    }

    return null;
  }

  /**
   * Parse Overpass response into clean OSMVectorFeature list with street classification
   */
  public parseFeatures(elements: any[], requestId: number = 0): OSMVectorFeature[] {
    const features: OSMVectorFeature[] = [];
    const seenNames = new Set<string>();
    let roadCount = 0;
    let waterwayCount = 0;
    let parkCount = 0;
    let labelCount = 0;

    for (const el of elements) {
      if (!el || !el.tags) continue;
      const tags = el.tags;

      const rawName = tags.name || tags['name:en'] || tags.int_name || tags.official_name || '';
      const englishName = normalizeEnglishDisplayName(rawName, { overpass: { tags } });

      // 1. Places (Nodes)
      if (el.type === 'node' && tags.place) {
        if (!rawName || !this.isPhysicalGeographicEntity(englishName)) continue;

        const dedupeKey = `${englishName.toLowerCase()}-${tags.place}`;
        if (seenNames.has(dedupeKey)) continue;
        seenNames.add(dedupeKey);

        const placeType: OSMFeatureType =
          tags.place === 'city'
            ? 'place_city'
            : tags.place === 'town'
            ? 'place_town'
            : tags.place === 'village'
            ? 'place_village'
            : 'place_neighborhood';

        const cleanedName = this.cleanGeographicName(englishName);
        labelCount++;

        features.push({
          id: `node-${el.id}`,
          type: placeType,
          coordinates: [[el.lat, el.lon]],
          point: [el.lat, el.lon],
          name: rawName,
          englishName: cleanedName,
          importance: tags.place === 'city' ? 4 : tags.place === 'town' ? 3 : tags.place === 'village' ? 2 : 1,
          source: 'overpass'
        });
      }

      // 2. Linear / Polygonal features (Ways)
      if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 2) {
        const coords: [number, number][] = el.geometry.map((pt: any) => [pt.lat, pt.lon]);

        let featureType: OSMFeatureType | null = null;

        if (tags.highway) {
          roadCount++;
          const hw = tags.highway;
          if (hw === 'motorway' || hw === 'trunk' || hw === 'motorway_link' || hw === 'trunk_link') {
            featureType = 'road_motorway';
          } else if (hw === 'primary' || hw === 'primary_link') {
            featureType = 'road_primary';
          } else if (hw === 'secondary' || hw === 'secondary_link') {
            featureType = 'road_secondary';
          } else {
            // tertiary, residential, unclassified, service, living_street, pedestrian, path
            featureType = 'road_street';
          }
        } else if (tags.waterway) {
          waterwayCount++;
          featureType = 'waterway';
        } else if (tags.natural === 'water' || tags.water) {
          waterwayCount++;
          featureType = 'water';
        } else if (tags.leisure === 'park' || tags.leisure === 'garden' || tags.boundary === 'national_park' || tags.natural === 'wood') {
          parkCount++;
          featureType = 'park';
        } else if (tags.boundary === 'administrative') {
          featureType = 'boundary';
        }

        if (!featureType) continue;

        let cleanedName: string | undefined = undefined;
        if (rawName && this.isPhysicalGeographicEntity(englishName)) {
          cleanedName = this.cleanGeographicName(englishName);
        }

        features.push({
          id: `way-${el.id}`,
          type: featureType,
          coordinates: coords,
          name: rawName,
          englishName: cleanedName,
          source: 'overpass'
        });
      }
    }

    console.log(`[OSM Map] OSM_FEATURES_PARSED requestId=${requestId} roads=${roadCount} waterways=${waterwayCount} parks=${parkCount} labels=${labelCount}`);
    return features;
  }

  /**
   * Request vector features for current viewport extent with CLOSE detail gate, caching, and failover.
   */
  public async getFeaturesForViewport(
    extent: ViewportExtent,
    options?: { requestId?: number; signal?: AbortSignal }
  ): Promise<OSMVectorFeature[]> {
    const reqId = options?.requestId ?? 0;
    const signal = options?.signal;

    // Strict Detail Gate Check: only CLOSE, STREET, STREET_CLOSE levels are allowed
    if (extent.detailLevel === 'global' || extent.detailLevel === 'regional' || extent.detailLevel === 'local') {
      return [];
    }

    const cacheKey = this.getCacheKey(extent);

    // 1. Check LRU Cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTLMs) {
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);
      console.log(`[OSM Map] CACHE_HIT key=${cacheKey}`);
      return cached.features;
    }

    if (signal?.aborted) {
      return [];
    }

    console.log(`[OSM Map] REQUEST_STARTED requestId=${reqId} level=${extent.detailLevel.toUpperCase()}`);

    try {
      const query = this.buildOverpassQuery(extent);
      const data = await this.fetchOverpassSequential(query, reqId, signal);

      if (signal?.aborted) {
        return [];
      }

      if (data && Array.isArray(data.elements) && data.elements.length > 0) {
        const liveFeatures = this.parseFeatures(data.elements, reqId);

        // Store in LRU Cache
        if (this.cache.size >= this.maxCacheEntries) {
          const oldestKey = this.cache.keys().next().value;
          if (oldestKey) this.cache.delete(oldestKey);
        }

        this.cache.set(cacheKey, {
          features: liveFeatures,
          source: 'overpass',
          timestamp: Date.now()
        });

        console.log(`[OSM Map] CACHE_STORED key=${cacheKey}`);
        return liveFeatures;
      }

      // If Overpass returned empty elements
      if (data && Array.isArray(data.elements) && data.elements.length === 0) {
        console.log(`[OSM Map] REQUEST_COMPLETED requestId=${reqId} source=OVERPASS features=0`);
        return [];
      }

      // Check fallback data only if live Overpass was unavailable
      const fallbackRaw = getFallbackFeaturesForViewport(
        extent.minLat,
        extent.maxLat,
        extent.minLng,
        extent.maxLng
      );
      if (fallbackRaw.length > 0) {
        const fallbackFeatures: OSMVectorFeature[] = fallbackRaw.map((f) => ({
          ...f,
          source: 'fallback'
        }));

        // Cache the fallback so we do not immediately retry the same failed viewport
        this.cache.set(cacheKey, {
          features: fallbackFeatures,
          source: 'fallback',
          timestamp: Date.now()
        });

        console.log(`[OSM Map] REQUEST_COMPLETED requestId=${reqId} source=FALLBACK features=${fallbackFeatures.length}`);
        return fallbackFeatures;
      }

      console.log(`[OSM Map] OSM_UNAVAILABLE requestId=${reqId}`);
      return [];
    } catch (e: any) {
      if (signal?.aborted || e?.name === 'AbortError') {
        return [];
      }
      console.log(`[OSM Map] OSM_UNAVAILABLE requestId=${reqId}`);
      return [];
    }
  }

  /**
   * Clear cache if required
   */
  public clearCache(): void {
    this.cache.clear();
  }
}

export const osmMapDataProvider = new OSMMapDataProvider();
