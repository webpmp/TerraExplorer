import { Candidate } from '../../types';
import { GeographicEntityType } from '../../domain';
import { classifyGeographicEntity } from '../classifierService';

export type EntityClass = 'settlement' | 'administrative_region' | 'major_landmark' | 'geographic_feature' | 'minor_poi' | 'generic';

export const classifyEntity = (candidate: Candidate): EntityClass => {
    const type = (candidate.type || '').toLowerCase();
    const name = (candidate.name || '').toLowerCase();
    const signals = (candidate.discoverySignals || []).map(s => s.toLowerCase());

    const adminTypes = ['state', 'province', 'county', 'district', 'governorate', 'prefecture', 'region', 'administrative'];
    if (adminTypes.includes(type)) return 'administrative_region';

    if (type === 'city' || type === 'town' || type === 'village' || type === 'municipality' || type === 'county seat' || type === 'populated place' || signals.some(s => s.includes('capital') || s.includes('city') || s.includes('town') || s.includes('municipality'))) {
        if (!name.includes('park') && !name.includes('hall') && !name.includes('museum')) return 'settlement';
    }

    if (type === 'national_park' || type === 'mountain' || type === 'volcano' || type === 'lake' || type === 'river' || signals.some(s => s.includes('national park') || s.includes('unesco') || s.includes('major landmark') || s.includes('historic site'))) {
        if (!name.includes('trail') && !name.includes('marker') && !name.includes('preserve') && !name.includes('management area')) {
            return type === 'mountain' || type === 'lake' || type === 'river' || type === 'volcano' ? 'geographic_feature' : 'major_landmark';
        }
    }

    if (name.includes('preserve') || name.includes('management area') || name.includes('scrub') || name.includes('wetland') || name.includes('trail') || name.includes('marker') || name.includes('mound') || type === 'preserve' || type === 'historic' || type === 'hamlet') {
        if (!signals.some(s => s.includes('unesco'))) return 'minor_poi';
    }

    if (type === 'tourism' || type === 'landmark' || type === 'museum') return 'generic';

    return 'generic';
};

export const getGeographicHierarchy = async (candidate: Candidate): Promise<{ tier: number, category: GeographicEntityType, importance: string }> => {
    const type = await classifyGeographicEntity(
        candidate.name,
        { lat: candidate.lat, lng: candidate.lng },
        candidate.discoverySignals || [],
        { type: candidate.type }
    );
    
    let tier = 5;
    let importance = 'minor';

    // Tier 1: Major settlements
    if (type === 'settlement' && (candidate.type === 'city' || candidate.name.match(/^(paris|london|new york|tokyo|cairo|dallas)$/i) || (candidate.discoverySignals || []).some(s => s.toLowerCase().includes('capital') || s.toLowerCase().includes('major city')))) {
        tier = 1;
        importance = 'major settlement';
    }
    // Tier 2: Cities / towns / important local settlements
    else if (type === 'settlement' && (candidate.type === 'town' || candidate.type === 'city' || (candidate.discoverySignals || []).some(s => s.toLowerCase().includes('town') || s.toLowerCase().includes('city')))) {
        tier = 2;
        importance = 'local settlement';
    }
    // Tier 3: Villages / minor settlements
    else if (type === 'settlement') {
        tier = 3;
        importance = 'village';
    }
    // Tier 4: Major landmarks and geographic features
    else if (type === 'landmark' || type === 'archaeological_site' || type === 'natural_feature' || type === 'mountain' || type === 'island' || type === 'national_park' || type === 'water_body' || type === 'shipwreck_site' || type === 'historical_site') {
        tier = 4;
        importance = 'major geographic feature / landmark';
    }
    // Tier 5: Minor POIs, roads, addresses, infrastructure
    else {
        tier = 5;
        importance = 'minor poi / road / infrastructure';
    }

    return { tier, category: type, importance };
};
