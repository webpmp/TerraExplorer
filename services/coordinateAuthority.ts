import { ResolvedCoordinates } from '../types';

const PRIORITY = {
    deterministic: 3,
    geocoder: 2,
    ai_recovery: 1
};

export const mergeCoordinates = (
    existing: ResolvedCoordinates | undefined | null,
    incoming: ResolvedCoordinates
): ResolvedCoordinates => {
    if (!existing) return incoming;
    
    const existingPriority = PRIORITY[existing.source] || 0;
    const incomingPriority = PRIORITY[incoming.source] || 0;
    
    if (incomingPriority > existingPriority) {
        return incoming;
    }
    
    // Tie-breaker or protect existing valid coordinate
    return existing;
};
