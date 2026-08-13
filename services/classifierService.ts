import { GeographicEntityType } from '../domain';
import { generateContentWithRetry, modelName } from './geminiService';
import { GeoCoordinates } from '../types';

export const classifyGeographicEntity = async (
    name: string,
    coordinates: GeoCoordinates | undefined,
    providerSignals: string[] = [],
    adminContext: any = {}
): Promise<GeographicEntityType> => {
    const q = name.toLowerCase();
    const signals = [
        ...providerSignals,
        adminContext?.type,
        adminContext?.category
    ].filter(Boolean).map(s => String(s).toLowerCase());

    // 1. Authoritative Deterministic Provider Evidence (Strongest Signal)
    if (signals.some(s => s.includes('archaeological') || s.includes('ruins') || s.includes('ancient'))) return 'archaeological_site';
    if (signals.some(s => s.includes('island') || s.includes('archipelago'))) return 'island';
    if (signals.some(s => s.includes('national park') || s.includes('reserve'))) return 'national_park';
    if (signals.some(s => s.includes('mountain') || s.includes('peak'))) return 'mountain';
    if (signals.some(s => s.includes('water') || s.includes('lake') || s.includes('river') || s.includes('sea') || s.includes('ocean'))) return 'water_body';
    
    // Explicit OSM highway / road signals
    if (signals.some(s => s.includes('highway') || s.includes('road') || s.includes('street') || s.includes('motorway'))) return 'road';
    
    // Explicit Settlement signals
    if (signals.some(s => s === 'city' || s === 'town' || s === 'village' || s === 'hamlet' || s.includes('populated place') || s.includes('settlement'))) return 'settlement';
    
    // Explicit Admin regions
    if (signals.some(s => s.includes('admin') || s.includes('boundary') || s.includes('county') || s.includes('state') || s.includes('country'))) return 'administrative_region';

    // Explicit Infrastructure
    if (signals.some(s => s.includes('bridge') || s.includes('airport') || s.includes('station') || s.includes('building'))) return 'infrastructure';
    
    // 2. Deterministic Keyword Rules on Canonical Name
    if (q.includes('pyramid') || q.includes('ruin') || q.includes('temple')) return 'archaeological_site';
    if (q.includes('island') || q.includes('isle')) return 'island';
    if (q.includes('mountain') || q.includes('mount ') || q.includes('peak')) return 'mountain';
    if (q.includes('canyon') || q.includes('valley') || q.includes('desert')) return 'natural_feature';
    if (q.includes('lake') || q.includes('river') || q.includes('sea') || q.includes('ocean') || q.includes('bay') || q.includes('gulf')) return 'water_body';
    if (q.includes('national park')) return 'national_park';
    if (q.match(/\b(fm|cr|hw|hwy|i-)\s*\d+\b/)) return 'road'; // Match things like FM 1530

    // 3. LLM Hint (Weakest Signal)
    try {
        const prompt = `Classify the geographic entity "${name}" into exactly one of these categories:
settlement, landmark, archaeological_site, natural_feature, water_body, mountain, island, national_park, administrative_region, road, address, infrastructure, minor_poi, shipwreck_site, historical_site.

Return only the category name in lowercase, nothing else.`;

        const response = await generateContentWithRetry({
            model: modelName,
            contents: prompt,
            config: {
                temperature: 0.1,
                maxOutputTokens: 20,
            }
        });

        const text = response?.text?.trim().toLowerCase();
        
        const validTypes: GeographicEntityType[] = [
            "settlement", "landmark", "archaeological_site", "natural_feature", "water_body", 
            "mountain", "island", "national_park", "administrative_region", "road", 
            "address", "infrastructure", "minor_poi", "shipwreck_site", "historical_site"
        ];

        if (text && validTypes.includes(text as GeographicEntityType)) {
            // Guardrail: Do not let LLM turn obvious non-settlements into settlements
            if (text === 'settlement' && (q.includes('park') || q.includes('museum') || q.includes('monument'))) {
                return 'landmark';
            }
            return text as GeographicEntityType;
        }
    } catch (error) {
        console.warn("AI Classification failed, falling back to generic type:", error);
    }

    // 4. Fallback
    return 'minor_poi';
};
