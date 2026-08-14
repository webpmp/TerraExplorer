import { Candidate } from '../../types';
import { isLowSignificancePoi } from './classification';

export const applyQualityGate = (candidates: Candidate[]): Candidate[] => {
    return candidates.filter(c => {
        if (c.eligibleForDefaultDiscovery === false || c.eligibility === 'ineligible') {
            c.pipelineStatus = "rejected";
            c.rejectionReason = c.exclusionReason || c.eligibilityReason || "Ineligible for default discovery";
            return false;
        }

        if (c.entityClass === 'administrative_region' || c.type === 'administrative') {
            c.pipelineStatus = "rejected";
            c.rejectionReason = "Administrative region with insufficient independent significance";
            return false;
        }

        if (isLowSignificancePoi(c.name, c.type, c.discoverySignals || [])) {
            c.pipelineStatus = "rejected";
            c.rejectionReason = "Obscure POI";
            return false;
        }

        if ((c.importanceScore || 0) <= 0) {
            c.pipelineStatus = "rejected";
            c.rejectionReason = "Below relevance threshold";
            return false;
        }

        c.pipelineStatus = "quality_gated";
        return true;
    });
};
