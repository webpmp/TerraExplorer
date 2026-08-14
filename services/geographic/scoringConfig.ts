export const SCORING_VERSION = 2;

export const scoringConfig = {
    typeWeights: {
        capital: 100,
        city: 95,
        town: 80,
        municipality: 80,
        village: 65,
        national_park: 75,
        state_park: 60,
        historic_site: 65,
        mountain: 60,
        volcano: 65,
        lake: 55,
        river: 50,
        water_body: 50,
        island: 70,
        museum: 60,
        hamlet: 10,
        geology: 30,
        road: -80,
        intersection: -90,
        coordinate_anchor: -100,
        administrative: 10,
        historic: 65,
        natural: 55,
        tourism: 50,
        landmark: 65,
        archaeological_site: 70,
        shipwreck_site: 65,
        transportation: 30,
        mine: -100,
        trail: -100
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
