import * as THREE from 'three';
import { latLngToVector3 } from '../../utils/globeCoordinates';
import { SkinType } from '../../types';
import { transformRetroVectorStyle } from '../../utils/osmPalettes';

export type OSMDetailLevel =
  | 'global'
  | 'regional'
  | 'local'
  | 'close'
  | 'street'
  | 'street_close'
  | 'street_detail'
  | 'street_max';

export interface TileCoord {
  z: number;
  x: number;
  y: number;
  key: string;
}

export interface TileBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface CachedTile {
  texture: THREE.Texture;
  timestamp: number;
}

export const VALID_OSM_ZOOMS = [12, 14, 16, 18, 19] as const;

export const OSM_DETAIL_THRESHOLD = 1.45;
export const OSM_RASTER_ALTITUDE = 1.017;
const MAX_CONCURRENT_REQUESTS = 6;
const MAX_CACHE_ENTRIES = 300;

export class OSMTileService {
  private cache = new Map<string, CachedTile>();
  private inFlightRequests = new Map<string, AbortController>();
  private activeRequestCount = 0;
  private textureLoader = new THREE.TextureLoader();

  /**
   * Determine detail level with robust hysteresis to prevent threshold oscillation.
   */
  public getDetailLevel(distance: number, currentLevel?: OSMDetailLevel): OSMDetailLevel {
    if (currentLevel === 'street_max') {
      if (distance > 1.035) return this.getDetailLevel(distance);
      return 'street_max';
    }
    if (currentLevel === 'street_detail') {
      if (distance <= 1.020) return 'street_max';
      if (distance > 1.065) return this.getDetailLevel(distance);
      return 'street_detail';
    }
    if (currentLevel === 'street_close') {
      if (distance <= 1.038) return 'street_detail';
      if (distance > 1.13) return this.getDetailLevel(distance);
      return 'street_close';
    }
    if (currentLevel === 'street') {
      if (distance <= 1.08) return 'street_close';
      if (distance > 1.25) return this.getDetailLevel(distance);
      return 'street';
    }
    if (currentLevel === 'close') {
      if (distance <= 1.20) return 'street';
      if (distance > 1.55) return 'local';
      return 'close';
    }

    if (distance > 3.2) return 'global';
    if (distance > 1.8) return 'regional';
    if (distance > 1.45) return 'local';
    if (distance > 1.18) return 'close';
    if (distance > 1.07) return 'street';
    if (distance > 1.038) return 'street_close';
    if (distance > 1.020) return 'street_detail';
    return 'street_max';
  }

  /**
   * Map detail level to standard XYZ Slippy Map tile zoom (z: 12 to 19)
   */
  public getZoomForDetailLevel(level: OSMDetailLevel): number | null {
    switch (level) {
      case 'close':
        return 12;
      case 'street':
        return 14;
      case 'street_close':
        return 16;
      case 'street_detail':
        return 18;
      case 'street_max':
        return 19;
      default:
        return null;
    }
  }

  /**
   * Get next adjacent tile zoom with robust hysteresis and single-step clamping.
   */
  public getNextAdjacentTileZoom(
    currentZoom: number,
    distance: number
  ): { nextZoom: number; reason: string; clampedFrom?: number } {
    let candidate = currentZoom;
    let reason = 'HYSTERESIS';

    switch (currentZoom) {
      case 12:
        if (distance <= 1.16) {
          candidate = 14;
          reason = 'ZOOM_IN_THRESHOLD';
        }
        break;
      case 14:
        if (distance <= 1.065) {
          candidate = 16;
          reason = 'ZOOM_IN_THRESHOLD';
        } else if (distance >= 1.26) {
          candidate = 12;
          reason = 'ZOOM_OUT_THRESHOLD';
        }
        break;
      case 16:
        if (distance <= 1.030) {
          candidate = 18;
          reason = 'ZOOM_IN_THRESHOLD';
        } else if (distance >= 1.10) {
          candidate = 14;
          reason = 'ZOOM_OUT_THRESHOLD';
        }
        break;
      case 18:
        if (distance <= 1.018) {
          candidate = 19;
          reason = 'ZOOM_IN_THRESHOLD';
        } else if (distance >= 1.055) {
          candidate = 16;
          reason = 'ZOOM_OUT_THRESHOLD';
        }
        break;
      case 19:
        if (distance >= 1.032) {
          candidate = 18;
          reason = 'ZOOM_OUT_THRESHOLD';
        }
        break;
      default:
        candidate = 14;
        reason = 'DEFAULT';
    }

    if (candidate === currentZoom) {
      return { nextZoom: currentZoom, reason: 'HYSTERESIS' };
    }

    // Step clamping: restrict to adjacent logical level only
    const currentIndex = VALID_OSM_ZOOMS.indexOf(currentZoom as any);
    const targetIndex = VALID_OSM_ZOOMS.indexOf(candidate as any);

    if (currentIndex !== -1 && targetIndex !== -1) {
      if (targetIndex > currentIndex + 1) {
        const clampedNext = VALID_OSM_ZOOMS[currentIndex + 1];
        return { nextZoom: clampedNext, reason, clampedFrom: candidate };
      } else if (targetIndex < currentIndex - 1) {
        const clampedNext = VALID_OSM_ZOOMS[currentIndex - 1];
        return { nextZoom: clampedNext, reason, clampedFrom: candidate };
      }
    }

    return { nextZoom: candidate, reason };
  }

