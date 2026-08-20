/**
 * User-facing presentation layer for geographic categories and climate values.
 * Maps internal taxonomic entity types and formatting into plain, familiar English labels.
 * Preserves internal taxonomy unchanged for discovery, ranking, and normalization.
 */

export function formatUserFacingCategory(entityType?: string, name?: string, rawType?: string): string {
    const type = (entityType || rawType || '').toLowerCase().trim();
    const n = (name || '').toLowerCase().trim();

    // 1. Populated places
    if (type === 'city') return 'City';
    if (type === 'town') return 'Town';
    if (type === 'village') return 'Village';
    if (type === 'hamlet') return 'Village';
    if (type === 'municipality' || type === 'municipio') return 'Town';
    if (type === 'settlement' || type === 'populated_place' || type === 'populated place') {
        if (rawType === 'city') return 'City';
        if (rawType === 'village' || rawType === 'hamlet') return 'Village';
        return 'Town';
    }

    // 2. Specific features derived from name or type
    if (n.includes('national grassland') || type === 'national_grassland' || n.includes('grassland')) return 'National Grassland';
    if (n.includes('historic district') || type === 'historic_district') return 'Historic District';
    if (type === 'national_park' || n.includes('national park') || n.includes('parque nacional')) return 'National Park';
    if (type === 'state_park' || n.includes('state park') || n.includes('provincial park')) return 'State Park';
    if (type === 'nature_reserve' || n.includes('nature reserve') || n.includes('reserva natural') || n.includes('preserve') || n.includes('sanctuary')) return 'Nature Reserve';
    
    // 3. Mountains & landforms
    if (type === 'mountain' || n.includes('mountain') || n.startsWith('mount ') || n.startsWith('mt. ') || n.includes(' peak') || n.includes('pico') || n.includes('alps') || n.includes('range')) return 'Mountain';
    if (type === 'volcano' || n.includes('volcano') || n.includes('volcán')) return 'Volcano';
    if (type === 'canyon' || n.includes('canyon') || n.includes('cañón') || n.includes('gorge')) return 'Canyon';
    if (type === 'cave' || n.includes('cave') || n.includes('cavern')) return 'Cave';
    if (type === 'glacier' || n.includes('glacier')) return 'Glacier';
    if (type === 'desert' || n.includes('desert') || n.includes('desierto')) return 'Desert';
    if (type === 'forest' || n.includes('forest') || n.includes('woods') || n.includes('jungle')) return 'Forest';
    if (type === 'beach' || n.includes('beach') || n.includes('playa')) return 'Beach';
    if (type === 'island' || type === 'archipelago' || n.includes('island') || n.includes('isla') || n.includes('atoll')) return 'Island';

    // 4. Water features
    if (type === 'river' || n.includes(' river') || n.endsWith(' river') || n.startsWith('rio ') || n.startsWith('río ')) return 'River';
    if (type === 'lake' || n.includes(' lake') || n.startsWith('lake ') || n.includes('lagoon') || n.includes('laguna')) return 'Lake';
    if (type === 'creek' || n.includes(' creek') || n.endsWith(' creek') || n.includes('stream') || n.includes('brook')) return 'Creek';
    if (type === 'reservoir' || n.includes(' reservoir')) return 'Reservoir';
    if (type === 'waterfall' || n.includes(' falls') || n.includes(' waterfall') || n.includes('cascada')) return 'Waterfall';
    if (type === 'bay' || n.includes(' bay') || n.includes(' gulf') || n.includes('sound') || n.includes('strait')) return 'Bay';
    if (type === 'ocean' || type === 'sea' || n.includes(' sea') || n.includes(' ocean')) return 'Sea';
    if (type === 'water_body' || type === 'waterway') {
        if (n.includes('river')) return 'River';
        if (n.includes('lake') || n.includes('lagoon')) return 'Lake';
        if (n.includes('creek') || n.includes('stream') || n.includes('brook')) return 'Creek';
        if (n.includes('reservoir')) return 'Reservoir';
        if (n.includes('falls') || n.includes('waterfall')) return 'Waterfall';
        if (n.includes('bay') || n.includes('gulf')) return 'Bay';
        if (n.includes('waterway')) return 'Waterway';
        return 'River';
    }

    // 5. Cultural, historic, museum, building
    if (type === 'museum' || n.includes('museum')) return 'Museum';
    if (type === 'building' || type === 'skyscraper' || type === 'tower' || type === 'palace' || type === 'hall') return 'Building';
    if (type === 'airport' || n.includes('airport') || n.includes('airfield')) return 'Airport';
    if (type === 'station' || n.includes('station')) return 'Station';
    if (type === 'bridge' || n.includes('bridge')) return 'Bridge';
    if (type === 'historical_site' || type === 'historic_site' || type === 'historic' || type === 'heritage_site' || type === 'historical_event_site' || type === 'battlefield') return 'Historic Site';
    if (type === 'archaeological_site' || type === 'ruins' || type === 'monument' || type === 'castle' || type === 'fort') return 'Historic Site';
    if (type === 'shipwreck_site' || type === 'shipwreck') return 'Historic Site';
    if (type === 'park' || n.endsWith(' park')) return 'Park';
    if (type === 'landmark' || type === 'major_landmark') return 'Landmark';
    if (type === 'attraction' || type === 'theme_park' || type === 'resort') return 'Landmark';

    // 6. Natural / Geographic generic features
    if (type === 'natural_feature' || type === 'geographic_feature' || type === 'geology' || type === 'natural') {
        if (n.includes('grassland')) return 'National Grassland';
        if (n.includes('park')) return 'Park';
        if (n.includes('lake')) return 'Lake';
        if (n.includes('river')) return 'River';
        if (n.includes('creek')) return 'Creek';
        if (n.includes('mountain') || n.includes('peak')) return 'Mountain';
        return 'Natural Landmark';
    }

    // 7. Administrative regions
    if (type === 'administrative_region' || type === 'administrative' || type === 'state' || type === 'province' || type === 'department' || type === 'county' || type === 'district' || type === 'region') return 'Region';
    if (type === 'country') return 'Country';
    if (type === 'road' || type === 'route' || type === 'trail') return 'Route';

    if (type) {
        const cleaned = type.replace(/_/g, ' ').trim();
        if (cleaned.toLowerCase() === 'point of interest') return 'Point of Interest';
        return cleaned.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }
    return 'Landmark';
}

export function formatClimateName(name?: string): string {
    if (!name || typeof name !== 'string') return '';
    const trimmed = name.trim();
    if (!trimmed) return '';

    const hasLowercase = /[a-z]/.test(trimmed);
    if (hasLowercase && !/[A-Z]{3,}/.test(trimmed)) {
        return trimmed;
    }

    return trimmed.toLowerCase().replace(/(^|[/\s\-\(])([a-z])/g, (_, boundary, char) => {
        return boundary + char.toUpperCase();
    }).replace(/\b(and|or|of|in|with|the)\b/gi, (m) => m.toLowerCase());
}
