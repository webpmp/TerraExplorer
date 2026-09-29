import { ImageMetadata, LocationInfo } from '../types';

/**
 * Validates whether an image candidate is suitable for a subtle contextual header background.
 * Rejects SVGs, logos, flags, maps, icons, diagrams, and placeholder images.
 */
export function isSuitableHeaderBackgroundImage(img: string | ImageMetadata | any): boolean {
  if (!img) return false;
  const url = typeof img === 'string' ? img : img?.url;
  if (!url || typeof url !== 'string' || !url.trim()) return false;

  const lowerUrl = url.toLowerCase();

  // Reject SVG icons/diagrams/maps/vectors
  if (lowerUrl.endsWith('.svg') || lowerUrl.includes('.svg?') || lowerUrl.includes('.svg/')) {
    return false;
  }

  // Reject flags, logos, coats of arms, seals, emblems, icons, maps
  const unsuitablePatterns = [
    /flag[_\-\s]/i,
    /[_\-\s]flag/i,
    /flag_of_/i,
    /coat[_\-\s]of[_\-\s]arms/i,
    /emblem/i,
    /logo/i,
    /icon/i,
    /badge/i,
    /symbol/i,
    /seal_of_/i,
    /locator[_\-\s]map/i,
    /location[_\-\s]map/i,
    /[_\-\s]map\./i,
    /[_\-\s]map[_\-\s]/i,
    /carte[_\-\s]/i,
    /map_of_/i,
    /diagram/i,
    /chart/i,
    /plan[_\-\s]of/i,
    /placeholder/i
  ];

  for (const pattern of unsuitablePatterns) {
    if (pattern.test(lowerUrl)) {
      return false;
    }
  }

  return true;
}

/**
 * Determines the focal position for the header crop based on explicit image metadata
 * or sensible entity-type and subject-matter heuristics (e.g. ship rigging/masts,
 * mountain peaks, building facades) rather than arbitrary center cropping.
 */
export function getHeaderFocalPosition(info?: Partial<LocationInfo> | any, imageMeta?: Partial<ImageMetadata> | any): string {
  // 1. Explicit focal point in image metadata or location info
  const explicitFocal = imageMeta?.focalPoint || imageMeta?.focalPosition || (info as any)?.imageFocalPoint;
  if (explicitFocal && typeof explicitFocal === 'string') {
    const focalMap: Record<string, string> = {
      'top': '50% 15%',
      'top-center': '50% 20%',
      'center-top': '50% 20%',
      'center': '50% 50%',
      'bottom': '50% 80%',
      'bottom-center': '50% 80%',
      'left': '20% 50%',
      'left-center': '20% 50%',
      'right': '80% 50%',
      'right-center': '80% 50%',
      'top-left': '20% 20%',
      'top-right': '80% 20%'
    };
    const key = explicitFocal.trim().toLowerCase();
    if (focalMap[key]) {
      return focalMap[key];
    }
    if (explicitFocal.includes('%') || explicitFocal.includes('px')) {
      return explicitFocal;
    }
  }

  if (!info) return '50% 40%';

  const entityType = String(info.entityType || (info as any).type || info.category || '').toLowerCase();
  const name = String(info.name || info.canonicalName || '').toLowerCase();

  // Ships / Maritime Vessels / Shipwrecks (favor masts, rigging, upper hull):
  if (
    entityType.includes('ship') ||
    entityType.includes('vessel') ||
    entityType.includes('naval') ||
    entityType.includes('boat') ||
    entityType.includes('wreck') ||
    name.includes('hms ') ||
    name.includes('uss ') ||
    name.includes('ss ') ||
    name.includes('ship') ||
    name.includes('galleon')
  ) {
    return '50% 35%';
  }

  // Mountains / Peaks / Volcanoes (favor mountain peak silhouette):
  if (
    entityType.includes('mountain') ||
    entityType.includes('volcano') ||
    entityType.includes('peak') ||
    entityType.includes('range') ||
    name.includes('mount ') ||
    name.includes('peak') ||
    name.includes('volcano')
  ) {
    return '50% 40%';
  }

  // Buildings / Castles / Monuments / Architecture / Archaeological Sites (favor upper facades, spires):
  if (
    entityType.includes('building') ||
    entityType.includes('castle') ||
    entityType.includes('fort') ||
    entityType.includes('monument') ||
    entityType.includes('palace') ||
    entityType.includes('temple') ||
    entityType.includes('tower') ||
    entityType.includes('cathedral') ||
    entityType.includes('church') ||
    entityType.includes('ruins') ||
    entityType.includes('archaeological') ||
    entityType.includes('landmark')
  ) {
    return '50% 35%';
  }

  // Default sensible position
  return '50% 40%';
}

/**
 * Extracts the first suitable background image candidate from available enriched location image data.
 */
export function getHeaderBackgroundImageUrl(
  info?: Partial<LocationInfo> | any,
  stateImages?: any[]
): { url: string; meta?: any } | null {
  if (!info) return null;

  const candidates: any[] = [];
  if (Array.isArray(stateImages) && stateImages.length > 0) {
    candidates.push(...stateImages);
  }
  if (Array.isArray(info.images) && info.images.length > 0) {
    candidates.push(...info.images);
  }
  if (info.primaryImage) {
    candidates.push(info.primaryImage);
  }
  if (info.image && typeof info.image === 'string') {
    candidates.push(info.image);
  }

  for (const candidate of candidates) {
    if (isSuitableHeaderBackgroundImage(candidate)) {
      const url = typeof candidate === 'string' ? candidate : candidate?.url;
      if (url) {
        return {
          url,
          meta: typeof candidate === 'object' ? candidate : undefined
        };
      }
    }
  }

  return null;
}
