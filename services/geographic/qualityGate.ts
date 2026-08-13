import { Candidate } from '../../types';

export const applyQualityGate = (candidates: Candidate[]): Candidate[] => {
    return candidates.filter(c => {
        if ((c.importanceScore || 0) < 0) {
            c.pipelineStatus = "rejected";
            c.rejectionReason = "Negative importance score";
            return false;
        }
        if ((c.importanceScore || 0) >= 20 || (c.confidenceScore || 0) >= 75) {
            c.pipelineStatus = "quality_gated";
            return true;
        } else {
            c.pipelineStatus = "rejected";
            c.rejectionReason = "Below quality thresholds";
            return false;
        }
    });
};
