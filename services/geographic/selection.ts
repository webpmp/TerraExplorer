import { Candidate } from '../../types';
import { selectionConfig } from './selectionConfig';
import { isLowSignificancePoi } from './classification';

export const applySelection = (sortedCandidates: Candidate[], limit: number = 6): Candidate[] => {
    const selected: Candidate[] = [];
    const categoryCounts: Record<string, number> = {};

    const isEligible = (c: Candidate): boolean => {
        if (c.eligibleForDefaultDiscovery === false || c.eligibility === 'ineligible') return false;
        if (c.rankingClass === 'ADMINISTRATIVE_REGION' || c.entityClass === 'administrative_region' || c.type === 'administrative') return false;
        if (isLowSignificancePoi(c.name, c.type, c.discoverySignals || [])) return false;
        if (c.relevanceScore !== undefined && c.relevanceThreshold !== undefined && c.relevanceScore < c.relevanceThreshold) return false;
        return true;
    };

    const tryAddCandidate = (candidate: Candidate, primary?: Candidate): boolean => {
        // Administrative regions are never selected
        if (candidate.rankingClass === 'ADMINISTRATIVE_REGION' || candidate.entityClass === 'administrative_region' || candidate.type === 'administrative') {
            candidate.pipelineStatus = "rejected";
            candidate.rejectionReason = "Administrative region with insufficient independent significance";
            return false;
        }

        if (!isEligible(candidate)) {
            candidate.pipelineStatus = "rejected";
            candidate.rejectionReason = candidate.exclusionReason || candidate.eligibilityReason || "Ineligible for default discovery";
            return false;
        }

        // Secondary settlement filtering relative to primary settlement
        if (primary && primary.id !== candidate.id) {
            const primaryIsSettlement = primary.rankingClass === 'POPULATED_PLACE' || primary.entityClass === 'settlement';
            const candIsSettlement = candidate.rankingClass === 'POPULATED_PLACE' || candidate.entityClass === 'settlement';
            
            if (primaryIsSettlement && candIsSettlement) {
                const primaryDist = primary.distanceKm ?? 0;
                const candDist = candidate.distanceKm ?? 0;
                
                // If candidate is a distant small settlement (Tier C / Tier D) further than primary settlement
                if (candDist > primaryDist * 1.5 && candDist > 25 && (candidate.prominenceTier === 'Tier C' || candidate.prominenceTier === 'Tier D' || (candidate.tier || 3) > 2)) {
                    candidate.pipelineStatus = "rejected";
                    candidate.rejectionReason = `Secondary candidate after stronger primary entity (${primary.name})`;
                    return false;
                }
            }
        }

        // Spatial Clustering Check
        for (const existing of selected) {
            const eLatDiff = Math.abs(candidate.coordinates.lat - existing.coordinates.lat);
            const eLngDiff = Math.abs(candidate.coordinates.lng - existing.coordinates.lng);
            const distKm = Math.sqrt(Math.pow(eLatDiff * 111, 2) + Math.pow(eLngDiff * 111, 2));
            
            if (distKm < selectionConfig.spatialThresholdKm) {
                if (existing.type === candidate.type || (existing.importanceScore || 0) > (candidate.importanceScore || 0) + 20) {
                    candidate.pipelineStatus = "rejected";
                    candidate.rejectionReason = `Duplicate geographic entity (${existing.name})`;
                    return false;
                }
            }
        }

        // Accepted
        selected.push(candidate);
        const finalType = (candidate.type || 'poi').toLowerCase();
        categoryCounts[finalType] = (categoryCounts[finalType] || 0) + 1;
        categoryCounts[candidate.entityClass || 'generic'] = (categoryCounts[candidate.entityClass || 'generic'] || 0) + 1;
        candidate.pipelineStatus = "selected";
        return true;
    };

    // Filter eligible candidates
    const eligibleCandidates = sortedCandidates.filter(isEligible);

    // Sort eligible candidates using stable hierarchy comparator
    const sortedEligible = [...eligibleCandidates].sort((a, b) => {
        const tierA = a.tier || 3;
        const tierB = b.tier || 3;
        const distA = a.distanceKm ?? 999;
        const distB = b.distanceKm ?? 999;
        const scoreA = a.importanceScore ?? 0;
        const scoreB = b.importanceScore ?? 0;

        const isSettlementA = a.rankingClass === 'POPULATED_PLACE' || a.entityClass === 'settlement';
        const isSettlementB = b.rankingClass === 'POPULATED_PLACE' || b.entityClass === 'settlement';

        // Nearby settlement (< 35km) vs distant feature (> 30km)
        if (isSettlementA && !isSettlementB && distA < 35 && distB > 30 && tierA <= 2 && tierB >= 2) {
            return -1;
        }
        if (isSettlementB && !isSettlementA && distB < 35 && distA > 30 && tierB <= 2 && tierA >= 2) {
            return 1;
        }

        // Tier comparison (Tier 1 > Tier 2 > Tier 3)
        if (tierA !== tierB) {
            // If Tier 1 is very distant (> 80km) and Tier 2 is close (< 35km settlement)
            if (tierA === 1 && distA > 80 && isSettlementB && distB < 35) return 1;
            if (tierB === 1 && distB > 80 && isSettlementA && distA < 35) return -1;
            return tierA - tierB;
        }

        // Same tier: score difference
        if (scoreA !== scoreB && Math.abs(scoreA - scoreB) >= 10) {
            return scoreB - scoreA;
        }

        return distA - distB;
    });

    // Dynamic caps per class to ensure a balanced, geographically meaningful result set
    const maxSettlements = selectionConfig.maxPerClass.settlement ?? 3;
    const maxFeatures = selectionConfig.maxPerClass.geographic_feature ?? 3;
    const maxPois = selectionConfig.maxPerClass.major_landmark ?? 2;

    let primary: Candidate | undefined = sortedEligible[0];

    // Pass 1: Select candidates in hierarchical ranking order while enforcing diversity caps
    for (const candidate of sortedEligible) {
        if (selected.length >= limit) break;

        const isSettlement = candidate.rankingClass === 'POPULATED_PLACE' || candidate.entityClass === 'settlement';
        const isFeature = candidate.rankingClass === 'GEOGRAPHIC_FEATURE' || candidate.entityClass === 'geographic_feature';
        const isPoi = !isSettlement && !isFeature;

        const currentSettlements = selected.filter(s => s.rankingClass === 'POPULATED_PLACE' || s.entityClass === 'settlement').length;
        const currentFeatures = selected.filter(s => s.rankingClass === 'GEOGRAPHIC_FEATURE' || s.entityClass === 'geographic_feature').length;
        const currentPois = selected.filter(s => s.rankingClass !== 'POPULATED_PLACE' && s.rankingClass !== 'GEOGRAPHIC_FEATURE' && s.entityClass !== 'settlement' && s.entityClass !== 'geographic_feature').length;

        if (isSettlement && currentSettlements >= maxSettlements) continue;
        if (isFeature && currentFeatures >= maxFeatures) continue;
        if (isPoi && currentPois >= maxPois) continue;

        tryAddCandidate(candidate, primary);
        if (selected.length === 1 && !primary) primary = selected[0];
    }

    // Pass 2: Fill any remaining open slots up to limit from remaining eligible candidates
    if (selected.length < limit) {
        for (const candidate of sortedEligible) {
            if (selected.length >= limit) break;
            if (selected.some(s => s.id === candidate.id)) continue;
            tryAddCandidate(candidate, primary);
        }
    }

    // Mark remaining unselected candidates as rejected
    for (const c of sortedCandidates) {
        if (!selected.some(s => s.id === c.id) && c.pipelineStatus !== "rejected") {
            c.pipelineStatus = "rejected";
            c.rejectionReason = c.rejectionReason || "Exceeded result limit or deprioritized";
        }
    }

    return selected;
};
