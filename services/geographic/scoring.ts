import { Candidate } from '../../types';
import { scoringConfig } from './scoringConfig';
import { getGeographicHierarchy, isLowSignificancePoi } from './classification';

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

    // Calculate distance
    const eLatDiff = Math.abs(candidate.coordinates.lat - originLat);
    const eLngDiff = Math.abs(candidate.coordinates.lng - originLng);
    const distKm = Math.sqrt(Math.pow(eLatDiff * 111, 2) + Math.pow(eLngDiff * 111, 2));
    candidate.distanceKm = distKm;
    candidate.insideEntity = distKm <= 1.5;

    // Store hierarchy, tier, and metadata
    const hierarchy = await getGeographicHierarchy(candidate);
    candidate.tier = hierarchy.tier;
    candidate.prominenceTier = hierarchy.prominenceTier;
    candidate.prominenceEvidence = hierarchy.prominenceEvidence;
    candidate.settlementTier = hierarchy.settlementTier;
    candidate.entityClass = hierarchy.category === 'administrative_region' ? 'administrative_region' : (candidate.entityClass || hierarchy.category);
    (candidate as any).geographicCategory = hierarchy.category;
    (candidate as any).geographicImportance = hierarchy.importance;
    candidate.researchSignificance = hierarchy.researchSignificance;
    candidate.recognizability = hierarchy.recognizability;
    candidate.geographicSpecificity = hierarchy.geographicSpecificity;
    candidate.administrativeScale = hierarchy.administrativeScale;
    candidate.eligibleForDefaultDiscovery = hierarchy.eligibleForDefaultDiscovery;
    candidate.exclusionReason = hierarchy.exclusionReason;
    candidate.selectionReason = hierarchy.selectionReason;
    candidate.eligibility = hierarchy.eligibility;
    candidate.eligibilityReason = hierarchy.eligibilityReason;
    candidate.wikipediaEvidence = (candidate.providers && candidate.providers.includes('Wikipedia')) || candidate.identifiers?.wikipediaId ? "Documented on Wikipedia" : "No Wikipedia documentation";
    candidate.geographicRelevance = candidate.insideEntity ? 'high' : (distKm <= 25 ? 'medium' : 'low');

    // For Tier C settlements (small local towns without regional/municipal documentation): only eligible within local range (<= 20km) or direct click
    if (hierarchy.settlementTier === 'C' && distKm > 20.0 && !candidate.insideEntity) {
        candidate.eligibleForDefaultDiscovery = false;
        candidate.eligibility = 'ineligible';
        candidate.exclusionReason = `Tier C town outside local relevance radius (${Math.round(distKm)}km > 20km)`;
        candidate.eligibilityReason = `Tier C town outside local relevance radius (${Math.round(distKm)}km > 20km)`;
    }

    // 1. Ineligible / Low significance POI / Country container suppression
    if (!candidate.eligibleForDefaultDiscovery || candidate.eligibility === 'ineligible' || candidate.entityClass === 'administrative_region' || isLowSignificancePoi(candidate.name, candidate.type, candidate.discoverySignals || [])) {
        candidate.eligibility = 'ineligible';
        candidate.importanceScore = -100;
        candidate.confidenceScore = 10;
        candidate.relevanceScore = 0;
        candidate.relevanceThreshold = 20;
        candidate.pipelineStatus = "scored";
        return;
    }

    const type = (candidate.type || 'poi').toLowerCase();

    // 2. Base classification & Prominence (Hierarchy: CITY > TOWN > VILLAGE > OTHER POPULATED PLACE > NATURAL/CULTURAL FEATURE)
    let baseWeight = 40;
    if (hierarchy.discoveryCategory === 'MAJOR_SETTLEMENT') baseWeight = 100;
    else if (hierarchy.discoveryCategory === 'RECOGNIZABLE_SETTLEMENT') {
        if (type === 'city') baseWeight = 95;
        else if (type === 'town' || type === 'municipality') baseWeight = 85;
        else if (type === 'village') baseWeight = 75;
        else baseWeight = 70;
    }
    else if (hierarchy.discoveryCategory === 'MAJOR_NATURAL_CULTURAL_FEATURE') baseWeight = 60;

    const typeWeight = scoringConfig.typeWeights[type] !== undefined ? scoringConfig.typeWeights[type] : 20;
    breakdown.baseClassification = baseWeight + typeWeight;
    importance += baseWeight + typeWeight;

    // 3. Population & Admin Bonuses for Settlements
    let adminScore = 0;
    let popScore = 0;
    if (candidate.entityClass === 'settlement' || hierarchy.category === 'settlement') {
        if (type === 'municipality' || type === 'town' || type === 'city') adminScore = scoringConfig.adminBonuses.municipality || 20;
        else if (type === 'county seat') adminScore = scoringConfig.adminBonuses.county_seat || 15;
        else if (type === 'populated place' || type === 'village') adminScore = scoringConfig.adminBonuses.populated_place || 10;
        
        const popClass = candidate.populationClass || 'small';
        const popVal = typeof candidate.population === 'number' ? candidate.population : (candidate.population?.value || 0);
        if (popClass === 'large' || popVal >= 100000) popScore = scoringConfig.populationBonuses['>100k'];
        else if (popClass === 'medium' || popVal >= 25000) popScore = scoringConfig.populationBonuses['>25k'];
        else if (popVal >= 5000) popScore = scoringConfig.populationBonuses['>1k'] || 10;
    }
    
    breakdown.administrative = adminScore;
    breakdown.population = popScore;
    importance += adminScore + popScore;

    // 4. Research Significance & Recognizability Bonuses
    let researchBonus = 0;
    if (candidate.researchSignificance === 'high') researchBonus += 30;
    else if (candidate.researchSignificance === 'medium') researchBonus += 15;
    
    if (candidate.recognizability === 'high') researchBonus += 30;
    else if (candidate.recognizability === 'medium') researchBonus += 15;

    importance += researchBonus;

    // 5. Landmark & Features
    let landmarkScore = 0;
    if (candidate.discoverySignals) {
        const signals = candidate.discoverySignals.join(' ').toLowerCase();
        if (signals.includes('national park') || signals.includes('protected')) landmarkScore += scoringConfig.bonuses.protectedArea;
        if (signals.includes('unesco') || signals.includes('world heritage')) landmarkScore += scoringConfig.bonuses.unescoSite;
        if (signals.includes('tourism')) landmarkScore += scoringConfig.bonuses.tourismSignificance;
    }
    breakdown.landmark = landmarkScore;
    importance += landmarkScore;

    // 6. Proximity Score (Secondary modifier, does NOT dominate)
    let proximityScore = 0;
    if (candidate.insideEntity) {
        proximityScore = 20;
    } else if (distKm <= 25) {
        proximityScore = 15;
    } else if (distKm <= 75) {
        proximityScore = 10;
    } else if (distKm <= 150) {
        proximityScore = 5;
    } else {
        proximityScore = 0;
    }
    breakdown.distance = proximityScore;
    importance += proximityScore;

    // 7. Provider Confidence & Consensus
    const providerCount = candidate.providers ? candidate.providers.length : 1;
    const consensusBonus = (providerCount - 1) * scoringConfig.bonuses.providerConsensus;
    breakdown.consensus = consensusBonus;
    importance += consensusBonus;
    
    let baseConfidence = 60;
    if (candidate.providers && candidate.providers.includes("Wikipedia")) baseConfidence += 20;
    if (candidate.providers && candidate.providers.includes("OpenStreetMap")) baseConfidence += 15;

    if (candidate.entityClass === 'settlement' && candidate.settlementConfidence) {
        baseConfidence += candidate.settlementConfidence;
    }
    
    candidate.importanceScore = Math.round(importance);
    candidate.finalScore = candidate.importanceScore;
    candidate.confidenceScore = Math.round(baseConfidence);
    candidate.scoreBreakdown = breakdown;
    candidate.isAdministrative = hierarchy.category === 'administrative_region' || Boolean(candidate.isAdministrative);
    candidate.directClickMatch = Boolean(candidate.insideEntity);
    candidate.wikidataEvidence = candidate.identifiers?.wikidataId || (candidate.discoverySignals && candidate.discoverySignals.some(s => s.includes('wikidata'))) ? 'Documented on Wikidata' : 'No Wikidata documentation';

    if (candidate.insideEntity) {
        candidate.selectionReason = `${candidate.name} selected because the clicked coordinate is inside the recognized boundary.`;
    } else if (candidate.settlementTier === 'A') {
        candidate.selectionReason = `${candidate.name} selected because it is a major city / metropolitan center of high research significance.`;
    } else if (candidate.settlementTier === 'B') {
        candidate.selectionReason = `${candidate.name} selected because it is a recognized regional settlement.`;
    } else if (candidate.entityClass === 'major_landmark' || candidate.entityClass === 'geographic_feature') {
        candidate.selectionReason = `${candidate.name} selected because it is a major geographic feature of high research significance.`;
    } else {
        candidate.selectionReason = `${candidate.name} selected as a relevant nearby discovery entity.`;
    }

    // Calculate relevance score and threshold
    let relevance = 0;
    const threshold = 20;

    if (hierarchy.tier === 1) relevance += 50;
    else if (hierarchy.tier === 2) relevance += 40;
    else if (hierarchy.tier === 3) relevance += 25;
    else relevance -= 50;

    if (candidate.insideEntity) relevance += 25;
    else if (distKm <= 25.0) relevance += 20;
    else if (distKm <= 75.0) relevance += 10;

    candidate.relevanceScore = Math.max(0, Math.round(relevance));
    candidate.relevanceThreshold = threshold;
    candidate.pipelineStatus = "scored";
};
