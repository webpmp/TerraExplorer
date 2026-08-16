import { GeographicEntityType } from '../domain';
import { generateContentWithRetry, modelName } from './geminiService';
import { GeoCoordinates } from '../types';
import { DETERMINISTIC_LOCATION_DB } from './geographic/geographicData';
import { normalizeGeographicQuery } from './geographic/geographicNormalization';
import { resolveAlias } from './geographic/geographicAliases';

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
    const normalizedName = normalizeGeographicQuery(cleanName);
    const aliasResolved = resolveAlias(normalizedName).canonical;

    // 1. DETERMINISTIC GEOGRAPHIC DATA HAS TOP AUTHORITY
    // If deterministic record exists, preserve its authoritative entity classification.
    const deterministicKey = [q, normalizedName, aliasResolved, q.replace(/^the\s+/, ''), cleanName.toLowerCase()]
        .find(k => DETERMINISTIC_LOCATION_DB[k]);

    if (deterministicKey) {
        const entry = DETERMINISTIC_LOCATION_DB[deterministicKey];
        if (entry && entry.entityType) {
            let resType: GeographicEntityType = entry.entityType as GeographicEntityType;
            if (['city', 'town', 'village', 'hamlet', 'municipality'].includes(resType)) {
                resType = 'settlement';
            }
            return {
                entityType: resType,
                confidence: 'authoritative',
                evidence: `Deterministic geographic database entry: ${entry.name} (${entry.entityType})`
            };
        }
    }

    if (adminContext?.entityType && (adminContext.entityType === 'mountain' || adminContext.entityType === 'mountain_range' || adminContext.entityType === 'canyon' || adminContext.entityType === 'lake' || adminContext.entityType === 'river' || adminContext.entityType === 'infrastructure')) {
        return {
            entityType: adminContext.entityType as GeographicEntityType,
            confidence: 'authoritative',
            evidence: `Authoritative deterministic context: ${adminContext.entityType}`
        };
    }

    const rawSignals = [
        ...providerSignals,
        adminContext?.type,
        adminContext?.category,
        adminContext?.entityType
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

    // 1. Authoritative Deterministic Administrative Rules & False City Rejections
    if (q.match(/\b(congressional district|tourism district|development district|improvement district|school district|fire district|water district|special district|historic district|business district|sanitary district|oversight district|tourism oversight|development authority|housing authority|transportation authority|port authority|\d+(st|nd|rd|th)\s+congressional district)\b/i) ||
        signals.some(s => s.includes('congressional') || s.includes('oversight district'))) {
        return { entityType: 'administrative_region', confidence: 'authoritative', evidence: `False city / administrative entity rejected: ${signals.join(', ')}` };
    }

    if (signals.some(s => s === 'county' || s === 'district' || s === 'state' || s === 'province' || s === 'country' || s === 'administrative' || s === 'regional_district' || s.includes('administrative') || s.includes('boundary')) ||
        q.match(/\b(local municipality|district municipality|regional municipality|regional district|county|ward|parish|township|census area|electoral district|administrative region)\b/i)) {
        return { entityType: 'administrative_region', confidence: 'authoritative', evidence: `Matched administrative container: ${signals.join(', ')}` };
    }

    // 2. Explicit Infrastructure / Airport / Transport / Bridge
    if (q.match(/\b(bridge|golden gate bridge|brooklyn bridge|tower bridge|airport|aeropuerto|bandara|bandar udara|airfield|aerodrome|heliport|station|estación|terminal|railway station|train station|subway station|metro station|bus station|ferry terminal|harbor|harbour|dam|lighthouse)\b/i) ||
        signals.some(s => s.includes('bridge') || s.includes('airport') || s.includes('aerodrome') || s.includes('aeroway') || s.includes('station') || s.includes('dam') || s.includes('lighthouse') || s === 'infrastructure')) {
        return { entityType: 'infrastructure', confidence: 'authoritative', evidence: `Provider tag or name matched infrastructure/transport: ${signals.join(', ')}` };
    }

    // 3. AUTHORITATIVE SETTLEMENT PRECEDENCE:
    const hasAuthoritativeSettlementTag = signals.some(s => 
        s === 'city' || s === 'town' || s === 'village' || s === 'municipality' || s === 'municipio' || 
        s === 'capital' || s === 'place' || s === 'settlement' || s.includes('populated place') ||
        s === 'place=city' || s === 'place=town' || s === 'place=village' || s === 'place=municipality'
    ) || ['city', 'town', 'village', 'municipality'].includes(adminContext?.type);

    const isExplicitProtectedAreaName = q.match(/\b(special reserve|national reserve|nature reserve|wildlife reserve|game reserve|forest reserve|faunal reserve|biosphere reserve|ecological reserve|national park|state park|provincial park|tribal park|parque nacional|parc national|wildlife sanctuary|national monument)\b/i) !== null;

    if (hasAuthoritativeSettlementTag && !isExplicitProtectedAreaName) {
        return { entityType: 'settlement', confidence: 'authoritative', evidence: `Authoritative provider settlement type: ${signals.join(', ')}` };
    }

    // 4. Protected Areas, Reserves, Parks (only when not an authoritative settlement)
    const isReserveOrPark = 
        q.match(/\b(special reserve|national reserve|nature reserve|wildlife reserve|game reserve|forest reserve|faunal reserve|reserve|reserva|réserve|biosphere reserve|ecological reserve)\b/i) ||
        q.match(/\b(national park|state park|provincial park|tribal park|parque nacional|parc national|conservation area|protected area|wilderness area|wilderness)\b/i) ||
        q.match(/\b(national grassland|grassland|prairie|steppe|savannah|savanna|refuge|wildlife refuge|sanctuary|wildlife sanctuary|preserve|nature preserve)\b/i) ||
        signals.some(s => s.includes('nature reserve') || s.includes('special reserve') || s.includes('national park') || s.includes('protected_area') || s === 'leisure=nature_reserve' || s === 'boundary=national_park');

    if (isReserveOrPark) {
        if (q.match(/\b(national park|parque nacional|parc national|state park)\b/i) || signals.some(s => s.includes('national park') || s.includes('state_park'))) {
            return { entityType: 'national_park', confidence: 'authoritative', evidence: `Entity metadata/name identifies a park/reserve, not a populated place` };
        }
        return { entityType: 'natural_feature', confidence: 'authoritative', evidence: `Entity metadata/name identifies a protected reserve/area, not a populated place` };
    }

    // 5. Mountain Ranges (Distinguish mountain ranges from individual mountains)
    if (q.match(/\b(mountain range|mountain ranges|alps|pennine alps|himalayas|andes|rockies|rocky mountains|appalachians|appalachian mountains|cordillera|pyrenees|carpathians|caucasus|sierra nevada|ranges)\b/i) ||
        signals.some(s => s === 'mountain_range' || s.includes('mountain range') || s.includes('mountain_range'))) {
        return { entityType: 'mountain_range', confidence: 'authoritative', evidence: `Name or provider tag matched mountain range` };
    }

    // 6. Individual Mountains & Landforms (Peaks, Summits, Matterhorn, Fuji, etc.)
    if (q.match(/\b(mount|mountain|peak|summit|volcano|volcán|volcan|matterhorn|fuji|kilimanjaro|everest|k2|denali|elbrus|aconcagua|mont blanc|butte|cerro|pico|horn|spitze)\b/i) ||
        signals.some(s => s === 'mountain' || s === 'peak' || s === 'volcano' || s.includes('mountain') || s.includes('volcano') || s.includes('peak'))) {
        if (q.match(/\b(volcano|volcán|volcan)\b/i) || signals.some(s => s.includes('volcano'))) {
            return { entityType: 'volcano', confidence: 'authoritative', evidence: `Name or provider tag matched volcano` };
        }
        return { entityType: 'mountain', confidence: 'authoritative', evidence: `Name or provider tag matched individual mountain peak` };
    }

    // 7. Canyons, Gorges, Valleys, Glaciers, Caves, Deserts, Forests
    if (q.match(/\b(canyon|cañón|gorge)\b/i) || signals.some(s => s === 'canyon' || s === 'gorge')) {
        return { entityType: 'canyon', confidence: 'authoritative', evidence: `Name or provider tag matched canyon` };
    }

    if (q.match(/\b(valley|valle|vallée)\b/i) || signals.some(s => s === 'valley')) {
        return { entityType: 'valley', confidence: 'authoritative', evidence: `Name or provider tag matched valley` };
    }

    if (q.match(/\b(glacier|icefield)\b/i) || signals.some(s => s === 'glacier' || s === 'icefield')) {
        return { entityType: 'glacier', confidence: 'authoritative', evidence: `Name or provider tag matched glacier` };
    }

    if (q.match(/\b(falls|waterfall|cascada|waterfalls)\b/i) || signals.some(s => s === 'waterfall' || s.includes('waterfall'))) {
        return { entityType: 'waterfall', confidence: 'authoritative', evidence: `Name or provider tag matched waterfall` };
    }

    if (q.match(/\b(desert|desierto|dunes?)\b/i) || signals.some(s => s === 'desert')) {
        return { entityType: 'desert', confidence: 'authoritative', evidence: `Name or provider tag matched desert` };
    }

    if (q.match(/\b(cave|cavern|grotta|grotto|caves|caverns)\b/i) || signals.some(s => s === 'cave' || s === 'cavern')) {
        return { entityType: 'cave', confidence: 'authoritative', evidence: `Name or provider tag matched cave` };
    }

    if (q.match(/\b(forest|forêt|bosque|rainforest|cloud forest|jungle|woods)\b/i) || signals.some(s => s === 'forest')) {
        return { entityType: 'forest', confidence: 'authoritative', evidence: `Name or provider tag matched forest` };
    }

    if (q.match(/\b(beach|playa|praia|plage)\b/i) || signals.some(s => s === 'beach')) {
        return { entityType: 'beach', confidence: 'authoritative', evidence: `Name or provider tag matched beach` };
    }

    if (q.match(/\b(peninsula|península)\b/i) || signals.some(s => s === 'peninsula')) {
        return { entityType: 'peninsula', confidence: 'authoritative', evidence: `Name or provider tag matched peninsula` };
    }

    // 8. Water Bodies (Ocean, Sea, Lake, River, Strait, Bay)
    if (q.match(/\bocean\b/i) || signals.some(s => s === 'ocean')) {
        return { entityType: 'ocean', confidence: 'authoritative', evidence: `Name or provider tag matched ocean` };
    }

    if (q.match(/\bsea\b/i) || signals.some(s => s === 'sea')) {
        return { entityType: 'sea', confidence: 'authoritative', evidence: `Name or provider tag matched sea` };
    }

    if (q.match(/\b(lake|lago|lac|loch|laguna|lagoon|reservoir)\b/i) || signals.some(s => s === 'lake' || s === 'reservoir')) {
        return { entityType: 'lake', confidence: 'authoritative', evidence: `Name or provider tag matched lake` };
    }

    if (q.match(/\b(river|río|fleuve|creek|stream|brook)\b/i) || signals.some(s => s === 'river' || s === 'stream' || s === 'waterway')) {
        return { entityType: 'river', confidence: 'authoritative', evidence: `Name or provider tag matched river` };
    }

    if (q.match(/\b(strait|sound|channel)\b/i) || signals.some(s => s === 'strait')) {
        return { entityType: 'strait', confidence: 'authoritative', evidence: `Name or provider tag matched strait` };
    }

    if (q.match(/\b(bay|gulf|golfe|baie)\b/i) || signals.some(s => s === 'bay' || s === 'gulf')) {
        return { entityType: 'bay', confidence: 'authoritative', evidence: `Name or provider tag matched bay` };
    }

    if (signals.some(s => s === 'water' || s === 'water_body')) {
        return { entityType: 'water_body', confidence: 'authoritative', evidence: `Provider tag matched water body` };
    }

    // 9. Islands & Archipelagos
    if (q.match(/\b(islands?|isle|archipelago|atoll|isla|îles?)\b/i) ||
        signals.some(s => s.includes('island') || s.includes('archipelago') || s.includes('atoll') || s.includes('isle') || s === 'island')) {
        return { entityType: 'island', confidence: 'authoritative', evidence: `Name or provider tag matched island` };
    }

    // 10. Archaeological Sites
    if (q.match(/\b(pyramids?|ruins?|temple|acropolis|amphitheater)\b/i) ||
        signals.some(s => s.includes('archaeological') || s.includes('ruins') || s.includes('ancient') || s.includes('maya') || s.includes('monumento') || s === 'archaeological_site')) {
        return { entityType: 'archaeological_site', confidence: 'authoritative', evidence: `Name or provider tag matched archaeological site` };
    }

    // 11. Historic Sites, Museums, Monuments
    if (q.match(/\b(museum|museo|musée)\b/i) || signals.some(s => s === 'museum')) {
        return { entityType: 'museum', confidence: 'authoritative', evidence: `Name or provider tag matched museum` };
    }

    if (q.match(/\b(monument|memorial)\b/i) || signals.some(s => s === 'monument' || s.includes('monument'))) {
        return { entityType: 'monument', confidence: 'authoritative', evidence: `Name or provider tag matched monument` };
    }

    if (signals.some(s => s.includes('historic') || s.includes('memorial') || s.includes('castle') || s === 'historic' || s === 'historical_site')) {
        return { entityType: 'historical_site', confidence: 'authoritative', evidence: `Provider tag matched historic site: ${signals.join(', ')}` };
    }

    // 12. Legitimate Verified Populated Places via suffix or broader signals
    if (signals.some(s => s === 'hamlet' || s === 'suburb' || s === 'neighbourhood' || s === 'locality') ||
        rawName.match(/,\s*(Texas|Washington|California|Oregon|Hawaii|Western Cape|BC|British Columbia|[A-Z]{2})$/i)) {
        return { entityType: 'settlement', confidence: 'authoritative', evidence: `Verified populated place: ${signals.join(', ')}` };
    }

    // 13. Explicit Road / Highway / Trail
    if (q.match(/\b(fm|cr|hw|hwy|i-)\s*\d+\b/) || signals.some(s => s.includes('highway') || s.includes('road') || s.includes('motorway') || s.includes('street'))) {
        return { entityType: 'road', confidence: 'high', evidence: `Name or tag matched route/highway` };
    }

    if (signals.some(s => s.includes('trail') || s.includes('footpath') || s.includes('track') || s.includes('path'))) {
        return { entityType: 'trail', confidence: 'authoritative', evidence: `Provider tag matched trail: ${signals.join(', ')}` };
    }

    // 14. Generic natural / landmark provider signals
    if (signals.some(s => s.includes('landmark') || s.includes('tourism') || s.includes('natural') || s.includes('geology') || s === 'natural_feature' || s === 'landmark')) {
        return { entityType: 'natural_feature', confidence: 'authoritative', evidence: `Provider tag matched natural/landmark feature: ${signals.join(', ')}` };
    }

    // 15. Fallback for generic/unclassified POIs
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
