import { Candidate } from '../../types';
import { scoringConfig } from './scoringConfig';
import { getGeographicHierarchy } from './classification';

export const computeImportanceScore = async (candidate: Candidate, originLat: number, originLng: number): Promise<void> => {
    let importance = 0;
    let confidence = 0;

    const breakdown = {
        baseClassification: 0,
        administrative: 0,
        population: 0,
        landmark: 0,
        providerConfidence: 0,
        consensus: 0,
        distance: 0,
        poiSuppression: 0
    };

    // Store the tier and category
    const hierarchy = await getGeographicHierarchy(candidate);
    candidate.tier = hierarchy.tier;
    (candidate as any).geographicCategory = hierarchy.category;
    (candidate as any).geographicImportance = hierarchy.importance;

    // 1. Base classification
    const type = (candidate.type || 'poi').toLowerCase();
    const typeWeight = scoringConfig.typeWeights[type] !== undefined ? scoringConfig.typeWeights[type] : 10;
    
    breakdown.baseClassification = typeWeight;
    importance += typeWeight;

    // 2. Population & Admin (New Logic)
    let adminScore = 0;
    let popScore = 0;
    if (candidate.entityClass === 'settlement') {
        if (type === 'municipality' || type === 'town' || type === 'city') adminScore = scoringConfig.adminBonuses.municipality;
        else if (type === 'county seat') adminScore = scoringConfig.adminBonuses.county_seat;
        else if (type === 'populated place' || type === 'village' || type === 'hamlet') adminScore = scoringConfig.adminBonuses.populated_place;
        
        // Approximate pop from existing classes or tags if any (the system only has 'large', 'medium', 'small' right now, we can map them)
        const popClass = candidate.populationClass || 'small';
        if (popClass === 'large') popScore = scoringConfig.populationBonuses['>100k'];
        else if (popClass === 'medium') popScore = scoringConfig.populationBonuses['>25k'];
        else popScore = scoringConfig.populationBonuses['>1k'] || 0; // default for settlements
    }
    
    breakdown.administrative = adminScore;
    breakdown.population = popScore;
    importance += adminScore + popScore;

    // 3. Landmark & Features
    let landmarkScore = 0;
    if (candidate.discoverySignals) {
        const signals = candidate.discoverySignals.join(' ').toLowerCase();
        if (signals.includes('national park') || signals.includes('protected')) landmarkScore += scoringConfig.bonuses.protectedArea;
        if (signals.includes('unesco')) landmarkScore += scoringConfig.bonuses.unescoSite;
        if (signals.includes('tourism')) landmarkScore += scoringConfig.bonuses.tourismSignificance;
    }
    breakdown.landmark = landmarkScore;
    importance += landmarkScore;

    // POI Suppression
    let suppression = 0;
    const name = (candidate.name || '').toLowerCase();
    if (name.includes('preserve') || type === 'preserve') suppression += scoringConfig.poiSuppressions.preserve;
    else if (name.includes('management area')) suppression += scoringConfig.poiSuppressions.management_area;
    else if (name.includes('scrub') || name.includes('wetland') || name.includes('trail')) suppression += scoringConfig.poiSuppressions.scrub;
    else if (name.includes('marker') || (type === 'historic' && !landmarkScore)) suppression += scoringConfig.poiSuppressions.minor_historic_marker;

    breakdown.poiSuppression = suppression;
    importance += suppression;

    // 4. Distance
    const eLatDiff = Math.abs(candidate.coordinates.lat - originLat);
    const eLngDiff = Math.abs(candidate.coordinates.lng - originLng);
    const distKm = Math.sqrt(Math.pow(eLatDiff * 111, 2) + Math.pow(eLngDiff * 111, 2));
    
    // Distance no longer affects importanceScore, only used for final sorting.
    breakdown.distance = distKm;

    // 5. Provider Confidence & Consensus (Affects both Importance and Confidence)
    const providerCount = candidate.providers ? candidate.providers.length : 1;
    const consensusBonus = (providerCount - 1) * scoringConfig.bonuses.providerConsensus;
    
    breakdown.consensus = consensusBonus;
    importance += consensusBonus;
    
    let baseConfidence = 50;
    if (candidate.providers && candidate.providers.includes("Wikipedia")) baseConfidence += 30;
    if (candidate.providers && candidate.providers.includes("OpenStreetMap")) baseConfidence += 20;

    // Settlement Confidence Bonus
    if (candidate.entityClass === 'settlement' && candidate.settlementConfidence) {
        baseConfidence += candidate.settlementConfidence;
    }
    
    confidence = Math.min(100, baseConfidence + (providerCount * 10));
    breakdown.providerConfidence = baseConfidence;

    candidate.importanceScore = Math.round(importance);
    candidate.confidenceScore = Math.round(confidence);
    candidate.scoreBreakdown = breakdown;
    candidate.pipelineStatus = "scored";
};
