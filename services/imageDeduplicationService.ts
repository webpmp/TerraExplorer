/**
 * Search-Scoped Image Registry & Deduplication Service
 * 
 * Manages image canonicalization and search-scoped image assignment/reservation
 * across related waypoints to prevent repeating the same image across multiple InfoPanels
 * while strictly prioritizing candidate relevance and safety validation.
 */

export interface ImageAssignmentMetadata {
  searchId: string;
  waypointId: string;
  url: string;
  canonicalId: string;
  title?: string;
  score?: number;
  assignedAt: number;
}

/**
 * Normalizes an image URL to a canonical asset identity string.
 * Handles:
 * - HTTP vs HTTPS
 * - Trailing slashes
 * - Redundant query parameters (?width=, ?height=, ?crop=, etc.)
 * - Wikimedia Commons / Wikipedia thumbnail paths:
 *   e.g. https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Image_Name.jpg/800px-Image_Name.jpg
 *   and  https://upload.wikimedia.org/wikipedia/commons/a/ab/Image_Name.jpg
 *   both resolve to "wikimedia:commons:Image_Name.jpg"
 */
export function canonicalizeImageUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';

  const trimmed = url.trim();
  if (!trimmed) return '';

  try {
    // Parse URL if valid
    const urlObj = new URL(trimmed.startsWith('//') ? `https:${trimmed}` : (trimmed.startsWith('http') ? trimmed : `https://${trimmed}`));
    const hostname = urlObj.hostname.toLowerCase();
    let pathname = decodeURIComponent(urlObj.pathname);

    // 1. Wikimedia / Wikipedia Image Normalization
    if (hostname.includes('wikimedia.org') || hostname.includes('wikipedia.org')) {
      // Wikimedia structure: /wikipedia/(commons|en|...)/(thumb/)?([0-9a-f]/[0-9a-f]{2}/)?([^/]+)(/.*)?
      // Thumbnail e.g.: /wikipedia/commons/thumb/6/6f/Queen_Annes_Revenge_Artifact.jpg/800px-Queen_Annes_Revenge_Artifact.jpg
      // Direct e.g.: /wikipedia/commons/6/6f/Queen_Annes_Revenge_Artifact.jpg
      
      const thumbMatch = pathname.match(/\/wikipedia\/([^/]+)\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/i);
      if (thumbMatch) {
        const repo = thumbMatch[1].toLowerCase();
        let fileName = thumbMatch[2];
        // If fileName ended up being a thumbnail prefix like "800px-ActualName.jpg", extract actual name
        fileName = fileName.replace(/^\d+px-/, '');
        return `wikimedia:${repo}:${fileName.toLowerCase()}`;
      }

      // Other wiki file path match
      const genericWikiMatch = pathname.match(/\/([^/]+)\.(jpg|jpeg|png|gif|svg|webp)$/i);
      if (genericWikiMatch) {
        let fileName = `${genericWikiMatch[1]}.${genericWikiMatch[2]}`;
        fileName = fileName.replace(/^\d+px-/, '');
        return `wikimedia:generic:${fileName.toLowerCase()}`;
      }
    }

    // 2. Strip irrelevant sizing/format query parameters
    const searchParams = new URLSearchParams(urlObj.search);
    const ignoredParams = ['width', 'height', 'w', 'h', 'size', 's', 'crop', 'fit', 'auto', 'format', 'quality', 'q', 'origin'];
    for (const p of ignoredParams) {
      searchParams.delete(p);
    }
    
    // Sort remaining params deterministically
    searchParams.sort();
    const cleanSearch = searchParams.toString() ? `?${searchParams.toString()}` : '';
    
    // Strip trailing slash
    const cleanPath = pathname.replace(/\/+$/, '');

    return `${hostname}${cleanPath}${cleanSearch}`.toLowerCase();
  } catch {
    // Fallback string sanitization for non-standard or relative URLs
    return trimmed
      .replace(/^https?:\/\//i, '')
      .replace(/\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/([^/]+)\/\d+px-[^/]+$/i, '/$1')
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
      .toLowerCase();
  }
}

/**
 * Search-scoped image assignment and collision management registry.
 */
