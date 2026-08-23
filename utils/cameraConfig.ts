import { SkinType } from '../types';

export interface DocumentaryCameraConfig {
  skin: SkinType;
  aspect: number;
  globeOverviewDistance: number;
  maximumGlobeZoomOutDistance: number;
  atmosphereStartDistance: number;
  atmosphereEndDistance: number;
  osmDistance: number;
  calculateFramingDistance: (angularDistanceRad: number, startDistance?: number, targetDistance?: number) => number;
  clampDistance: (distance: number) => number;
}

export interface ViewportVisibilityOptions {
  viewportWidth?: number;
  viewportHeight?: number;
  aspect?: number;
  marginRatio?: number; // default 0.15 (15% safety margin on each side)
  isSidebarOpen?: boolean;
}

/**
 * Calculates great-circle angular distance (in radians) between two lat/lng coordinates.
 */
export function calculateGreatCircleDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = Math.PI / 180;
  const phi1 = lat1 * toRad;
  const phi2 = lat2 * toRad;
  const deltaPhi = (lat2 - lat1) * toRad;
  const deltaLambda = (lng2 - lng1) * toRad;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  return 2 * Math.atan2(Math.sqrt(Math.max(0, Math.min(1, a))), Math.sqrt(Math.max(0, 1 - a)));
}

/**
 * Checks whether destination coordinate is comfortably within the active viewport.
 * Uses Web Mercator projection when at OSM scale, and spherical field-of-view when at globe scale.
 */
export function isDestinationComfortablyVisible(
  cameraCenter: { lat: number; lng: number },
  cameraDistance: number,
  destination: { lat: number; lng: number },
  options?: ViewportVisibilityOptions
): boolean {
  if (!destination || typeof destination.lat !== 'number' || typeof destination.lng !== 'number') {
    return false;
  }
  if (!cameraCenter || typeof cameraCenter.lat !== 'number' || typeof cameraCenter.lng !== 'number') {
    return false;
  }

  const width = options?.viewportWidth ?? (typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1920);
  const height = options?.viewportHeight ?? (typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 1080);
  const marginRatio = options?.marginRatio ?? 0.15;

  const leftMargin = width * marginRatio;
  const rightMargin = width * (1 - (options?.isSidebarOpen ? marginRatio * 1.5 : marginRatio));
  const topMargin = height * marginRatio;
  const bottomMargin = height * (1 - marginRatio);

  // Comfortable viewport preservation strictly applies when in OSM detail view (distance <= 1.55)
  if (cameraDistance > 1.55) {
    return false;
  }

  let z = 14;
  if (cameraDistance <= 1.020) z = 19;
  else if (cameraDistance <= 1.038) z = 18;
  else if (cameraDistance <= 1.07) z = 16;
  else if (cameraDistance <= 1.18) z = 14;
  else if (cameraDistance <= 1.45) z = 12;
  else z = 10;

  const n = Math.pow(2, z);

  const exactCenterX = ((cameraCenter.lng + 180) / 360) * n;
  const centerLatRad = (Math.max(-85.0511, Math.min(85.0511, cameraCenter.lat)) * Math.PI) / 180;
  const exactCenterY = ((1 - Math.log(Math.tan(centerLatRad) + 1 / Math.cos(centerLatRad)) / Math.PI) / 2) * n;

  // Normalize target longitude delta to handle antimeridian wrapping
  let deltaLng = destination.lng - cameraCenter.lng;
  while (deltaLng > 180) deltaLng -= 360;
  while (deltaLng < -180) deltaLng += 360;
  const targetLng = cameraCenter.lng + deltaLng;

  const destX = ((targetLng + 180) / 360) * n;
  const destLatRad = (Math.max(-85.0511, Math.min(85.0511, destination.lat)) * Math.PI) / 180;
  const destY = ((1 - Math.log(Math.tan(destLatRad) + 1 / Math.cos(destLatRad)) / Math.PI) / 2) * n;

  const TILE_PX = 256;
  const screenX = width / 2 + (destX - exactCenterX) * TILE_PX;
  const screenY = height / 2 + (destY - exactCenterY) * TILE_PX;

  return screenX >= leftMargin && screenX <= rightMargin && screenY >= topMargin && screenY <= bottomMargin;
}

/**
 * Calculates moderate framing distance for nearby destinations that are outside the viewport.
 * Elevates enough to show geographic context without zooming all the way to globe overview.
 */
