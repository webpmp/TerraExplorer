export const EXACT_MATCH_BONUS = 0.10;
export const ADDRESS_RANK_BONUS = 0.05;
export const LOW_PRECISION_PENALTY = -0.20;
export const LOW_CONFIDENCE_THRESHOLD = 0.30;
export const AMBIGUITY_THRESHOLD = 0.10;
export const CATCH_ALL_PENALTY = -0.10;

export const ConfidenceDescriptions = {
    EXACT_MATCH: "Exact match between normalized query and display name.",
    ADDRESS_RANK: "City-level or higher administrative rank.",
    LOW_PRECISION: "Low-precision type (e.g. neighborhood, suburb) penalised.",
    CATCH_ALL: "Catch-all or undefined boundary type penalised."
};