  /**
   * Convert latitude/longitude to Slippy Map tile coordinate (x, y) at zoom z
   */
  public latLngToTile(lat: number, lng: number, z: number): { x: number; y: number } {
    const n = Math.pow(2, z);
    const x = Math.floor(((lng + 180) / 360) * n);
    const clampedX = ((x % n) + n) % n;

    const latRad = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
    const clampedY = Math.max(0, Math.min(n - 1, y));

    return { x: clampedX, y: clampedY };
  }

  /**
   * Calculate geographic bounding box for tile (z, x, y) using exact Web Mercator formula
   */
  public tileToBounds(z: number, x: number, y: number): TileBounds {
    const n = Math.pow(2, z);
    const minLng = (x / n) * 360 - 180;
    const maxLng = ((x + 1) / n) * 360 - 180;

    const nNorth = Math.PI - (2 * Math.PI * y) / n;
    const maxLat = (180 / Math.PI) * Math.atan(Math.sinh(nNorth));

    const nSouth = Math.PI - (2 * Math.PI * (y + 1)) / n;
    const minLat = (180 / Math.PI) * Math.atan(Math.sinh(nSouth));

    return { minLat, maxLat, minLng, maxLng };
  }

  /**
   * Calculate 3D sphere bounding geometry for a tile mesh on the globe
   */
  public tileToGeometry(z: number, x: number, y: number, altitude: number = OSM_RASTER_ALTITUDE): THREE.BufferGeometry {
    const bounds = this.tileToBounds(z, x, y);
    const segments = 4;
    const geometry = new THREE.PlaneGeometry(1, 1, segments, segments);
    const pos = geometry.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      const u = (pos.getX(i) + 0.5);
      const v = (pos.getY(i) + 0.5);

      const lng = bounds.minLng + u * (bounds.maxLng - bounds.minLng);
      const lat = bounds.minLat + v * (bounds.maxLat - bounds.minLat);

      const sphereVec = latLngToVector3(lat, lng, altitude);
      pos.setXYZ(i, sphereVec.x, sphereVec.y, sphereVec.z);
    }

    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  public createTileGeometry(z: number, x: number, y: number, altitude: number = OSM_RASTER_ALTITUDE): THREE.BufferGeometry {
    return this.tileToGeometry(z, x, y, altitude);
  }

  /**
   * Get authenticated CARTO GL vector style URL.
   * Voyager for Modern/Parchment, Dark Matter for CRT Green/Amber.
   */
  public getVectorStyleUrl(skin: string = 'modern'): string {
    const apiKey = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_CARTO_API_KEY : undefined;
    const styleName = (skin === 'retro-amber' || skin === 'retro-green') ? 'dark-matter-gl-style' : 'voyager-gl-style';
    const baseUrl = `https://basemaps.cartocdn.com/gl/${styleName}/style.json`;

    if (!apiKey) {
      console.warn('[OSM VECTOR] Missing VITE_CARTO_API_KEY; vector style may fail to authenticate.');
      return baseUrl;
    }

    return `${baseUrl}?key=${encodeURIComponent(apiKey)}`;
  }

  private vectorStyleCache = new Map<string, any>();