export function calculateModerateFramingDistance(
  angularDistanceRad: number,
  startDistance: number = 1.30,
  targetDistance: number = 1.30,
  maxOverviewDistance: number = 4.5
): number {
  const thetaDeg = (angularDistanceRad * 180) / Math.PI;
  const baseScaleDistance = Math.max(startDistance, targetDistance);

  // Minimum lift is at least 1.65 to elevate out of street level and show surrounding geography
  const minLift = Math.max(baseScaleDistance, 1.65);
  const maxModerate = Math.min(maxOverviewDistance, 2.70);

  const sepRatio = Math.min(1, Math.max(0, thetaDeg / 30.0));
  const elevation = minLift + (maxModerate - minLift) * Math.pow(sepRatio, 0.65);
  return Math.min(maxOverviewDistance, Math.max(baseScaleDistance, elevation));
}

/**
 * Calculates standard great-circle framing distance for 3D globe view.
 * Scales dynamically based on angular separation.
 */
export function calculateDefaultFramingDistance(
  angularDistanceRad: number,
  startDistance: number = 1.30,
  targetDistance: number = 1.30,
  maxOverviewDistance: number = 4.5
): number {
  const thetaDeg = (angularDistanceRad * 180) / Math.PI;
  const baseScaleDistance = Math.max(startDistance, targetDistance);

  // Overview framing scaling from base scale to max overview distance
  const sepScale = Math.min(1, Math.max(0, thetaDeg / 60));
  const targetElevation = baseScaleDistance + (maxOverviewDistance - baseScaleDistance) * Math.pow(sepScale, 0.7);
  return Math.min(maxOverviewDistance, Math.max(baseScaleDistance, targetElevation));
}

/**
 * Calculates the exact geometric base distance for the Parchment circular viewport.
 * At this distance, the globe's visual radius perfectly fills the decorative brass ring.
 */
export function getParchmentBaseDistance(aspect: number): number {
  return aspect <= 1.28985 ? 3.0 : (3.0 * 1.28985) / aspect;
}

/**
 * Returns the authoritative theme-aware camera configuration.
 */
export function getDocumentaryCameraConfig(
  skin: SkinType = 'modern',
  aspect?: number
): DocumentaryCameraConfig {
  const currentAspect =
    typeof aspect === 'number' && !isNaN(aspect) && aspect > 0
      ? aspect
      : typeof window !== 'undefined' && window.innerHeight > 0
      ? window.innerWidth / window.innerHeight
      : 16 / 9;

  if (skin === 'parchment') {
    const baseDistance = getParchmentBaseDistance(currentAspect);
    const maxDistance = baseDistance; // Parchment globe must NEVER shrink past its visual frame
    const osmDistance = 1.30;
    const atmosphereStartDistance = 1.85;
    const atmosphereEndDistance = 1.55;

    return {
      skin: 'parchment',
      aspect: currentAspect,
      globeOverviewDistance: baseDistance,
      maximumGlobeZoomOutDistance: maxDistance,
      atmosphereStartDistance,
      atmosphereEndDistance,
      osmDistance,
      calculateFramingDistance: (angularDistRad: number, startDistance?: number, targetDistance?: number) => {
        const defaultFraming = calculateDefaultFramingDistance(
          angularDistRad,
          startDistance ?? osmDistance,
          targetDistance ?? osmDistance,
          maxDistance
        );
        return Math.min(maxDistance, defaultFraming);
      },
      clampDistance: (dist: number) => {
        return Math.max(1.018, Math.min(maxDistance, dist));
      }
    };
  }

  // Modern, Retro-Green, Retro-Amber themes
  const maxDistance = 5.0;
  const globeOverviewDistance = 4.5;
  const osmDistance = 1.30;
  const atmosphereStartDistance = 1.85;
  const atmosphereEndDistance = 1.55;

  return {
    skin,
    aspect: currentAspect,
    globeOverviewDistance,
    maximumGlobeZoomOutDistance: maxDistance,
    atmosphereStartDistance,
    atmosphereEndDistance,
    osmDistance,
    calculateFramingDistance: (angularDistRad: number, startDistance?: number, targetDistance?: number) => {
      return calculateDefaultFramingDistance(
        angularDistRad,
        startDistance ?? osmDistance,
        targetDistance ?? osmDistance,
        maxDistance
      );
    },
    clampDistance: (dist: number) => {
      return Math.max(1.018, Math.min(maxDistance, dist));
    }
  };
}
