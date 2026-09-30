/**
 * Client-Local Image Preferences Service
 *
 * Provides isolated, per-user image feedback (thumbs up / thumbs down) stored
 * strictly in the browser's localStorage. This feedback is namespaced and never
 * mutates global route definitions, route registry data, or saved snapshots.
 */

export type ImagePreference = 'liked' | 'disliked' | 'like' | 'dislike';

export interface ImagePreferencesMap {
  [key: string]: 'liked' | 'disliked';
}

const STORAGE_KEY = 'terraexplorer_image_preferences';

/**
 * Resolves a stable entity identity for image preferences.
 * Precedence:
 * 1. entity.waypoint.id when a route waypoint exists.
 * 2. A genuinely persistent entity ID if one exists and is not a transient search-* or fav-loc-* ID.
 * 3. canonicalName.
 * 4. name.
 * 5. 'global' only as the final fallback.
 */
export function getEntityImagePreferenceId(entity?: {
  waypoint?: { id?: string };
  id?: string;
  canonicalName?: string;
  name?: string;
} | null): string {
  if (!entity) return 'global';
  if (entity.waypoint?.id) return entity.waypoint.id;
  if (
    entity.id &&
    !entity.id.startsWith('search-') &&
    !entity.id.startsWith('fav-loc-')
  ) {
    return entity.id;
  }
  return entity.canonicalName || entity.name || 'global';
}

/**
 * Builds a stable preference key from the waypoint identifier and image URL.
 * Key format: "<waypoint-id>|<image-url>"
 */
export function getImagePreferenceKey(waypointId: string, imageUrl: string): string {
  const safeId = (waypointId || 'global').trim();
  const safeUrl = (imageUrl || '').trim();
  return `${safeId}|${safeUrl}`;
}

/**
 * Normalizes input preference to canonical 'liked' | 'disliked' | null.
 */
function normalizePreference(pref: ImagePreference | null | undefined): 'liked' | 'disliked' | null {
  if (!pref) return null;
  if (pref === 'like' || pref === 'liked') return 'liked';
  if (pref === 'dislike' || pref === 'disliked') return 'disliked';
  return null;
}

/**
 * Loads all client-local image preferences from localStorage.
 */
export function getAllImagePreferences(): ImagePreferencesMap {
  if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    console.warn('[Image Preferences] Failed to load from localStorage:', e);
    return {};
  }
}

/**
 * Gets the current user's preference for a specific image on a waypoint.
 */
export function getUserImagePreference(waypointId: string, imageUrl: string): 'liked' | 'disliked' | null {
  if (!imageUrl) return null;
  const prefs = getAllImagePreferences();
  const key = getImagePreferenceKey(waypointId, imageUrl);
  return normalizePreference(prefs[key]);
}

/**
 * Sets the current user's preference for a specific image on a waypoint.
 * Passing `null` removes the preference.
 */
export function setUserImagePreference(
  waypointId: string,
  imageUrl: string,
  preference: ImagePreference | null
): void {
  if (typeof localStorage === 'undefined' || typeof localStorage.setItem !== 'function' || !imageUrl) return;
  try {
    const prefs = getAllImagePreferences();
    const key = getImagePreferenceKey(waypointId, imageUrl);
    const normalized = normalizePreference(preference);
    if (normalized === null) {
      delete prefs[key];
    } else {
      prefs[key] = normalized;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.warn('[Image Preferences] Failed to save to localStorage:', e);
  }
}

/**
 * Toggles a user image preference:
 * - If the target preference is already active, clicking it clears the preference (returns null).
 * - Otherwise sets it to the target preference (returns targetPreference).
 */
export function toggleUserImagePreference(
  waypointId: string,
  imageUrl: string,
  targetPreference: ImagePreference
): 'liked' | 'disliked' | null {
  const current = getUserImagePreference(waypointId, imageUrl);
  const normalizedTarget = normalizePreference(targetPreference);
  const next = current === normalizedTarget ? null : normalizedTarget;
  setUserImagePreference(waypointId, imageUrl, next);
  return next;
}

/**
 * Clears all local image preferences (used for testing or client reset).
 */
export function clearAllImagePreferences(): void {
  if (typeof localStorage === 'undefined' || typeof localStorage.removeItem !== 'function') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('[Image Preferences] Failed to clear localStorage:', e);
  }
}
