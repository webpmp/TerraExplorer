import { Candidate } from '../../types';
import { selectionConfig } from './selectionConfig';

export const applySelection = (sortedCandidates: Candidate[], limit: number = 10): Candidate[] => {
    const selected: Candidate[] = [];
    const categoryCounts: Record<string, number> = {};

    for (const candidate of sortedCandidates) {
        if (selected.length >= limit) {
            candidate.pipelineStatus = "rejected";
            candidate.rejectionReason = "Limit reached";
            continue;
        }
        
        if (candidate.isAnchor) {
            // Anchor bypasses rejection
        } else {
            if (candidate.entityClass === 'administrative_region') {
                candidate.pipelineStatus = "rejected";
                candidate.rejectionReason = "Administrative regions cannot be selected as markers";
                continue;
            }

            // 1. Category Diversity Check
            const type = (candidate.type || 'poi').toLowerCase();
            const entityClass = (candidate.entityClass || 'generic');
            
            const maxForClass = selectionConfig.maxPerClass[entityClass];
            if (maxForClass !== undefined) {
                if ((categoryCounts[entityClass] || 0) >= maxForClass) {
                    candidate.pipelineStatus = "rejected";
                    candidate.rejectionReason = `Class overflow (${entityClass})`;
                    continue;
                }
            }

            const maxForType = selectionConfig.maxPerCategory[type];
            if (maxForType !== undefined) {
                if ((categoryCounts[type] || 0) >= maxForType) {
                    candidate.pipelineStatus = "rejected";
                    candidate.rejectionReason = `Category overflow (${type})`;
                    continue;
                }
            }

            // 2. Spatial Clustering Check
            let isClustered = false;
            for (const existing of selected) {
                const eLatDiff = Math.abs(candidate.coordinates.lat - existing.coordinates.lat);
                const eLngDiff = Math.abs(candidate.coordinates.lng - existing.coordinates.lng);
                const distKm = Math.sqrt(Math.pow(eLatDiff * 111, 2) + Math.pow(eLngDiff * 111, 2));
                
                if (distKm < selectionConfig.spatialThresholdKm) {
                    // Same generic type (e.g., both parks or both cities) -> cluster suppress
                    if (existing.type === candidate.type || existing.importanceScore! > candidate.importanceScore! + 30) {
                        isClustered = true;
                        candidate.pipelineStatus = "rejected";
                        candidate.rejectionReason = `Clustered near ${existing.name}`;
                        break;
                    }
                }
            }
            
            if (isClustered) continue;
        }

        // Accepted
        selected.push(candidate);
        const finalType = (candidate.type || 'poi').toLowerCase();
        categoryCounts[finalType] = (categoryCounts[finalType] || 0) + 1;
        categoryCounts[candidate.entityClass || 'generic'] = (categoryCounts[candidate.entityClass || 'generic'] || 0) + 1;
        candidate.pipelineStatus = "selected";
    }

    return selected;
};