export class SearchImageRegistry {
  private static instance: SearchImageRegistry;
  // Map of searchId -> Map of canonicalImageId -> ImageAssignmentMetadata
  private searchAssignments: Map<string, Map<string, ImageAssignmentMetadata>> = new Map();
  // Map of searchId -> active reservations in progress
  private activeReservations: Map<string, Set<string>> = new Map();

  public static getInstance(): SearchImageRegistry {
    if (!SearchImageRegistry.instance) {
      SearchImageRegistry.instance = new SearchImageRegistry();
    }
    return SearchImageRegistry.instance;
  }

  /**
   * Generates a new searchId session token for a query.
   */
  public createSearchSession(query: string = ''): string {
    const searchId = `search-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.searchAssignments.set(searchId, new Map());
    this.activeReservations.set(searchId, new Set());
    return searchId;
  }

  /**
   * Checks if an image is already registered or reserved in the given search session.
   */
  public isImageUsedInSearch(
    searchId?: string,
    imageUrl?: string
  ): { isUsed: boolean; usedByWaypointId?: string } {
    if (!searchId || !imageUrl) return { isUsed: false };

    const canonicalId = canonicalizeImageUrl(imageUrl);
    if (!canonicalId) return { isUsed: false };

    const assignments = this.searchAssignments.get(searchId);
    if (assignments && assignments.has(canonicalId)) {
      const assignment = assignments.get(canonicalId)!;
      return {
        isUsed: true,
        usedByWaypointId: assignment.waypointId
      };
    }

    const reservations = this.activeReservations.get(searchId);
    if (reservations && reservations.has(canonicalId)) {
      return {
        isUsed: true
      };
    }

    return { isUsed: false };
  }

  /**
   * Reserves an image candidate to prevent concurrent race conditions
   * between sibling waypoint InfoPanels.
   */
  public reserveImage(searchId: string, imageUrl: string): boolean {
    if (!searchId || !imageUrl) return false;
    const canonicalId = canonicalizeImageUrl(imageUrl);
    if (!canonicalId) return false;

    if (!this.activeReservations.has(searchId)) {
      this.activeReservations.set(searchId, new Set());
    }

    const reservations = this.activeReservations.get(searchId)!;
    if (this.isImageUsedInSearch(searchId, imageUrl).isUsed) {
      return false;
    }

    reservations.add(canonicalId);
    return true;
  }

  /**
   * Releases an active reservation if candidate was not selected.
   */
  public releaseReservation(searchId: string, imageUrl: string): void {
    if (!searchId || !imageUrl) return;
    const canonicalId = canonicalizeImageUrl(imageUrl);
    const reservations = this.activeReservations.get(searchId);
    if (reservations) {
      reservations.delete(canonicalId);
    }
  }

  /**
   * Registers an assigned image to a waypoint in a search session.
   */
  public registerImage(
    searchId: string,
    waypointId: string,
    imageUrl: string,
    metadata?: Partial<ImageAssignmentMetadata>
  ): void {
    if (!searchId || !waypointId || !imageUrl) return;

    const canonicalId = canonicalizeImageUrl(imageUrl);
    if (!canonicalId) return;

    if (!this.searchAssignments.has(searchId)) {
      this.searchAssignments.set(searchId, new Map());
    }

    const assignments = this.searchAssignments.get(searchId)!;
    assignments.set(canonicalId, {
      searchId,
      waypointId,
      url: imageUrl,
      canonicalId,
      title: metadata?.title,
      score: metadata?.score,
      assignedAt: Date.now(),
      ...metadata
    });

    // Clean up reservation since it is now permanently assigned
    const reservations = this.activeReservations.get(searchId);
    if (reservations) {
      reservations.delete(canonicalId);
    }
  }

  /**
   * Returns list of canonical image IDs currently used by a search session.
   */
  public getImagesUsedBySearch(searchId: string): string[] {
    if (!searchId) return [];
    const assignments = this.searchAssignments.get(searchId);
    return assignments ? Array.from(assignments.keys()) : [];
  }

  /**
   * Clears a search session to free memory.
   */
  public clearSearch(searchId: string): void {
    if (!searchId) return;
    this.searchAssignments.delete(searchId);
    this.activeReservations.delete(searchId);
  }

  /**
   * Resets entire registry (for testing).
   */
  public reset(): void {
    this.searchAssignments.clear();
    this.activeReservations.clear();
  }
}

export const searchImageRegistry = SearchImageRegistry.getInstance();