  /**
   * Fetches the authoritative CARTO GL vector style JSON and applies theme-specific
   * label overrides (for Retro Green and Retro Amber) before passing it to MapLibre.
   */
  public async fetchVectorStyle(skin: SkinType = 'modern'): Promise<any> {
    const cacheKey = `vector-style:${skin}`;
    if (this.vectorStyleCache.has(cacheKey)) {
      return this.vectorStyleCache.get(cacheKey);
    }

    const url = this.getVectorStyleUrl(skin);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const styleJson = await res.json();
      const transformed = transformRetroVectorStyle(styleJson, skin);
      this.vectorStyleCache.set(cacheKey, transformed);
      return transformed;
    } catch (err) {
      console.warn(`[OSM VECTOR] Failed to fetch/transform vector style for ${skin}, falling back to URL:`, err);
      return url;
    }
  }

  /**
   * Get public CartoDB raster tile URL styled per application skin.
   * Uses Carto Voyager ('rastertiles/voyager') for rich cartographic detail, high-contrast roads, vegetation, and water.
   */
  public getTileUrl(z: number, x: number, y: number, skin: string): string {
    const subdomain = ['a', 'b', 'c', 'd'][(x + y) % 4];
    const apiKey = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_CARTO_API_KEY : undefined;

    let baseUrl: string;
    if (skin === 'retro-amber' || skin === 'retro-green') {
      baseUrl = `https://${subdomain}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`;
    } else {
      baseUrl = `https://${subdomain}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`;
    }

    if (!apiKey) {
      console.warn('[OSM CARTO] Missing VITE_CARTO_API_KEY; authenticated raster tiles cannot be loaded.');
      return baseUrl;
    }

    return `${baseUrl}?key=${encodeURIComponent(apiKey)}`;
  }

  /**
   * Returns list of tile URLs for a given geographic center, zoom, and screen dimensions.
   */
  public getTileUrlsForViewport(
    lat: number,
    lng: number,
    zoom: number = 14,
    skin: string = 'modern',
    viewportWidth: number = 1920,
    viewportHeight: number = 1080
  ): string[] {
    const n = Math.pow(2, zoom);
    const exactX = ((lng + 180) / 360) * n;
    const latRad = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
    const exactY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

    const TILE_PX = 256;
    const tilesX = Math.ceil(viewportWidth / (2 * TILE_PX)) + 2;
    const tilesY = Math.ceil(viewportHeight / (2 * TILE_PX)) + 2;

    const urls: string[] = [];
    for (let dx = -tilesX; dx <= tilesX; dx++) {
      for (let dy = -tilesY; dy <= tilesY; dy++) {
        const x = Math.floor(exactX) + dx;
        const y = Math.floor(exactY) + dy;
        if (y < 0 || y >= n) continue;
        const wrappedX = ((x % n) + n) % n;
        urls.push(this.getTileUrl(zoom, wrappedX, y, skin));
      }
    }
    return urls;
  }

  /**
   * Prefetch and warm the browser image cache for a destination viewport's tile set.
   * Runs non-blocking in the background so tiles are cached before the camera arrives.
   */
  public prefetchViewportTiles(
    lat: number,
    lng: number,
    zoom: number = 14,
    skin: string = 'modern',
    viewportWidth: number = 1920,
    viewportHeight: number = 1080
  ): Promise<void> {
    if (typeof Image === 'undefined') {
      return Promise.resolve();
    }
    const urls = this.getTileUrlsForViewport(lat, lng, zoom, skin, viewportWidth, viewportHeight);
    return Promise.all(
      urls.map((url) => {
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = url;
        });
      })
    ).then(() => undefined);
  }

  /**
   * Fetch and create Three.js Texture with LRU caching and concurrency limiter
   */
  public async fetchTileTexture(
    z: number,
    x: number,
    y: number,
    skin: string,
    signal?: AbortSignal
  ): Promise<THREE.Texture | null> {
    const key = `${skin}:${z}:${x}:${y}`;
    const cached = this.cache.get(key);
    if (cached) {
      cached.timestamp = Date.now();
      return cached.texture;
    }

    if (signal?.aborted) return null;

    const url = this.getTileUrl(z, x, y, skin);

    if (this.activeRequestCount >= MAX_CONCURRENT_REQUESTS) {
      await new Promise<void>((resolve, reject) => {
        const interval = setInterval(() => {
          if (signal?.aborted) {
            clearInterval(interval);
            reject(new DOMException('Aborted', 'AbortError'));
          } else if (this.activeRequestCount < MAX_CONCURRENT_REQUESTS) {
            clearInterval(interval);
            resolve();
          }
        }, 20);
      }).catch(() => null);
    }

    if (signal?.aborted) return null;

    this.activeRequestCount++;
    const abortCtrl = new AbortController();
    this.inFlightRequests.set(key, abortCtrl);

    try {
      const texture = await new Promise<THREE.Texture>((resolve, reject) => {
        const onAbort = () => {
          reject(new DOMException('Aborted', 'AbortError'));
        };
        signal?.addEventListener('abort', onAbort);

        this.textureLoader.load(
          url,
          (tex) => {
            signal?.removeEventListener('abort', onAbort);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.generateMipmaps = false;
            resolve(tex);
          },
          undefined,
          (err) => {
            signal?.removeEventListener('abort', onAbort);
            reject(err);
          }
        );
      });

      if (this.cache.size >= MAX_CACHE_ENTRIES) {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;
        for (const [k, v] of this.cache.entries()) {
          if (v.timestamp < oldestTime) {
            oldestTime = v.timestamp;
            oldestKey = k;
          }
        }
        if (oldestKey) {
          const oldEntry = this.cache.get(oldestKey);
          oldEntry?.texture.dispose();
          this.cache.delete(oldestKey);
        }
      }

      this.cache.set(key, { texture, timestamp: Date.now() });
      return texture;
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.warn(`[OSM Tile] Failed to load tile ${key}:`, e);
      }
      return null;
    } finally {
      this.activeRequestCount = Math.max(0, this.activeRequestCount - 1);
      this.inFlightRequests.delete(key);
    }
  }

  public cancelAll(): void {
    for (const ctrl of this.inFlightRequests.values()) {
      ctrl.abort();
    }
    this.inFlightRequests.clear();
    this.activeRequestCount = 0;
  }

  public clearCache(): void {
    for (const item of this.cache.values()) {
      item.texture.dispose();
    }
    this.cache.clear();
  }
}

export const osmTileService = new OSMTileService();
