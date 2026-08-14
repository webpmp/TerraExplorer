import { GeographicEntityType } from '../domain';
import { generateContentWithRetry, modelName } from './geminiService';
import { GeoCoordinates } from '../types';

export interface ClassificationResult {
    entityType: GeographicEntityType;
    confidence: 'authoritative' | 'high' | 'medium' | 'fallback';
    evidence: string;
}

export const classifyGeographicEntityWithEvidence = async (
    name: string,
    coordinates: GeoCoordinates | undefined,
    providerSignals: string[] = [],
    adminContext: any = {}
): Promise<ClassificationResult> => {
    const rawName = name || '';
    const cleanName = rawName.replace(/,\s*[A-Z]{2}$/i, '').replace(/,\s*[A-Za-z\s]+$/, '').trim();
    const q = cleanName.toLowerCase();

    const rawSignals = [
        ...providerSignals,
        adminContext?.type,
        adminContext?.category
    ].filter(Boolean);
    const signals = rawSignals.map(s => String(s).toLowerCase());

    // 0. Non-Geographic Events / Conflicts / Topics / Articles MUST be rejected FIRST
    const isEventOrTopic = 
        q.match(/\b(insurgency|uprising|rebellion|revolution|war|battle|conflict|offensive|siege|campaign|massacre|crisis|protest|riot|incident|accord|treaty|election|referendum|coup|strike|bombing|assassination|movement|dynasty|regime|politics of|history of|economy of|geography of|demographics of|culture of|transport in|education in|list of|timeline of|foreign relations of)\b/i) ||
        signals.some(s => s.includes('insurgency') || s.includes('battle') || s.includes('war') || s.includes('conflict') || s.includes('election') || s === 'event');

    if (isEventOrTopic) {
        return { 
            entityType: 'minor_poi', 
            confidence: 'authoritative', 
            evidence: `Entity represents an event/conflict/topic, not a geographic entity` 
        };
    }

    // 1. Authoritative Deterministic Administrative Rules & False City Rejections FIRST
    if (q.match(/\b(congressional district|tourism district|development district|improvement district|school district|fire district|water district|special district|historic district|business district|sanitary district|oversight district|tourism oversight|development authority|housing authority|transportation authority|port authority|\d+(st|nd|rd|th)\s+congressional district)\b/i) ||
        signals.some(s => s.includes('congressional') || s.includes('oversight district'))) {
        return { entityType: 'administrative_region', confidence: 'authoritative', evidence: `False city / administrative entity rejected: ${signals.join(', ')}` };
    }

    if (signals.some(s => s === 'county' || s === 'district' || s === 'state' || s === 'province' || s === 'country' || s === 'administrative' || s === 'regional_district' || s.includes('administrative') || s.includes('boundary')) ||
        q.match(/\b(local municipality|district municipality|regional municipality|regional district|county|ward|parish|township|census area|electoral district|administrative region)\b/i)) {
        return { entityType: 'administrative_region', confidence: 'authoritative', evidence: `Matched administrative container: ${signals.join(', ')}` };
    }

    // 2. Protected Areas, Reserves, Parks, and Natural Features MUST be checked BEFORE trusting upstream city tags
    // Upstream providers often mislabel reserves and protected areas as "city" or "place".
    const isReserveOrPark = 
        q.match(/\b(special reserve|national reserve|nature reserve|wildlife reserve|game reserve|forest reserve|faunal reserve|reserve|reserva|réserve|biosphere reserve|ecological reserve)\b/i) ||
        q.match(/\b(national park|state park|provincial park|tribal park|parque nacional|parc national|conservation area|protected area|wilderness area|wilderness)\b/i) ||
        q.match(/\b(national grassland|grassland|prairie|steppe|savannah|savanna|refuge|wildlife refuge|sanctuary|wildlife sanctuary|preserve|nature preserve)\b/i) ||
        q.match(/\b(national forest|forest|forêt|bosque|rainforest|cloud forest|jungle|woods)\b/i) ||
        signals.some(s => s.includes('nature reserve') || s.includes('special reserve') || s.includes('national park') || s.includes('protected_area') || s === 'leisure=nature_reserve' || s === 'boundary=national_park');

    if (isReserveOrPark) {
        if (q.match(/\b(national park|parque nacional|parc national|state park)\b/i) || signals.some(s => s.includes('national park') || s.includes('state_park'))) {
            return { entityType: 'national_park', confidence: 'authoritative', evidence: `Entity metadata/name identifies a park/reserve, not a populated place` };
        }
        return { entityType: 'natural_feature', confidence: 'authoritative', evidence: `Entity metadata/name identifies a protected reserve/area, not a populated place` };
    }

    // Natural Features (Canyons, Gorges, Valleys, Caves, Deserts, Glaciers, Plateaus)
    if (q.match(/\b(canyon|cañón|gorge|valley|desert|glacier|crater|cave|cavern|rock|plateau)\b/i) ||
        signals.some(s => s === 'canyon' || s === 'valley' || s === 'desert' || s === 'cave' || s === 'glacier' || s === 'geology')) {
        return { entityType: 'natural_feature', confidence: 'high', evidence: `Name or provider tag matched natural feature (canyon/valley/desert)` };
    }

    // Mountains & Landforms
    if (q.match(/\b(mount|mountain|peak|summit|volcano|volcán|volcan|butte|cerro|cordillera|ridge|pass)\b/i) ||
        signals.some(s => s.includes('mountain') || s.includes('peak') || s.includes('volcano') || s.includes('ridge') || s === 'mountain')) {
        return { entityType: 'mountain', confidence: 'authoritative', evidence: `Name or provider tag matched mountain/landform` };
    }

    // Water Bodies
    if (q.match(/\b(lake|river|sea|ocean|bay|gulf|creek|sound|strait|canal|reservoir|laguna|río|rio|fleuve|stream|brook|falls|waterfall|cascada|rapids)\b/i) ||
        signals.some(s => s === 'water' || s === 'lake' || s === 'river' || s === 'stream' || s === 'sea' || s === 'ocean' || s === 'bay' || s === 'reservoir' || s === 'strait' || s === 'gulf' || s === 'canal' || s === 'water_body')) {
        return { entityType: 'water_body', confidence: 'authoritative', evidence: `Name or provider tag matched water body` };
    }

    // Islands
    if (q.match(/\b(islands?|isle|archipelago|atoll|isla|îles?)\b/i) ||
        signals.some(s => s.includes('island') || s.includes('archipelago') || s.includes('atoll') || s.includes('isle') || s === 'island')) {
        return { entityType: 'island', confidence: 'authoritative', evidence: `Name or provider tag matched island` };
    }

    // Archaeological Sites
    if (q.match(/\b(pyramids?|ruins?|temple|acropolis|amphitheater)\b/i) ||
        signals.some(s => s.includes('archaeological') || s.includes('ruins') || s.includes('ancient') || s.includes('maya') || s.includes('monumento') || s === 'archaeological_site')) {
        return { entityType: 'archaeological_site', confidence: 'authoritative', evidence: `Name or provider tag matched archaeological site` };
    }

    // Historic Sites & Monuments
    if (signals.some(s => s.includes('historic') || s.includes('monument') || s.includes('memorial') || s.includes('castle') || s === 'historic' || s === 'historical_site')) {
        return { entityType: 'historical_site', confidence: 'authoritative', evidence: `Provider tag matched historic site: ${signals.join(', ')}` };
    }

    // 3. Legitimate Verified Populated Places
    if (signals.some(s => s === 'city' || s === 'town' || s === 'village' || s === 'municipality' || s === 'municipio' || s === 'hamlet' || s === 'suburb' || s === 'neighbourhood' || s === 'locality' || s === 'place' || s.includes('populated place') || s.includes('settlement')) ||
        rawName.match(/,\s*(Texas|Washington|California|Oregon|Hawaii|Western Cape|BC|British Columbia|[A-Z]{2})$/i)) {
        return { entityType: 'settlement', confidence: 'authoritative', evidence: `Verified populated place: ${signals.join(', ')}` };
    }

    // Explicit Infrastructure
    if (signals.some(s => s.includes('bridge') || s.includes('airport') || s.includes('dam') || s.includes('station') || s.includes('lighthouse'))) {
        return { entityType: 'infrastructure', confidence: 'authoritative', evidence: `Provider tag matched infrastructure: ${signals.join(', ')}` };
    }

    // Explicit Road / Highway
    if (q.match(/\b(fm|cr|hw|hwy|i-)\s*\d+\b/) || signals.some(s => s.includes('highway') || s.includes('road') || s.includes('motorway') || s.includes('street'))) {
        return { entityType: 'road', confidence: 'high', evidence: `Name or tag matched route/highway` };
    }

    // Explicit Trail
    if (signals.some(s => s.includes('trail') || s.includes('footpath') || s.includes('track') || s.includes('path'))) {
        return { entityType: 'trail', confidence: 'authoritative', evidence: `Provider tag matched trail: ${signals.join(', ')}` };
    }

    // Generic natural / landmark provider signals
    if (signals.some(s => s.includes('landmark') || s.includes('tourism') || s.includes('natural') || s.includes('geology') || s === 'natural_feature' || s === 'landmark')) {
        return { entityType: 'natural_feature', confidence: 'authoritative', evidence: `Provider tag matched natural/landmark feature: ${signals.join(', ')}` };
    }

    // 4. Fallback
    return { entityType: 'minor_poi', confidence: 'fallback', evidence: `Fallback default for unclassified entity` };
};

export const classifyGeographicEntity = async (
    name: string,
    coordinates: GeoCoordinates | undefined,
    providerSignals: string[] = [],
    adminContext: any = {}
): Promise<GeographicEntityType> => {
    const res = await classifyGeographicEntityWithEvidence(name, coordinates, providerSignals, adminContext);
    return res.entityType;
};
