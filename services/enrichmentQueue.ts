import { recoverLocationMetadata } from './geminiService';
import { calculateDistanceKm } from './geographic/geographicDistance';
import { fetchLiveNews } from './newsService';
import { MapMarker } from '../types';
import { ENTITY_SCHEMAS } from '../entitySchema';
import { ResolvedEntity } from '../domain';
import { createIdentity, createResolvedSubject, createMetadata, createResolvedEntity } from './entityFactory';

export interface EnrichmentState {
    state: 'pending' | 'loading' | 'complete' | 'failed';
    error?: string;
}

export interface LocationCacheEntry {
    core: EnrichmentState;
    secondary: EnrichmentState;
    news: EnrichmentState;
    timestamp: number;
    data?: ResolvedEntity;
}

type Listener = (locationKey: string, entry: LocationCacheEntry) => void;

class EnrichmentQueueService {
  private cache = new Map<string, LocationCacheEntry>();
  
  // Queues
  private coreQueue: { marker: MapMarker; resolve?: (data: ResolvedEntity | null) => void; reject?: (err: any) => void }[] = [];
  private secondaryQueue: { marker: MapMarker; resolve?: () => void; reject?: (err: any) => void }[] = [];
  
  private activeCoreCount = 0;
  private activeSecondaryCount = 0;
  private readonly MAX_CORE_CONCURRENCY = 2;
  private readonly MAX_SECONDARY_CONCURRENCY = 1;
  
  private listeners = new Set<Listener>();

  public getCacheKey(name: string, lat: number, lng: number): string {
    return `${name}|${lat}|${lng}`;
  }

