export const SCORING_VERSION = 2;

export const scoringConfig = {
    typeWeights: {
        city: 80,
        capital: 100,
        national_park: 90,
        state_park: 60,
        historic_site: 65,
        mountain: 70,
        lake: 60,
        river: 50,
        museum: 60,
        town: 50,
        village: 20,
        hamlet: -20,
        geology: 20,
        road: -50,
        intersection: -80,
        coordinate_anchor: -100,
        administrative: 40,
        historic: 60,
        natural: 50,
        tourism: 50,
        landmark: 60,
        transportation: 30
    } as Record<string, number>,
    
    adminBonuses: {
        municipality: 50,
        town: 50,
        city: 50,
        county_seat: 40,
        populated_place: 30
    } as Record<string, number>,

    populationBonuses: {
        ">100k": 50,
        ">25k": 40,
        ">5k": 30,
        ">1k": 20
    } as Record<string, number>,

    poiSuppressions: {
        preserve: -30,
        management_area: -30,
        scrub: -40,
        wetland: -40,
        trail: -40,
        minor_historic_marker: -25
    } as Record<string, number>,

    populationTiers: {
        large: 30, // > 100k
        medium: 15, // > 10k
        small: 0
    } as Record<string, number>,

    bonuses: {
        providerConsensus: 15, // per additional provider
        protectedArea: 20,
        tourismSignificance: 25,
        unescoSite: 40
    },

    distanceDecay: -0.5 // Penalty points per km
};
