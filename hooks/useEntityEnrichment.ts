import { useRef, useCallback } from 'react';
import { getInfoFromFeature } from '../services/geminiService';
import { adaptLocationInfoToResolvedEntity } from '../domain';
import { LocationInfo, LocationType } from '../types';

export function useEntityEnrichment(
    setSelectedEntity: (updater: any) => void,
    setIsNewsFetching?: (fetching: boolean) => void
) {
    const requestId = useRef(0);

    const enrichEntity = useCallback((marker: any) => {
        const id = ++requestId.current;
        console.log(`[INFO PANEL PERF] markerClick for ${marker.name} at ${Date.now()}`);

        const baseLocationInfo = {
            name: marker.name,
            type: marker.type || LocationType.POI, 
            description: "Generating location details...",
            population: null,
            climate: null,
            contextNotes: [],
            coordinates: { lat: marker.lat, lng: marker.lng },
            news: [],
            relatedEntities: [],
            sectionState: {
                description: "loading",
                climate: "loading",
                population: "loading",
                news: "loading",
                images: "loading",
                nearby: "loading"
            }
        } as LocationInfo;
        
        setSelectedEntity(adaptLocationInfoToResolvedEntity(baseLocationInfo));
        console.log(`[INFO PANEL PERF] initialEntityRendered at ${Date.now()}`);

        // Fetch Metadata
        console.log(`[INFO PANEL PERF] metadataStarted at ${Date.now()}`);
        getInfoFromFeature(marker).then(data => {
            console.log(`[INFO PANEL PERF] metadataCompleted at ${Date.now()}`);
            if (id !== requestId.current) {
                console.log(`[INFO PANEL PERF] enrichmentCancelled (metadata) for ${marker.name}`);
                return;
            }
            if (!data) return;
            
            const newData = adaptLocationInfoToResolvedEntity(data);
            setSelectedEntity((prev: any) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    metadata: {
                        ...prev.metadata,
                        ...newData.metadata,
                        news: prev.metadata.pendingNews || (newData.metadata.news?.length ? newData.metadata.news : prev.metadata.news),
                        sectionState: {
                            ...(prev.metadata.sectionState || {}),
                            description: data.sectionState?.description || "ready",
                            nearby: data.sectionState?.nearby || "ready",
                            climate: "ready",
                            population: "ready",
                            news: prev.metadata.pendingNews ? "ready" : "loading"
                        }
                    }
                };
            });
        }).catch(err => {
            console.error("Metadata fetch failed", err);
        });

        // Fetch News
        console.log(`[INFO PANEL PERF] newsStarted at ${Date.now()}`);
        if (setIsNewsFetching) setIsNewsFetching(true);
        import('../services/newsService').then(({ fetchLiveNews }) => {
            fetchLiveNews(marker.name).then(newsData => {
                console.log(`[INFO PANEL PERF] newsCompleted at ${Date.now()}`);
                if (id !== requestId.current) {
                    console.log(`[INFO PANEL PERF] enrichmentCancelled (news) for ${marker.name}`);
                    return;
                }
                if (setIsNewsFetching) setIsNewsFetching(false);
                setSelectedEntity((prev: any) => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        metadata: {
                            ...prev.metadata,
                            pendingNews: newsData,
                            news: prev.metadata.sectionState?.description === "ready" ? newsData : prev.metadata.news,
                            sectionState: { 
                                ...(prev.metadata.sectionState || {}), 
                                news: prev.metadata.sectionState?.description === "ready" ? "ready" : "loading" 
                            }
                        }
                    };
                });
            }).catch(err => {
                console.error("News fetch failed", err);
                if (id !== requestId.current) return;
                if (setIsNewsFetching) setIsNewsFetching(false);
                setSelectedEntity((prev: any) => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        metadata: {
                            ...prev.metadata,
                            sectionState: { ...(prev.metadata.sectionState || {}), news: "failed" }
                        }
                    };
                });
            });
        });

    }, [setSelectedEntity, setIsNewsFetching]);

    return { enrichEntity };
}