  public get(name: string, lat: number, lng: number): LocationCacheEntry | undefined {
    return this.cache.get(this.getCacheKey(name, lat, lng));
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(locationKey: string, entry: LocationCacheEntry) {
    this.listeners.forEach((listener) => listener(locationKey, entry));
  }

  public clear() {
    this.cache.clear();
    this.coreQueue = [];
    this.secondaryQueue = [];
    this.activeCoreCount = 0;
    this.activeSecondaryCount = 0;
  }

  private initCacheEntry(key: string, marker?: MapMarker): LocationCacheEntry {
    let entry = this.cache.get(key);
    if (!entry) {
        entry = {
            core: { state: 'pending' },
            secondary: { state: 'pending' },
            news: { state: 'pending' },
            timestamp: Date.now()
        };
        if (marker) {
            const initialIdentity = createIdentity(
                marker.name,
                marker.name,
                "place",
                (marker.type as any) || "archaeological_site",
                { routingStrategy: "Geographic" }
            );
            const initialSubject = createResolvedSubject(initialIdentity, {
                label: marker.name,
                location: { coordinates: { lat: marker.lat, lng: marker.lng } },
                provenance: { provider: 'Queue', timestamp: Date.now(), cache: false },
                diagnostics: {}
            });
            entry.data = createResolvedEntity(initialSubject, createMetadata());
        }
        this.cache.set(key, entry);
    }
    return entry;
  }

  // --- Core Profile (Tier 1) ---

  public startCore(markers: MapMarker[], primaryLocation?: { lat: number, lng: number }) {
    if (markers.length === 0) return;

    let sortedMarkers = [...markers];
    if (primaryLocation) {
        sortedMarkers.sort((a, b) => {
            const distA = Math.pow(a.lat - primaryLocation.lat, 2) + Math.pow(a.lng - primaryLocation.lng, 2);
            const distB = Math.pow(b.lat - primaryLocation.lat, 2) + Math.pow(b.lng - primaryLocation.lng, 2);
            return distA - distB;
        });
    }

    const priorityMarkers = sortedMarkers.slice(0, 4);
    const remainingMarkers = sortedMarkers.slice(4);

    console.log(`[Core Enrichment Queue Started]`);
    console.log(`Priority: \n${priorityMarkers.map(m => `- ${m.name}`).join('\n')}`);

    priorityMarkers.forEach(m => this.enqueueCore(m, true));
    
    if (remainingMarkers.length > 0) {
        if ('requestIdleCallback' in window) {
            (window as any).requestIdleCallback(() => {
                remainingMarkers.forEach(m => this.enqueueCore(m, false));
            });
        } else {
            setTimeout(() => {
                remainingMarkers.forEach(m => this.enqueueCore(m, false));
            }, 2000);
        }
    }
  }

  public enqueueCore(marker: MapMarker, priority: boolean = false): Promise<ResolvedEntity | null> {
    const key = this.getCacheKey(marker.name, marker.lat, marker.lng);
    const existing = this.initCacheEntry(key, marker);
    
    if (existing.core.state === 'complete') {
        return Promise.resolve(existing.data || null);
    }
    if (existing.core.state === 'loading') {
        return new Promise((resolve, reject) => {
            const unsubscribe = this.subscribe((locKey, entry) => {
                if (locKey === key) {
                    if (entry.core.state === 'complete') {
                        unsubscribe();
                        resolve(entry.data || null);
                    } else if (entry.core.state === 'failed') {
                        unsubscribe();
                        reject(new Error(entry.core.error || 'Core Failed'));
                    }
                }
            });
        });
    }

    existing.core.state = 'pending';
    this.notify(key, existing);

    return new Promise((resolve, reject) => {
        const item = { marker, resolve, reject };
        if (priority) {
            this.coreQueue.unshift(item);
        } else {
            this.coreQueue.push(item);
        }
        this.processCoreQueue();
    });
  }

  private async processCoreQueue() {
    if (this.activeCoreCount >= this.MAX_CORE_CONCURRENCY || this.coreQueue.length === 0) {
      return;
    }

    this.activeCoreCount++;
    const item = this.coreQueue.shift();
    if (!item) {
      this.activeCoreCount--;
      return;
    }

    const { marker, resolve, reject } = item;
    const key = this.getCacheKey(marker.name, marker.lat, marker.lng);
    const entry = this.initCacheEntry(key, marker);
    
    entry.core.state = 'loading';
    this.notify(key, entry);

    try {
      const data = await recoverLocationMetadata(marker.name, { lat: marker.lat, lng: marker.lng });
      
      const hasMeaningfulData = data && (
          data.description ||
          data.climate ||
          data.population ||
          data.contextNotes ||
          data.notable?.length
      );
      
      const isValidComplete = data && hasMeaningfulData;
      
      if (!isValidComplete) {
          entry.core = {
              ...entry.core,
              state: 'failed',
              error: 'No meaningful enrichment payload returned'
          };
          this.notify(key, entry);
          if (reject) reject(new Error('No meaningful enrichment payload returned'));
          return;
      }

      if (entry.data && data) {
          entry.data = {
              ...entry.data,
              metadata: {
                  ...entry.data.metadata,
                  ...data as any
              }
          };
      }

      entry.core.state = 'complete';
      entry.timestamp = Date.now();
      
      this.notify(key, entry);
      if (resolve) resolve(entry.data || null);
      
      // Auto-chain secondary enrichment
      this.enqueueSecondary(marker);
      
    } catch (e: any) {
      entry.core = {
          ...entry.core,
          state: 'failed',
          error: e.message
      };
      this.notify(key, entry);
      if (reject) reject(e);
    } finally {
      this.activeCoreCount--;
      this.processCoreQueue();
    }
  }

  // --- Secondary Context (Tier 2) ---

  public enqueueSecondary(marker: MapMarker): Promise<void> {
    const key = this.getCacheKey(marker.name, marker.lat, marker.lng);
    const existing = this.initCacheEntry(key, marker);
    
    // Only fetch if pending
    if (existing.secondary.state === 'complete' || existing.secondary.state === 'loading') {
        return Promise.resolve();
    }
    
    // Check if already in queue
    if (this.secondaryQueue.some(item => item.marker.name === marker.name && item.marker.lat === marker.lat && item.marker.lng === marker.lng)) {
        return Promise.resolve();
    }

    // Only notify if we are transitioning to loading right away, or keep pending for now.
    // Actually we don't strictly need to notify just to say we're pending if we already were.
    // Let's just push to queue. We will notify when it enters 'loading'.

    return new Promise((resolve, reject) => {
        this.secondaryQueue.push({ marker, resolve, reject });
        this.processSecondaryQueue();
    });
  }

  private async processSecondaryQueue() {
    if (this.activeSecondaryCount >= this.MAX_SECONDARY_CONCURRENCY || this.secondaryQueue.length === 0) {
      return;
    }

    this.activeSecondaryCount++;
    const item = this.secondaryQueue.shift();
    if (!item) {
      this.activeSecondaryCount--;
      return;
    }

    const { marker, resolve, reject } = item;
    const key = this.getCacheKey(marker.name, marker.lat, marker.lng);
    const entry = this.initCacheEntry(key, marker);
    
    entry.secondary.state = 'loading';
    this.notify(key, entry);

    try {
      const secondaryData = await recoverLocationMetadata(marker.name, { lat: marker.lat, lng: marker.lng });
      
      if (!secondaryData || !secondaryData.notable) {
          entry.secondary = {
              ...entry.secondary,
              state: 'failed',
              error: 'No secondary enrichment payload returned'
          };
          this.notify(key, entry);
          if (reject) reject(new Error('No secondary enrichment payload returned'));
          return;
      }
      
      if (entry.data) {
          const updatedMeta = createMetadata({ ...entry.data.metadata, notable: secondaryData.notable } as any);
          entry.data = createResolvedEntity(entry.data.subject as any, updatedMeta, entry.data);
      }
      
      entry.secondary.state = 'complete';
      if (resolve) resolve();
    } catch (e: any) {
      entry.secondary = {
          ...entry.secondary,
          state: 'failed',
          error: e.message
      };
      
      // On failure, initialize as empty to prevent infinite UI loading
      if (entry.data) {
          const updatedMeta = createMetadata({ ...entry.data.metadata, notable: [...(entry.data.metadata?.notable || [])] } as any);
          entry.data = createResolvedEntity(entry.data.subject as any, updatedMeta, entry.data);
      }
      
      if (reject) reject(e);
    } finally {
      this.notify(key, entry);
      this.activeSecondaryCount--;
      this.processSecondaryQueue();
    }
  }

  // --- News (Tier 3) ---

  public async fetchNewsOnDemand(marker: MapMarker): Promise<void> {
    const key = this.getCacheKey(marker.name, marker.lat, marker.lng);
    const entry = this.initCacheEntry(key, marker);
    
    if (entry.news.state === 'loading' || entry.news.state === 'complete') return;
    
    entry.news.state = 'loading';
    this.notify(key, entry);
    
    try {
      const newsItems = await fetchLiveNews(marker.name);
      
      if (entry.data) {
          const updatedMeta = createMetadata({ ...entry.data.metadata, news: [...(newsItems || [])] } as any);
          entry.data = createResolvedEntity(entry.data.subject as any, updatedMeta, entry.data);
      }
      
      entry.news.state = 'complete';
    } catch (e: any) {
      entry.news.state = 'failed';
      entry.news.error = e.message;
      
      if (entry.data) {
          const updatedMeta = createMetadata({ ...entry.data.metadata, news: [...(entry.data.metadata?.news || [])] } as any);
          entry.data = createResolvedEntity(entry.data.subject as any, updatedMeta, entry.data);
      }
    } finally {
      this.notify(key, entry);
    }
  }
}

export const enrichmentQueue = new EnrichmentQueueService();
