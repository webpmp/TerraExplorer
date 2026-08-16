import { Candidate } from '../../types';
import { GeographicEntityType } from '../../domain';
import { classifyGeographicEntity, classifyGeographicEntityWithEvidence } from '../classifierService';
import { normalizeEnglishDisplayName } from '../../utils/englishNameNormalization';

export type EntityClass = 'settlement' | 'administrative_region' | 'major_landmark' | 'geographic_feature' | 'minor_poi' | 'generic';

export type DiscoveryCategory = 
  | 'MAJOR_SETTLEMENT' 
  | 'RECOGNIZABLE_SETTLEMENT' 
  | 'MAJOR_NATURAL_CULTURAL_FEATURE' 
  | 'MINOR_SETTLEMENT' 
  | 'ADMINISTRATIVE_CONTEXT' 
  | 'ADMINISTRATIVE_REGION' 
  | 'OBSCURE_LOCAL_FEATURE';

/**
 * Identify low-significance / obscure POIs that should not be returned by generic globe discovery.
 */
export const isLowSignificancePoi = (name: string, type: string = '', signals: string[] = []): boolean => {
    const n = (name || '').toLowerCase();
    const t = (type || '').toLowerCase();
    const sigStr = (signals || []).join(' ').toLowerCase();

    // High value exceptions (UNESCO, National Park, National Historic Landmark, major museum, explicit landmark/historic type)
    if (sigStr.includes('unesco') || sigStr.includes('world heritage') || sigStr.includes('national park') || sigStr.includes('national historic') || sigStr.includes('national monument') || n.includes('palace') || n.includes('istana')) {
        // Still filter out mines/quarries even if loosely tagged
        if (/\b(mine|quarry|claim|gravel pit)\b/i.test(n)) return true;
        return false;
    }

    // Explicit low significance keywords
    const obscurePatterns = [
        /\b(mine|quarry|claim|gravel pit|placer|deposit|shaft|adit)\b/i,
        /\b(substation|power pole|cell tower|repeater|antenna|water tank|pumping station|utility|culvert|cattle guard)\b/i,
        /\b(trail|trailhead|footpath|track|crossing)\b/i,
        /\b(shed|barn|warehouse|storage facility|parking|parking lot|parking_space|rest stop|rest area)\b/i,
        /\b(survey marker|bench mark|benchmark|milepost|cut-off|gate)\b/i,
        /\b(farm to market|farm-to-market|ranch road|county road|cr\s*\d+|fm\s*\d+)\b/i,
        /\b(cemetery|church|high school|middle school|elementary school|post office)\b/i,
        /\b(business park|industrial park|technology park|science park|sports park|training center|training facility|champion'?s park)\b/i,
        /\b(makam|tugu|patung|candi kecil|pematang|tomb|grave|wayside shrine|wayside cross|rotary|roundabout|fountain)\b/i
    ];

    if (obscurePatterns.some(p => p.test(n))) {
        return true;
    }

    const obscureTypes = [
        'mine', 'quarry', 'trail', 'track', 'footway', 'path', 'culvert', 'crossing',
        'substation', 'utility_pole', 'cell_tower', 'power', 'telecom', 'bench', 'artwork', 'parking_space',
        'hamlet', 'isolated_dwelling', 'locality', 'road', 'house', 'farm', 'tomb', 'grave', 'wayside_shrine', 'wayside_cross'
    ];
    if (obscureTypes.includes(t)) {
        return true;
    }

    return false;
};

export const classifyEntity = (candidate: Candidate): EntityClass => {
    const type = (candidate.type || '').toLowerCase();
    const name = (candidate.name || '').toLowerCase();
    const signals = (candidate.discoverySignals || []).map(s => s.toLowerCase());

    const adminTypes = ['state', 'province', 'county', 'district', 'governorate', 'prefecture', 'region', 'administrative', 'regional_district', 'country', 'township', 'parish'];
    if (adminTypes.includes(type) || name.includes('county') || name.includes('regional district') || name.includes('township') || name.includes('parish')) {
        return 'administrative_region';
    }

    if (isLowSignificancePoi(candidate.name, candidate.type, candidate.discoverySignals || [])) {
        return 'minor_poi';
    }

    if (type === 'city' || type === 'town' || type === 'village' || type === 'municipality' || type === 'county seat' || type === 'populated place' || signals.some(s => s.includes('capital') || s.includes('city') || s.includes('town') || s.includes('municipality'))) {
        if (!name.includes('park') && !name.includes('hall') && !name.includes('museum')) return 'settlement';
    }

    const geoFeatureTypes = ['national_park', 'mountain', 'mountain_range', 'volcano', 'hill', 'canyon', 'valley', 'lake', 'river', 'waterfall', 'glacier', 'island', 'peninsula', 'desert', 'forest', 'cave', 'beach', 'strait', 'bay', 'ocean', 'sea', 'water_body', 'natural', 'natural_feature'];
    if (geoFeatureTypes.includes(type) || type === 'landmark' || type === 'historic' || type === 'museum' || type === 'tourism' || signals.some(s => s.includes('national park') || s.includes('unesco') || s.includes('major landmark') || s.includes('historic site'))) {
        return geoFeatureTypes.includes(type) ? 'geographic_feature' : 'major_landmark';
    }

    if (name.includes('preserve') || name.includes('management area') || name.includes('scrub') || name.includes('wetland') || name.includes('marker') || name.includes('mound') || type === 'preserve') {
        if (!signals.some(s => s.includes('unesco'))) return 'minor_poi';
    }

    if (type === 'tourism' || type === 'landmark' || type === 'museum' || type === 'historic') return 'major_landmark';

    return 'generic';
};

export interface GeographicHierarchyResult {
    tier: 1 | 2 | 3 | 4 | 5;
    category: string;
    discoveryCategory: DiscoveryCategory;
    settlementTier?: 'A' | 'B' | 'C' | 'D' | 'E';
    importance: string;
    prominenceTier?: 'Tier A' | 'Tier B' | 'Tier C' | 'Tier D';
    prominenceEvidence?: string;
    researchSignificance?: 'high' | 'medium' | 'low' | 'none';
    recognizability?: 'high' | 'medium' | 'low' | 'none';
    geographicSpecificity?: 'point' | 'local' | 'regional' | 'broad_area';
    administrativeScale?: 'settlement' | 'feature' | 'landmark' | 'county' | 'district' | 'state' | 'country' | 'none';
    eligibleForDefaultDiscovery?: boolean;
    eligibility?: 'eligible' | 'ineligible';
    eligibilityReason?: string;
    exclusionReason?: string;
    selectionReason?: string;
}

export const classifyEntityWithHierarchy = async (candidate: Candidate): Promise<GeographicHierarchyResult | GeographicEntityClass> => {
    const name = candidate.name || '';
    const rawType = (candidate.type || '').toLowerCase();
    const signals = candidate.discoverySignals || [];
    const sigStr = signals.join(' ').toLowerCase();

    candidate.originalProviderType = rawType || 'poi';
    candidate.displayName = normalizeEnglishDisplayName(name, candidate.rawProviders);

    const assignAndReturn = (res: GeographicHierarchyResult): GeographicHierarchyResult => {
        candidate.tier = res.tier;
        candidate.prominenceTier = res.prominenceTier;
        candidate.eligibleForDefaultDiscovery = res.eligibleForDefaultDiscovery;
        candidate.eligibility = res.eligibility;
        candidate.eligibilityReason = res.eligibilityReason;
        candidate.exclusionReason = res.exclusionReason;
        candidate.selectionReason = res.selectionReason;
        return res;
    };

    // 0. Check Non-Geographic Events, Conflicts, Insurgencies, Topics, Articles (Strict Rejection)
    const isEventOrTopic = 
        name.match(/\b(insurgency|uprising|rebellion|revolution|war|battle|conflict|offensive|siege|campaign|massacre|crisis|protest|riot|incident|accord|treaty|election|referendum|coup|strike|bombing|assassination|movement|dynasty|regime|politics of|history of|economy of|geography of|demographics of|culture of|transport in|education in|list of|timeline of|foreign relations of)\b/i) !== null ||
        sigStr.includes('insurgency') || sigStr.includes('battle') || sigStr.includes('war') || sigStr.includes('conflict') || sigStr.includes('election');

    if (isEventOrTopic) {
        candidate.normalizedEntityType = 'event_or_topic';
        candidate.rankingClass = 'REJECTED';
        candidate.entityClass = 'minor_poi';
        candidate.classificationConfidence = 'authoritative';
        candidate.classificationEvidence = 'Entity represents an event/conflict/topic, not a geographic entity';
        candidate.classificationReason = 'Entity represents an event/conflict/topic, not a populated place';
        candidate.eligibleForDefaultDiscovery = false;
        candidate.eligibility = 'ineligible';
        candidate.exclusionReason = 'Entity represents an event/conflict/topic, not a populated place';
        return assignAndReturn({
            tier: 5,
            category: 'minor_poi',
            discoveryCategory: 'OBSCURE_LOCAL_FEATURE',
            importance: 'event / topic / conflict',
            prominenceTier: 'Tier D',
            prominenceEvidence: 'Non-geographic event or topic article',
            researchSignificance: 'none',
            recognizability: 'low',
            geographicSpecificity: 'point',
            administrativeScale: 'none',
            eligibleForDefaultDiscovery: false,
            eligibility: 'ineligible',
            eligibilityReason: 'Entity represents an event/conflict/topic, not a populated place',
            exclusionReason: 'Entity represents an event/conflict/topic, not a populated place'
        });
    }

    // 1. Check false cities and administrative regions (broad containers, political/special districts, departments, provinces, states, counties)
    const falseCityPattern = /\b(congressional district|tourism district|development district|improvement district|school district|fire district|water district|special district|historic district|business district|sanitary district|oversight district|tourism oversight|development authority|housing authority|transportation authority|port authority|\d+(st|nd|rd|th)\s+congressional district)\b/i;
    const adminPattern = /\b(department|departamento|state|estado|province|provincia|county|condado|region|región|district|distrito|governorate|prefecture|canton|cantón|parish|township|census area|electoral district|congressional district|tourism district|development district|improvement district|school district|fire district|water district|special district|historic district|business district|sanitary district|oversight district|tourism oversight|development authority|housing authority|transportation authority|port authority|\d+(st|nd|rd|th)\s+congressional district)\b/i;
    
    const adminTypes = ['state', 'province', 'county', 'district', 'governorate', 'prefecture', 'region', 'administrative', 'regional_district', 'country', 'township', 'parish', 'census_tract', 'zipcode', 'postcode', 'ward', 'electoral_area', 'census area', 'electoral district', 'department', 'departamento', 'boundary'];
    
    const isFeaturePark = name.match(/\b(state park|national park|parque nacional|provincial park|nature reserve|reserva natural|state forest|state reserve)\b/i) !== null ||
                          rawType === 'national_park' || rawType === 'state_park' || rawType === 'nature_reserve';

    const isAdminRegion = !isFeaturePark && (
        adminTypes.includes(rawType) || 
        adminPattern.test(name) ||
        sigStr.includes('department') ||
        sigStr.includes('departamento') ||
        sigStr.includes('congressional') ||
        sigStr.includes('oversight district') ||
        sigStr.includes('boundary') ||
        sigStr.includes('administrative')
    );

    if (isAdminRegion) {
        if (falseCityPattern.test(name) || sigStr.includes('congressional') || sigStr.includes('oversight district')) {
            console.log(`[City Discovery] Rejected false city:\n${name}\nreason: administrative / special district`);
        }
        candidate.normalizedEntityType = 'administrative_region';
        candidate.rankingClass = 'ADMINISTRATIVE_REGION';
        candidate.entityClass = 'administrative_region';
        candidate.classificationConfidence = 'authoritative';
        candidate.classificationEvidence = 'Administrative region container rule';
        candidate.eligibleForDefaultDiscovery = false;
        candidate.isAdministrative = true;
        candidate.exclusionReason = 'Administrative region provides context but is not a discovery marker';
        return assignAndReturn({
            tier: 5,
            category: 'administrative_region',
            discoveryCategory: 'ADMINISTRATIVE_CONTEXT',
            importance: 'administrative container',
            prominenceTier: 'Tier D',
            prominenceEvidence: 'Administrative container without independent destination status',
            researchSignificance: 'none',
            recognizability: 'medium',
            geographicSpecificity: 'broad_area',
            administrativeScale: name.toLowerCase().includes('county') ? 'county' : (name.toLowerCase().includes('district') ? 'district' : 'state'),
            eligibleForDefaultDiscovery: false,
            eligibility: 'ineligible',
            eligibilityReason: 'Administrative region provides context but is not a primary discovery point marker',
            exclusionReason: 'Administrative region provides context but is not a discovery marker'
        });
    }

    // 2. Check roads / routes
    const isRoad = rawType === 'route' || rawType === 'road' || sigStr.includes('highway') || name.match(/\b(fm|cr|hw|hwy|i-)\s*\d+\b/i) !== null;
    if (isRoad) {
        candidate.normalizedEntityType = 'road';
        candidate.rankingClass = 'POI';
        candidate.classificationConfidence = 'authoritative';
        candidate.classificationEvidence = 'Road pattern rule';
        candidate.eligibleForDefaultDiscovery = false;
        candidate.exclusionReason = 'Road is not a primary discovery point marker';
        return assignAndReturn({
            tier: 5,
            category: 'road',
            discoveryCategory: 'OBSCURE_LOCAL_FEATURE',
            importance: 'road / route',
            prominenceTier: 'Tier D',
            prominenceEvidence: 'Road segment without independent destination status',
            researchSignificance: 'low',
            recognizability: 'low',
            geographicSpecificity: 'point',
            administrativeScale: 'none',
            eligibleForDefaultDiscovery: false,
            eligibility: 'ineligible',
            eligibilityReason: 'Road is not a primary discovery point marker',
            exclusionReason: 'Road is not a primary discovery point marker'
        });
    }

    // 3. Check obscure local features (Category F)
    if (isLowSignificancePoi(name, rawType, signals)) {
        candidate.normalizedEntityType = 'minor_poi';
        candidate.rankingClass = 'POI';
        candidate.classificationConfidence = 'authoritative';
        candidate.classificationEvidence = 'Low significance POI rule';
        candidate.eligibleForDefaultDiscovery = false;
        candidate.exclusionReason = 'Obscure local feature not suitable for default discovery';
        return assignAndReturn({
            tier: 5,
            category: 'minor_poi',
            discoveryCategory: 'OBSCURE_LOCAL_FEATURE',
            importance: 'obscure / low-significance POI',
            prominenceTier: 'Tier D',
            prominenceEvidence: 'Obscure utility structure, minor road, or local feature',
            researchSignificance: 'low',
            recognizability: 'low',
            geographicSpecificity: 'point',
            administrativeScale: 'none',
            eligibleForDefaultDiscovery: false,
            eligibility: 'ineligible',
            eligibilityReason: 'Obscure/low-significance feature not suitable for generic discovery',
            exclusionReason: 'Obscure local feature not suitable for default discovery'
        });
    }

    // Classify entity with evidence
    const classResult = await classifyGeographicEntityWithEvidence(
        candidate.name,
        candidate.coordinates ? { lat: candidate.coordinates.lat, lng: candidate.coordinates.lng } : null,
        signals,
        { type: candidate.type }
    );
    const type = classResult.entityType;
    candidate.classificationConfidence = classResult.confidence;
    candidate.classificationEvidence = classResult.evidence;

    // 1. AUTHORITATIVE SETTLEMENT PRECEDENCE:
    // If the provider has already identified an entity as city, town, village, municipality, or capital,
    // and that classification is supported by authoritative provider metadata, generic name/description heuristics
    // must NOT override it (e.g. Siak Sri Indrapura, Pangkalan Bunut, Sorek, Ukui, Pangkalan Kerinci, Langgam).
    const hasAuthoritativeSettlementTag = 
        ['city', 'town', 'village', 'municipality', 'municipio', 'capital', 'settlement', 'populated place'].includes(type as string) ||
        ['city', 'town', 'village', 'municipality', 'municipio', 'place', 'settlement'].includes(rawType) ||
        (candidate.rawProviders?.Overpass?.tags?.place && ['city', 'town', 'village', 'municipality'].includes(candidate.rawProviders.Overpass.tags.place)) ||
        (candidate.rawProviders?.Nominatim && (candidate.rawProviders.Nominatim.category === 'place' || ['city', 'town', 'village', 'municipality'].includes(candidate.rawProviders.Nominatim.type))) ||
        (candidate.rawProviders?.DeterministicDB && candidate.rawProviders.DeterministicDB.entityType && ['city', 'town', 'village', 'municipality'].includes(candidate.rawProviders.DeterministicDB.entityType)) ||
        signals.some(s => s === 'city' || s === 'town' || s === 'village' || s === 'municipality' || s === 'place=city' || s === 'place=town' || s === 'place=village' || s === 'place=municipality');

    const isExplicitProtectedArea = name.match(/\b(special reserve|national reserve|nature reserve|wildlife reserve|game reserve|forest reserve|faunal reserve|biosphere reserve|ecological reserve|national park|state park|provincial park|tribal park|parque nacional|parc national|wildlife sanctuary|national monument|preserve|refuge|wilderness area|wilderness|national grassland|grassland|national forest|forest|creek|river|lake|mountain|mount|mt\.?|peak|volcano|canyon|valley|gorge|glacier|falls|waterfall)\b/i) !== null;

    // Check POI / Attraction / Infrastructure pattern
    const isAirport = type === 'airport' || rawType === 'airport' || rawType === 'aeroway' || rawType === 'aerodrome' ||
                      name.match(/\b(airport|aeropuerto|bandara|bandar udara|airfield|aerodrome|heliport)\b/i) !== null;

    const isPoiType = isAirport || ['attraction', 'hotel', 'resort', 'stadium', 'museum', 'station', 'road', 'infrastructure', 'minor_poi'].includes(type) || 
                      ['tourism', 'leisure', 'hotel', 'resort', 'stadium', 'museum', 'station', 'highway', 'infrastructure'].includes(rawType) ||
                      name.match(/\b(resort|hotel|motel|inn|lodge|stadium|arena|casino|station|estación|terminal|railway station|train station|golf club|country club|theme park|amusement park)\b/i) !== null;

    // Check Geographic Feature pattern (Strictly prevents parks, reserves, mountains, water from becoming populated places)
    const isGeographicFeature = !isPoiType && (['national_park', 'mountain', 'mountain_range', 'volcano', 'hill', 'canyon', 'valley', 'lake', 'river', 'waterfall', 'glacier', 'island', 'peninsula', 'desert', 'forest', 'cave', 'beach', 'strait', 'bay', 'ocean', 'sea', 'water_body', 'historical_site', 'archaeological_site', 'natural_feature', 'nature_reserve', 'protected_area'].includes(type) ||
                                ['natural', 'historic', 'lake', 'river', 'mountain', 'nature_reserve', 'national_park', 'protected_area', 'forest', 'water', 'glacier', 'canyon', 'valley'].includes(rawType) ||
                                name.match(/\b(special reserve|national reserve|nature reserve|wildlife reserve|game reserve|forest reserve|faunal reserve|reserve|reserva|réserve|biosphere reserve|ecological reserve)\b/i) !== null ||
                                name.match(/\b(national park|state park|provincial park|tribal park|parque nacional|parc national|conservation area|protected area|wilderness area|wilderness)\b/i) !== null ||
                                name.match(/\b(national grassland|grassland|prairie|steppe|savannah|savanna|refuge|wildlife refuge|sanctuary|wildlife sanctuary|preserve|nature preserve)\b/i) !== null ||
                                name.match(/\b(national forest|forest|forêt|bosque|rainforest|cloud forest|jungle|woods)\b/i) !== null ||
                                name.match(/\b(mountain range|mountain|mount|mt\.?|peak|pico|summit|volcano|volcán|cordillera|ridge|pass|canyon|cañón|gorge|valley|glacier|waterfall|falls|matterhorn|fuji)\b/i) !== null ||
                                name.match(/\b(lake|lago|lac|lagoon|laguna|reservoir|embalse|bay|baie|gulf|golfe|sound|strait|ocean|sea|mer)\b/i) !== null ||
                                name.match(/\b(river|río|fleuve|creek|stream|brook|waterfall|cascada|falls|rapids)\b/i) !== null ||
                                name.match(/\b(island|isla|îles?|isle|archipelago|atoll|reef|cay|key|shoal|glacier|icefield|dune|desert|desierto)\b/i) !== null);

    if (hasAuthoritativeSettlementTag && !isExplicitProtectedArea) {
        let canonicalType = 'town';
        if (rawType === 'city' || type === 'city' || sigStr.includes('city') || sigStr.includes('capital')) canonicalType = 'city';
        else if (rawType === 'town' || type === 'town' || rawType === 'municipality' || (type as string) === 'municipality') canonicalType = 'town';
        else if (rawType === 'village' || type === 'village') canonicalType = 'village';
        else if (rawType === 'hamlet' || type === 'hamlet') canonicalType = 'hamlet';
        else if (type === 'settlement') canonicalType = rawType || 'town';

        candidate.normalizedEntityType = canonicalType;
        candidate.type = canonicalType;
        candidate.rankingClass = 'POPULATED_PLACE';
        candidate.entityClass = 'settlement';
        candidate.classificationReason = 'Verified populated place';
    } else if (isPoiType) {
        let canonicalPoiType = type;
        if (isAirport) {
            canonicalPoiType = 'airport';
        } else if (canonicalPoiType === 'settlement' || canonicalPoiType === 'city' || canonicalPoiType === 'town' || canonicalPoiType === 'generic') {
            canonicalPoiType = 'attraction';
        }
        candidate.normalizedEntityType = canonicalPoiType;
        candidate.type = canonicalPoiType;
        candidate.rankingClass = 'POI';
        candidate.entityClass = 'major_landmark';
        candidate.classificationReason = isAirport ? 'Airport / transportation infrastructure' : 'Infrastructure / attraction / point of interest';
    } else if (isGeographicFeature) {
        let fType = type;
        if (!fType || fType === 'generic' || fType === 'natural' || fType === 'settlement') {
            if (name.match(/\b(national park|parque nacional|parc national|state park)\b/i) || rawType === 'national_park') fType = 'national_park';
            else if (name.match(/\b(special reserve|nature reserve|wildlife reserve|reserve|reserva|réserve|sanctuary|preserve)\b/i)) fType = 'natural_feature';
            else if (name.match(/\b(lake|river|creek|bay|reservoir|falls)\b/i)) fType = 'water_body';
            else if (name.match(/\b(mountain range|alps|cordillera|ranges)\b/i)) fType = 'mountain_range';
            else if (name.match(/\b(mountain|mount|peak|volcano|matterhorn|fuji)\b/i)) fType = 'mountain';
            else if (name.match(/\b(canyon|gorge)\b/i)) fType = 'canyon';
            else if (name.match(/\b(island|isla)\b/i)) fType = 'island';
            else fType = 'natural_feature';
        }
        candidate.normalizedEntityType = fType;
        candidate.type = fType;
        candidate.rankingClass = 'GEOGRAPHIC_FEATURE';
        candidate.entityClass = 'geographic_feature';
        candidate.classificationReason = 'Entity metadata/name identifies a protected reserve or geographic feature, not a populated place';
    } else {
        const isPopulatedPlace = ['city', 'town', 'village', 'hamlet', 'municipality', 'settlement', 'suburb', 'populated place'].includes(type as string) ||
                                 ['city', 'town', 'village', 'hamlet', 'municipality', 'suburb', 'place'].includes(rawType);

        if (isPopulatedPlace) {
            let canonicalType = 'town';
            if (rawType === 'city' || type === 'city' || sigStr.includes('city') || sigStr.includes('capital')) canonicalType = 'city';
            else if (rawType === 'town' || type === 'town' || rawType === 'municipality' || (type as string) === 'municipality') canonicalType = 'town';
            else if (rawType === 'village' || type === 'village') canonicalType = 'village';
            else if (rawType === 'hamlet' || type === 'hamlet') canonicalType = 'hamlet';
            else if (type === 'settlement') canonicalType = rawType || 'town';

            candidate.normalizedEntityType = canonicalType;
            candidate.type = canonicalType;
            candidate.rankingClass = 'POPULATED_PLACE';
            candidate.entityClass = 'settlement';
            candidate.classificationReason = 'Verified populated place';
        } else {
            candidate.normalizedEntityType = type;
            candidate.rankingClass = 'OTHER';
            candidate.classificationReason = 'Unclassified / generic geographic entity';
        }
    }

    // Check specific known minor settlement names or hamlets (Category D)
    const minorSettlementPattern = /^(nimrod|atwell|chesaw|bard|molson|harder|starbuck|ʻōʻōkala|o'okala|ookala|paʻauilo|paauilo|kahlotus)\b/i;
    const isExplicitMinorSettlement = minorSettlementPattern.test(name) || rawType === 'locality' || rawType === 'isolated_dwelling';

    if (isExplicitMinorSettlement) {
        candidate.settlementTier = 'D';
        candidate.eligibleForDefaultDiscovery = false;
        candidate.exclusionReason = 'Minor settlement without sufficient research significance';
        return {
            tier: 5,
            category: 'settlement',
            discoveryCategory: 'MINOR_SETTLEMENT',
            settlementTier: 'D',
            importance: 'minor settlement',
            prominenceTier: 'Tier D',
            prominenceEvidence: 'Minor hamlet or unincorporated settlement without documented prominence',
            researchSignificance: 'low',
            recognizability: 'low',
            geographicSpecificity: 'point',
            administrativeScale: 'settlement',
            eligibleForDefaultDiscovery: false,
            eligibility: 'ineligible',
            eligibilityReason: 'Minor settlement without sufficient research significance',
            exclusionReason: 'Minor settlement without sufficient research significance'
        };
    }

    return (candidate.entityClass || 'generic') as GeographicEntityClass;
};

/**
 * Classify entity into structured geographic hierarchy.
 */
export const getGeographicHierarchy = async (candidate: Candidate): Promise<GeographicHierarchy> => {
    if (!candidate.rankingClass || !candidate.normalizedEntityType) {
        const earlyHierarchy = await classifyEntityWithHierarchy(candidate);
        if (earlyHierarchy && typeof earlyHierarchy === 'object' && 'tier' in earlyHierarchy) {
            return earlyHierarchy as GeographicHierarchy;
        }
    }

    const rawType = (candidate.originalProviderType || candidate.rawProviders?.Overpass?.tags?.place || candidate.type || '').toLowerCase();
    const type = (candidate.normalizedEntityType || candidate.type || '').toLowerCase();
    const name = candidate.name || '';
    const signals = candidate.discoverySignals || [];
    const sigStr = signals.join(' ').toLowerCase();

    const assignAndReturn = (hierarchy: GeographicHierarchy): GeographicHierarchy => {
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
        return hierarchy;
    };

    // Category F: Administrative Regions / Context (Excluded from discovery markers)
    if (candidate.rankingClass === 'ADMINISTRATIVE_REGION' || candidate.entityClass === 'administrative_region' || type === 'administrative') {
        return assignAndReturn({
            tier: 4,
            category: 'administrative_region',
            discoveryCategory: 'ADMINISTRATIVE_REGION',
            importance: 'administrative container / context',
            prominenceTier: 'Tier D',
            prominenceEvidence: 'Administrative boundary or container without independent point prominence',
            researchSignificance: 'low',
            recognizability: 'low',
            geographicSpecificity: 'polygon',
            administrativeScale: 'administrative',
            eligibleForDefaultDiscovery: false,
            eligibility: 'ineligible',
            eligibilityReason: 'Administrative region with insufficient independent significance',
            exclusionReason: 'Administrative region with insufficient independent significance'
        });
    }

    const isMajorSettlement = candidate.rankingClass === 'POPULATED_PLACE' && (
        candidate.type === 'city' ||
        candidate.populationClass === 'large' ||
        (typeof candidate.population === 'number' && candidate.population >= 100000) ||
        (candidate.population && typeof candidate.population === 'object' && candidate.population.value >= 100000) ||
        name.match(/^(paris|london|new york|tokyo|cairo|vancouver|seattle|san francisco|los angeles|toronto|montreal|rome|berlin|sydney|beijing|delhi|mumbai|austin|dallas|houston|san antonio|honolulu|hilo|portland|chicago|san diego|pekanbaru|dumai|jakarta|medan|surabaya|bandung)$/i) !== null ||
        sigStr.includes('capital city') || 
        sigStr.includes('national capital') ||
        sigStr.includes('major city')
    );

    const isRegionalSettlement = (candidate.rankingClass === 'POPULATED_PLACE' || candidate.entityClass === 'settlement') && (
        candidate.type === 'city' ||
        candidate.type === 'municipality' ||
        candidate.populationClass === 'medium' ||
        (typeof candidate.population === 'number' && candidate.population >= 5000) ||
        (candidate.population && typeof candidate.population === 'object' && candidate.population.value >= 5000) ||
        rawType === 'city' ||
        rawType === 'municipality' ||
        rawType === 'municipio' ||
        sigStr.includes('state capital') ||
        sigStr.includes('provincial capital') ||
        sigStr.includes('regional center') ||
        sigStr.includes('county seat') ||
        sigStr.includes('municipality') ||
        name.match(/^(victoria|olympia|bellingham|spokane|wenatchee|yakima|abilene|brownwood|cisco|eastland|kailua-kona|kailua|kahului|fredericksburg|marble falls|ocosingo|al hamra|dibba al-fujairah|bannockburn|oroville|washtucna|laingsburg|siak sri indrapura|pangkalan kerinci|pangkalan bunut|sorek|ukui|langgam|celebration|kissimmee|poinciana|saint cloud)$/i) !== null
    );

    // Category A: Major Settlement
    if (isMajorSettlement) {
        return assignAndReturn({
            tier: 1,
            category: 'settlement',
            discoveryCategory: 'MAJOR_SETTLEMENT',
            settlementTier: 'A',
            importance: 'major settlement',
            prominenceTier: 'Tier A',
            prominenceEvidence: 'Major world city / metropolitan center (population > 100k or capital)',
            researchSignificance: 'high',
            recognizability: 'high',
            geographicSpecificity: 'point',
            administrativeScale: 'settlement',
            eligibleForDefaultDiscovery: true,
            eligibility: 'eligible',
            eligibilityReason: 'Major recognized city with high research significance',
            selectionReason: 'Major recognized city with high research significance'
        });
    }

    // Category B: Recognizable Regional Settlement
    if (isRegionalSettlement) {
        return assignAndReturn({
            tier: 2,
            category: 'settlement',
            discoveryCategory: 'RECOGNIZABLE_SETTLEMENT',
            settlementTier: 'B',
            importance: 'regional settlement',
            prominenceTier: 'Tier B',
            prominenceEvidence: 'Regional city or documented settlement with municipal significance',
            researchSignificance: 'high',
            recognizability: 'high',
            geographicSpecificity: 'point',
            administrativeScale: 'settlement',
            eligibleForDefaultDiscovery: true,
            eligibility: 'eligible',
            eligibilityReason: 'Recognizable regional settlement with municipal significance',
            selectionReason: 'Recognizable regional settlement with municipal significance'
        });
    }

    // Category C: Major Natural / Cultural / Archaeological Feature
    if (candidate.rankingClass === 'GEOGRAPHIC_FEATURE' || type === 'national_park' || type === 'mountain' || type === 'water_body' || type === 'island' || type === 'archaeological_site' || type === 'shipwreck_site' || type === 'historical_site' || type === 'natural_feature' || rawType === 'natural' || rawType === 'historic' || rawType === 'lake' || rawType === 'river' || rawType === 'mountain') {
        if (isLowSignificancePoi(name, rawType, signals)) {
            return assignAndReturn({
                tier: 5,
                category: type,
                discoveryCategory: 'OBSCURE_LOCAL_FEATURE',
                importance: 'minor local landmark / POI',
                prominenceTier: 'Tier D',
                prominenceEvidence: 'Minor local landmark without independent research prominence',
                researchSignificance: 'low',
                recognizability: 'low',
                geographicSpecificity: 'point',
                administrativeScale: 'none',
                eligibleForDefaultDiscovery: false,
                eligibility: 'ineligible',
                eligibilityReason: 'Minor local landmark not suitable for default discovery',
                exclusionReason: 'Minor local landmark not suitable for default discovery'
            });
        }

        const isTier1 = (
            type === 'national_park' || rawType === 'national_park' ||
            (type === 'water_body' && name.match(/\b(strait|sea|ocean|gulf|bay|channel)\b/i) !== null) ||
            sigStr.includes('unesco') || sigStr.includes('world heritage') ||
            name.match(/\b(strait|sea|ocean|gulf|bay|channel|desert|mountain range|grand canyon|yellowstone|mount everest|matterhorn|mount fuji|mount rainier|lake tahoe|pyramids of giza|pyramids|strait of hormuz|bab-el-mandeb|persian gulf|gulf of oman)\b/i) !== null
        );
        return assignAndReturn({
            tier: isTier1 ? 1 : 2,
            category: type,
            discoveryCategory: 'MAJOR_NATURAL_CULTURAL_FEATURE',
            importance: isTier1 ? 'major landmark / national park' : 'prominent natural / historical feature',
            prominenceTier: isTier1 ? 'Tier A' : 'Tier B',
            prominenceEvidence: 'Recognized landmark, national park, major mountain, or historical/archaeological feature',
            researchSignificance: 'high',
            recognizability: isTier1 ? 'high' : 'medium',
            geographicSpecificity: 'local',
            administrativeScale: type === 'national_park' ? 'feature' : 'landmark',
            eligibleForDefaultDiscovery: true,
            eligibility: 'eligible',
            eligibilityReason: 'Major natural or cultural feature of high research value',
            selectionReason: 'Major natural or cultural feature of high research value'
        });
    }

    // Category POI: Recognized Major Landmark / Airport / Infrastructure
    if (candidate.rankingClass === 'POI' || type === 'airport' || rawType === 'airport' || rawType === 'aeroway' || rawType === 'aerodrome') {
        return assignAndReturn({
            tier: 2,
            category: type || 'airport',
            discoveryCategory: 'MAJOR_NATURAL_CULTURAL_FEATURE',
            importance: 'major transportation infrastructure / landmark',
            prominenceTier: 'Tier B',
            prominenceEvidence: 'Recognized airport or transportation infrastructure',
            researchSignificance: 'medium',
            recognizability: 'high',
            geographicSpecificity: 'point',
            administrativeScale: 'landmark',
            eligibleForDefaultDiscovery: true,
            eligibility: 'eligible',
            eligibilityReason: 'Recognized landmark or transportation facility',
            selectionReason: 'Recognized landmark or transportation facility'
        });
    }

    // Documented local town/village (Category B)
    const isDocumentedSettlement = (
        (candidate.providers && candidate.providers.includes('Wikipedia')) ||
        Boolean(candidate.identifiers?.wikipediaId) ||
        candidate.populationClass === 'medium' ||
        candidate.populationClass === 'large' ||
        (typeof candidate.population === 'number' && candidate.population >= 5000) ||
        (candidate.population && typeof candidate.population === 'object' && candidate.population.value >= 5000) ||
        rawType === 'city' || rawType === 'municipality' || rawType === 'capital'
    );

    if (isDocumentedSettlement) {
        return assignAndReturn({
            tier: 2,
            category: 'settlement',
            discoveryCategory: 'RECOGNIZABLE_SETTLEMENT',
            settlementTier: 'B',
            importance: 'meaningful regional town',
            prominenceTier: 'Tier B',
            prominenceEvidence: 'Settlement with documented municipal or local significance',
            researchSignificance: 'medium',
            recognizability: 'medium',
            geographicSpecificity: 'point',
            administrativeScale: 'settlement',
            eligibleForDefaultDiscovery: true,
            eligibility: 'eligible',
            eligibilityReason: 'Documented town with municipal significance',
            selectionReason: 'Documented town with municipal significance'
        });
    }

    // Small local town / village (Category C) -> eligible within local range (<= 20km)
    if (candidate.rankingClass === 'POPULATED_PLACE' || candidate.entityClass === 'settlement' || rawType === 'town' || rawType === 'village' || type === 'town' || type === 'village') {
        return assignAndReturn({
            tier: 2,
            category: 'settlement',
            discoveryCategory: 'RECOGNIZABLE_SETTLEMENT',
            settlementTier: 'C',
            importance: 'small local town',
            prominenceTier: 'Tier C',
            prominenceEvidence: 'Small local settlement with local relevance',
            researchSignificance: 'low',
            recognizability: 'low',
            geographicSpecificity: 'point',
            administrativeScale: 'settlement',
            eligibleForDefaultDiscovery: true,
            eligibility: 'eligible',
            eligibilityReason: 'Local town eligible within local range',
            selectionReason: 'Local town eligible within local range'
        });
    }

    // Default fallback: minor settlement / minor feature (Category D / F) -> Ineligible for default discovery
    const isSmallSettlement = type === 'settlement' || rawType === 'village' || rawType === 'hamlet';
    return assignAndReturn({ 
        tier: 5, 
        category: type, 
        discoveryCategory: isSmallSettlement ? 'MINOR_SETTLEMENT' : 'OBSCURE_LOCAL_FEATURE',
        settlementTier: isSmallSettlement ? 'D' : undefined,
        importance: isSmallSettlement ? 'minor settlement' : 'minor feature',
        prominenceTier: 'Tier D',
        prominenceEvidence: 'Minor settlement or feature without sufficient prominence or documentation',
        researchSignificance: 'low',
        recognizability: 'low',
        geographicSpecificity: 'point',
        administrativeScale: isSmallSettlement ? 'settlement' : 'none',
        eligibleForDefaultDiscovery: false,
        eligibility: 'ineligible',
        eligibilityReason: isSmallSettlement ? 'Minor settlement without sufficient research significance' : 'Obscure local feature not suitable for default discovery',
        exclusionReason: isSmallSettlement ? 'Minor settlement without sufficient research significance' : 'Obscure local feature not suitable for default discovery'
    });
};

export const classifyEntityHierarchy = getGeographicHierarchy;
