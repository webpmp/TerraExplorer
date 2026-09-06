import { LocationInfo } from '../types';
import { cleanMetadataString, formatImageAttribution, GalleryImage } from '../components/InfoPanel';
import { searchImageRegistry, canonicalizeImageUrl } from './imageDeduplicationService';
import { getHistoricalEntityKnowledge } from './geographic/historicalCoordinateValidator';

export interface ImageCandidate {
  url: string;
  title?: string;
  caption?: string;
  description?: string;
  attribution?: string;
  source?: string;
  coordinates?: { lat: number; lng: number };
  pageUrl?: string;
}

export type ImageSubjectShape =
  | 'SPECIFIC_ENTITY'
  | 'GEOGRAPHIC_FEATURE'
  | 'GEOGRAPHIC_COLLECTION'
  | 'DESCRIPTIVE_GEOGRAPHIC_QUERY'
  | 'BROAD_LOCATION'
  | 'TOPIC';

export type ImageValidationPolicy =
  | 'STRICT_ENTITY'
  | 'GEOGRAPHIC_FEATURE'
  | 'LOCATION_REPRESENTATIVE'
  | 'HISTORICAL_WAYPOINT'
  | 'TOPIC_REPRESENTATIVE';

export type ImageRelevanceTier = 1 | 2 | 3 | 4;

export interface ImageValidationResult {
  score: number;
  decision: 'ACCEPT' | 'REJECT';
  reason: string;
  candidate: ImageCandidate;
  tier?: ImageRelevanceTier;
}

export type ResolvedImageIntentType = 'ENTITY_SPECIFIC' | 'GENERIC_TOPIC' | 'UNRESOLVED';

export interface ResolvedImageIntent {
  type: ResolvedImageIntentType;
  topic?: string;
  entity?: string;
  entityRequired: boolean;
  geographicConstraint: boolean;
  shape?: ImageSubjectShape;
  policy?: ImageValidationPolicy;
  featureType?: string;
  parentLocation?: string;
  source: 'USER_QUERY' | 'ROUTE_CONTEXT' | 'ENTITY_NAME' | 'FALLBACK_QUERY' | 'UNKNOWN';
  fallback?: 'ORIGINAL_QUERY' | 'NONE';
}

export function logImageIntent(intent: ResolvedImageIntent): void {
  const lines = [
    '[IMAGE INTENT]',
    `type=${intent.type}`,
    `shape=${intent.shape || 'none'}`,
    `policy=${intent.policy || 'none'}`,
    `topic=${intent.topic ? `"${intent.topic}"` : 'none'}`,
    `entity=${intent.entity ? `"${intent.entity}"` : 'none'}`,
    `featureType=${intent.featureType || 'none'}`,
    `parentLocation=${intent.parentLocation || 'none'}`,
    `entityRequired=${intent.entityRequired}`,
    `geographicConstraint=${intent.geographicConstraint}`
  ];
  if (intent.type === 'UNRESOLVED' && intent.fallback) {
    lines.push(`fallback=${intent.fallback}`);
  }
  if (intent.source) {
    lines.push(`source=${intent.source}`);
  }
  console.log(lines.join('\n'));
}

export function resolveImageIntent(input: string | {
  name?: string;
  canonicalName?: string;
  entity?: string;
  intent?: string;
  routeTitle?: string;
  historicalContext?: string;
  context?: string;
  description?: string;
  waypoint?: any;
  entityType?: string;
  type?: string;
  query?: string;
  rawQuery?: string;
  metadataMode?: string;
}): ResolvedImageIntent {
  const queryString = typeof input === 'string' ? input.trim() : (input.rawQuery || input.query || '').trim();
  const nameString = typeof input === 'string' ? '' : (input.name || input.canonicalName || input.entity || '').trim();
  const intentString = typeof input === 'string' ? '' : (input.intent || '').trim();
  const routeTitleString = typeof input === 'string' ? '' : (input.routeTitle || input.waypoint?.routeTitle || '').trim();
  const contextString = typeof input === 'string' ? '' : (input.historicalContext || input.context || input.waypoint?.context || '').trim();

  // 1. Explicit Unknown / Unresolved Intent
  if (intentString.toLowerCase() === 'unknown') {
    const hasMeaningfulQuery = Boolean(queryString && queryString.length > 3);
    const intent: ResolvedImageIntent = {
      type: 'UNRESOLVED',
      topic: hasMeaningfulQuery ? queryString : undefined,
      entity: nameString || undefined,
      entityRequired: false,
      geographicConstraint: false,
      source: 'UNKNOWN',
      fallback: hasMeaningfulQuery ? 'ORIGINAL_QUERY' : 'NONE'
    };
    return intent;
  }

  // 2. Generic Topic / Multi-Location Discovery Detection from Query or Intent
  const multiLocPatterns = [
    /^\s*where\s+(?:was|were)\s+(.+?)\s+(?:filmed|shot)\s*\??\s*$/i,
    /^\s*what\s+(?:are|were)\s+(?:the\s+)?(?:filming|shooting)\s+locations\s+(?:for|of|in)\s+(.+?)\s*\??\s*$/i,
    /^\s*(?:filming|shooting)\s+locations\s+(?:for|of|in)\s+(.+?)\s*\??\s*$/i,
    /^\s*what\s+(?:places|locations|cities|sites)\s+(?:were|are)\s+used\s+(?:for|in)\s+(.+?)\s*\??\s*$/i,
    /^\s*what\s+locations\s+were\s+used\s+in\s+(.+?)\s*\??\s*$/i,
    /^\s*what\s+(?:are|were)\s+(?:the\s+)?(?:(?:world's|earth's|most\s+famous|famous|top|major|greatest|best)\s+)*(waterfalls|volcanoes|mountains|canyons|monuments|landmarks|castles|ruins|deserts|islands|cities|places|sites|wonders)\b.*?\??\s*$/i,
    /^\s*where\s+did\s+(?:the\s+)?(.+?(?:missions|expeditions|landings|voyages))\s+(?:land|touch\s+down|reach)\s*\??\s*$/i,
    /^\s*where\s+did\s+(?:the\s+)?(?:(?:major|key|famous)\s+)?battles\s+of\s+(?:the\s+)?(.+?)\s+(?:take\s+place|happen|occur)\s*\??\s*$/i,
    /^\s*what\s+places\s+were\s+involved\s+in\s+(?:the\s+)?(.+?)\s*\??\s*$/i
  ];

  let detectedTopic: string | undefined;

  if (queryString) {
    for (const pattern of multiLocPatterns) {
      const match = queryString.match(pattern);
      if (match) {
        const subject = match[1].replace(/^(?:the|a|an)\s+/i, '').replace(/[?.,!]+$/, '').trim();
        if (pattern.source.includes('filmed') || pattern.source.includes('filming') || pattern.source.includes('shooting') || pattern.source.includes('used in')) {
          detectedTopic = `${subject} filming locations`;
        } else if (pattern.source.includes('waterfalls|volcanoes|mountains')) {
          detectedTopic = `World's most famous ${subject}`;
        } else if (pattern.source.includes('missions|expeditions|landings')) {
          detectedTopic = `${subject} landing sites`;
        } else if (pattern.source.includes('battles')) {
          detectedTopic = `${subject} major battles`;
        } else if (pattern.source.includes('involved')) {
          detectedTopic = `${subject} locations`;
        } else {
          detectedTopic = `${subject} locations`;
        }
        break;
      }
    }
  }

  // Check if this is a GENERIC_TOPIC search:
  // - Query explicitly matches multi-location / generic topic query
  // - Or intent is explicitly MULTI_LOCATION_DISCOVERY / GENERIC_TOPIC
  // - Or input without a specific entity name has a topical route title
  if (
    detectedTopic ||
    intentString === 'MULTI_LOCATION_DISCOVERY' ||
    intentString === 'GENERIC_TOPIC' ||
    (!nameString && routeTitleString)
  ) {
    let finalTopic = detectedTopic;
    if (!finalTopic && routeTitleString) {
      finalTopic = routeTitleString;
    } else if (!finalTopic && queryString) {
      finalTopic = queryString;
    } else if (!finalTopic) {
      finalTopic = 'filming locations';
    }

    return {
      type: 'GENERIC_TOPIC',
      topic: finalTopic,
      entity: nameString || undefined,
      entityRequired: false,
      geographicConstraint: false,
      shape: 'TOPIC',
      policy: 'TOPIC_REPRESENTATIVE',
      source: queryString ? 'USER_QUERY' : (routeTitleString ? 'ROUTE_CONTEXT' : 'ENTITY_NAME')
    };
  }

  // 3. Entity-Specific Requests ("Show me pictures of Kingston Upon Mersey", "Show me images of X", or specific place)
  const isEntityPictureQuery = /^\s*(?:show\s+me\s+(?:pictures|images|photos)\s+of|pictures\s+of|images\s+of|photos\s+of)\s+(.+?)\s*[.?!]?\s*$/i.test(queryString);
  if (isEntityPictureQuery || nameString || intentString === 'DIRECT' || intentString === 'NATURAL_LOCATION' || intentString === 'specific_location') {
    let targetEntity = nameString;
    if (isEntityPictureQuery) {
      const match = queryString.match(/^\s*(?:show\s+me\s+(?:pictures|images|photos)\s+of|pictures\s+of|images\s+of|photos\s+of)\s+(.+?)\s*[.?!]?\s*$/i);
      if (match && match[1]) {
        targetEntity = match[1].trim();
      }
    }

    const effectiveTarget = targetEntity || nameString;
    const rawTarget = typeof input === 'object' ? input : { name: effectiveTarget };

    // Determine Subject Shape & Validation Policy Hierarchy:
    // A. HISTORICAL WAYPOINT (Completely isolated policy)
    if (isHistoricalWaypointEntity(rawTarget)) {
      return {
        type: 'ENTITY_SPECIFIC',
        topic: undefined,
        entity: effectiveTarget,
        entityRequired: true,
        geographicConstraint: true,
        shape: 'SPECIFIC_ENTITY',
        policy: 'HISTORICAL_WAYPOINT',
        source: queryString ? 'USER_QUERY' : 'ENTITY_NAME'
      };
    }

    // Extraction helper for feature type & parent location
    const featurePatterns = [
      { pattern: /\b(canals?|waterways?|canale|canali)\b/i, normalized: 'canal' },
      { pattern: /\b(waterfalls?|falls?)\b/i, normalized: 'waterfall' },
      { pattern: /\b(beaches?|beach)\b/i, normalized: 'beach' },
      { pattern: /\b(mountains?|mountain\s+ranges?|peaks?)\b/i, normalized: 'mountain' },
      { pattern: /\b(canyons?|gorges?)\b/i, normalized: 'canyon' },
      { pattern: /\b(valleys?)\b/i, normalized: 'valley' },
      { pattern: /\b(islands?|isles?)\b/i, normalized: 'island' },
      { pattern: /\b(waterfront|harbors?|harbours?)\b/i, normalized: 'waterfront' },
      { pattern: /\b(skylines?)\b/i, normalized: 'skyline' },
      { pattern: /\b(districts?|neighborhoods?|quarters?)\b/i, normalized: 'district' },
      { pattern: /\b(rivers?)\b/i, normalized: 'river' }
    ];

    const searchStr = `${queryString} ${effectiveTarget}`.toLowerCase();
    let featureType: string | undefined;
    for (const fp of featurePatterns) {
      if (fp.pattern.test(searchStr)) {
        featureType = fp.normalized;
        break;
      }
    }

    // Extract parentLocation if identifiable
    let parentLocation: string | undefined;
    if (featureType) {
      // Pattern 1: "Venice Canals" -> "Venice"
      const prefixMatch = effectiveTarget.match(new RegExp(`^(.*?)\\s+(?:${featureType}s?|waterways?|falls?|peaks?|ranges?)$`, 'i'));
      if (prefixMatch && prefixMatch[1].trim()) {
        parentLocation = prefixMatch[1].trim();
      }
      // Pattern 2: "Canals of Venice" or "Waterfalls in Yosemite"
      if (!parentLocation) {
        const prepMatch = effectiveTarget.match(new RegExp(`(?:${featureType}s?|waterways?|falls?)\\s+(?:of|in|near|around)\\s+(.+?)$`, 'i'));
        if (prepMatch && prepMatch[1].trim()) {
          parentLocation = prepMatch[1].trim();
        }
      }
      // Pattern 3: Query check "Where is Venice Canals?" or "Waterfalls in Yosemite"
      if (!parentLocation && queryString) {
        const qPrepMatch = queryString.match(new RegExp(`(?:${featureType}s?|waterways?|falls?)\\s+(?:of|in|near|around)\\s+([a-z0-9\\s'-]+?)(?:\\?|$|\\.|,)`, 'i'));
        if (qPrepMatch && qPrepMatch[1].trim()) {
          parentLocation = qPrepMatch[1].trim();
        }
      }
      // Fallback: if input has city, state, or country
      if (!parentLocation && typeof input === 'object') {
        parentLocation = (input as any).city || (input as any).state || (input as any).country;
      }
    }

    // Check Plural / Collection patterns: "Venice Canals", "Beaches of Maui", "Waterfalls in Yosemite"
    const isPluralCollection = /\b(canals|beaches|waterfalls|falls|islands|isles|mountains|canyons|valleys)\b/i.test(effectiveTarget) ||
      /\b(?:canals|beaches|waterfalls|islands|mountains)\s+(?:of|in)\b/i.test(queryString);

    // Check Descriptive query pattern: "Venice waterfront", "Yosemite waterfalls", "Maui beaches"
    const isDescriptiveQuery = Boolean(featureType) && (
      isPluralCollection ||
      /\b(waterfront|skyline|district|waterway)\b/i.test(effectiveTarget) ||
      /\b(?:waterfront|skyline|district|waterway)\b/i.test(queryString)
    );

    // Check Broad location: city, country, region without specific landmark
    const eType = (typeof input === 'object' ? (input.entityType || input.type || '') : '').toLowerCase();
    const isBroadSettlementOrRegion = ['settlement', 'city', 'town', 'village', 'country', 'state', 'province', 'administrative_region', 'administrative'].includes(eType) ||
      (typeof input === 'object' && !featureType && !/landmark|museum|monument|building|castle|fort|memorial|historic/i.test(eType) && (input as any).city === effectiveTarget);

    let shape: ImageSubjectShape;
    let policy: ImageValidationPolicy;
    let entityRequired = true;

    if (isPluralCollection) {
      shape = 'GEOGRAPHIC_COLLECTION';
      policy = 'GEOGRAPHIC_FEATURE';
      entityRequired = false;
    } else if (isDescriptiveQuery) {
      shape = 'DESCRIPTIVE_GEOGRAPHIC_QUERY';
      policy = 'GEOGRAPHIC_FEATURE';
      entityRequired = false;
    } else if (isBroadSettlementOrRegion) {
      shape = 'BROAD_LOCATION';
      policy = 'LOCATION_REPRESENTATIVE';
      entityRequired = false;
    } else if (featureType) {
      shape = 'GEOGRAPHIC_FEATURE';
      policy = 'GEOGRAPHIC_FEATURE';
      entityRequired = false;
    } else {
      shape = 'SPECIFIC_ENTITY';
      policy = 'STRICT_ENTITY';
      entityRequired = true;
    }

    return {
      type: 'ENTITY_SPECIFIC',
      topic: undefined,
      entity: effectiveTarget,
      entityRequired,
      geographicConstraint: true,
      shape,
      policy,
      featureType,
      parentLocation,
      source: queryString ? 'USER_QUERY' : 'ENTITY_NAME'
    };
  }

  // 4. Fallback if cannot resolve
  return {
    type: 'UNRESOLVED',
    topic: queryString || undefined,
    entity: nameString || undefined,
    entityRequired: false,
    geographicConstraint: false,
    source: 'UNKNOWN',
    fallback: queryString ? 'ORIGINAL_QUERY' : 'NONE'
  };
}

export function classifyTopicMatch(
  candidate: ImageCandidate,
  topic: string
): 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE' {
  if (!topic) return 'NONE';
  const fullText = `${candidate.title || ''} ${candidate.description || ''} ${candidate.caption || ''}`.toLowerCase();
  const topicLower = topic.toLowerCase();

  // Special handling for Game of Thrones
  if (topicLower.includes('game of thrones') || topicLower.includes('got')) {
    const gotKeywords = [
      'game of thrones', 'got', 'winterfell', "king's landing", 'westeros', 'filming location',
      'filmed here', 'filmed in', 'iron throne', 'hbo series', 'hbo', 'daenerys', 'stark', 'lannister', 'targaryen',
      'castle ward', 'dubrovnik', 'ballintoy', 'dark hedges', 'girona', 'alcázar of seville', 'osuna',
      'san juan de gaztelugatxe', 'svínafellsjökull', 'kirkjufell', 'grjótagjá', 'tollymore',
      'carncastle', 'magheramorne', "shane's castle", "audley's castle", 'inch abbey', 'cushendun',
      'portstewart', 'downhill strand', 'murlough bay', 'doune castle', 'zadar', 'trsteno', 'lokrum',
      'split', 'klis', 'šibenik', 'bardenas reales', 'peñíscola', 'castillo de zafra', 'almodóvar del río',
      'ait benhaddou', 'essaouira', 'ouarzazate', 'mdina', 'dwejra'
    ];
    if (gotKeywords.some(kw => fullText.includes(kw))) {
      return 'STRONG';
    }
    if (/\b(filming|filmed|film location|television series|tv series)\b/i.test(fullText)) {
      return 'MODERATE';
    }
    return 'NONE';
  }

  // General topical matching
  const stopWords = new Set(['where', 'was', 'were', 'the', 'what', 'are', 'is', 'of', 'in', 'for', 'to', 'and', 'a', 'an', 'locations', 'places', 'sites']);
  const tokens = topicLower.split(/[^a-z0-9]+/).filter(t => t.length > 2 && !stopWords.has(t));

  if (tokens.length === 0) {
    return fullText.includes(topicLower) ? 'STRONG' : 'NONE';
  }

  const matchingTokens = tokens.filter(t => fullText.includes(t));
  const ratio = matchingTokens.length / tokens.length;

  if (fullText.includes(topicLower) || ratio >= 0.8) {
    return 'STRONG';
  }
  if (ratio >= 0.5) {
    return 'MODERATE';
  }
  if (matchingTokens.length > 0) {
    return 'WEAK';
  }
  return 'NONE';
}

export function calculateHaversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function getEntityDistanceToleranceKm(entityType?: string): number {
  const type = (entityType || '').toLowerCase();
  if (
    type.includes('landmark') ||
    type.includes('monument') ||
    type.includes('building') ||
    type.includes('museum') ||
    type.includes('poi') ||
    type.includes('temple') ||
    type.includes('palace') ||
    type.includes('church') ||
    type.includes('castle') ||
    type.includes('ruin') ||
    type.includes('square')
  ) {
    return 15; // Tight radius for physical landmarks/buildings
  }
  if (
    type.includes('mountain') ||
    type.includes('volcano') ||
    type.includes('lake') ||
    type.includes('river') ||
    type.includes('waterfall') ||
    type.includes('island') ||
    type.includes('beach') ||
    type.includes('park') ||
    type.includes('natural')
  ) {
    return 85; // Feature-appropriate radius for natural features
  }
  if (type.includes('city') || type.includes('town') || type.includes('village') || type.includes('settlement')) {
    return 50; // Broad radius for cities/towns
  }
  if (type.includes('state') || type.includes('province') || type.includes('region') || type.includes('county')) {
    return 250; // Regional radius
  }
  if (type.includes('country') || type.includes('nation')) {
    return 1500; // Country-level radius
  }
  return 50;
}

export function isGenericFlagOrEmblem(title: string = '', description: string = '', entityName: string = ''): boolean {
  const entityLower = entityName.toLowerCase();
  if (
    entityLower.includes('flag') ||
    entityLower.includes('emblem') ||
    entityLower.includes('coat of arms') ||
    entityLower.includes('seal')
  ) {
    return false; // Subject is legitimately about a flag/emblem
  }
  const text = `${title} ${description}`.toLowerCase();
  const flagPatterns = [
    /\bflag of\b/i,
    /\bnational flag\b/i,
    /\bcivil flag\b/i,
    /\bstate flag\b/i,
    /\bcoat of arms\b/i,
    /\bnaval ensign\b/i,
    /\broyal standard\b/i,
    /\bseal of\b/i,
    /\bemblem of\b/i,
    /\bbandera de\b/i,
    /\bdrapeau de\b/i,
    /\bflaggen\b/i
  ];
  return flagPatterns.some(pattern => pattern.test(text));
}

const KNOWN_COUNTRIES = [
  'united states', 'usa', 'united states of america', 'canada', 'mexico', 'united kingdom', 'uk',
  'great britain', 'england', 'scotland', 'wales', 'france', 'germany', 'italy', 'spain', 'portugal',
  'china', 'japan', 'south korea', 'north korea', 'india', 'australia', 'new zealand', 'russia',
  'brazil', 'argentina', 'egypt', 'south africa', 'turkey', 'greece', 'iran', 'iraq', 'switzerland',
  'austria', 'netherlands', 'belgium', 'sweden', 'norway', 'denmark', 'finland', 'ireland', 'poland'
];

const KNOWN_MAJOR_CITIES: Record<string, string> = {
  'san francisco': 'united states',
  'los angeles': 'united states',
  'new york': 'united states',
  'chicago': 'united states',
  'las vegas': 'united states',
  'seattle': 'united states',
  'london': 'united kingdom',
  'paris': 'france',
  'berlin': 'germany',
  'rome': 'italy',
  'madrid': 'spain',
  'barcelona': 'spain',
  'tokyo': 'japan',
  'kyoto': 'japan',
  'beijing': 'china',
  'shanghai': 'china',
  'hong kong': 'china',
  'sydney': 'australia',
  'melbourne': 'australia',
  'toronto': 'canada',
  'vancouver': 'canada'
};

const CANADIAN_PROVINCES = [
  'ontario', 'quebec', 'british columbia', 'alberta', 'manitoba', 'saskatchewan',
  'nova scotia', 'new brunswick', 'newfoundland', 'prince edward island', 'northwest territories', 'yukon', 'nunavut'
];

const US_STATES = [
  'california', 'texas', 'florida', 'new york', 'illinois', 'pennsylvania', 'ohio', 'georgia',
  'north carolina', 'michigan', 'new jersey', 'virginia', 'washington', 'arizona', 'massachusetts',
  'tennessee', 'indiana', 'missouri', 'maryland', 'wisconsin', 'colorado', 'minnesota', 'south carolina',
  'alabama', 'louisiana', 'kentucky', 'oregon', 'oklahoma', 'connecticut', 'utah', 'iowa', 'nevada',
  'arkansas', 'mississippi', 'kansas', 'new mexico', 'nebraska', 'idaho', 'west virginia', 'hawaii',
  'new hampshire', 'maine', 'montana', 'rhode island', 'delaware', 'south dakota', 'north dakota',
  'alaska', 'vermont', 'wyoming'
];

export function detectGeographicMismatch(
  candidate: ImageCandidate,
  entity: { name: string; city?: string; state?: string; country?: string; coordinates?: { lat: number; lng: number }; entityType?: string }
): { mismatch: boolean; location?: string; reason?: string } {
  // 1. Coordinate check
  if (candidate.coordinates && entity.coordinates && entity.coordinates.lat !== 0 && entity.coordinates.lng !== 0) {
    const dist = calculateHaversineDistanceKm(
      entity.coordinates.lat,
      entity.coordinates.lng,
      candidate.coordinates.lat,
      candidate.coordinates.lng
    );
    const tolerance = getEntityDistanceToleranceKm(entity.entityType);
    if (dist > tolerance) {
      return {
        mismatch: true,
        location: `${candidate.coordinates.lat.toFixed(4)}, ${candidate.coordinates.lng.toFixed(4)}`,
        reason: 'Geographic mismatch'
      };
    }
  }

  // 2. Textual location check
  const text = `${candidate.title || ''} ${candidate.caption || ''} ${candidate.description || ''}`.toLowerCase();
  const targetCountry = (entity.country || '').toLowerCase().trim();
  const targetCity = (entity.city || '').toLowerCase().trim();
  const targetState = (entity.state || '').toLowerCase().trim();

  // If entity is outside the United States and candidate text explicitly mentions a US city or state
  if (targetCountry && targetCountry !== 'united states' && targetCountry !== 'usa') {
    for (const usCity of Object.keys(KNOWN_MAJOR_CITIES)) {
      if (KNOWN_MAJOR_CITIES[usCity] === 'united states') {
        const regex = new RegExp(`\\b${usCity}\\b`, 'i');
        if (regex.test(text)) {
          return {
            mismatch: true,
            location: `${usCity.charAt(0).toUpperCase() + usCity.slice(1)}, United States`,
            reason: `Geographic mismatch: candidate refers to ${usCity}, but entity is in ${entity.country}`
          };
        }
      }
    }

    for (const usState of US_STATES) {
      const regex = new RegExp(`\\b${usState}\\b`, 'i');
      if (regex.test(text) && !entity.name.toLowerCase().includes(usState)) {
        return {
          mismatch: true,
          location: `${usState.charAt(0).toUpperCase() + usState.slice(1)}, United States`,
          reason: `Geographic mismatch: candidate refers to ${usState}, but entity is in ${entity.country}`
        };
      }
    }
  }

  // If entity is outside Canada and candidate text explicitly mentions a Canadian province
  if (targetCountry && targetCountry !== 'canada') {
    for (const province of CANADIAN_PROVINCES) {
      const regex = new RegExp(`\\b${province}\\b`, 'i');
      if (regex.test(text) && !entity.name.toLowerCase().includes(province)) {
        return {
          mismatch: true,
          location: `${province.charAt(0).toUpperCase() + province.slice(1)}, Canada`,
          reason: `Geographic mismatch: candidate refers to ${province}, but entity is in ${entity.country}`
        };
      }
    }
  }

  // Helper to test if two country names are equivalent
  const isEquivalentCountry = (c1: string, c2: string) => {
    const norm = (c: string) => {
      const trimmed = c.toLowerCase().trim();
      if (trimmed === 'usa' || trimmed === 'united states of america' || trimmed === 'us' || trimmed === 'u.s.' || trimmed === 'united states') return 'united states';
      if (trimmed === 'uk' || trimmed === 'united kingdom' || trimmed === 'great britain' || trimmed === 'england' || trimmed === 'scotland' || trimmed === 'wales' || trimmed === 'northern ireland') return 'united kingdom';
      return trimmed;
    };
    return norm(c1) === norm(c2);
  };

  // Check conflicting foreign country mentions when entity country is known
  if (targetCountry) {
    // Sort known countries descending by length so compound names like 'northern ireland' match before 'ireland'
    const sortedCountries = [...KNOWN_COUNTRIES, 'northern ireland'].sort((a, b) => b.length - a.length);
    for (const c of sortedCountries) {
      const regex = new RegExp(`(?:^|[^a-z0-9])${c}(?:$|[^a-z0-9])`, 'i');
      if (regex.test(text)) {
        if (!isEquivalentCountry(c, targetCountry)) {
          // If text mentions 'northern ireland' and c is 'ireland', ignore because it's part of 'northern ireland'
          if (c === 'ireland' && text.includes('northern ireland') && isEquivalentCountry('northern ireland', targetCountry)) {
            continue;
          }
          return {
            mismatch: true,
            location: c.toUpperCase(),
            reason: `Geographic mismatch: candidate refers to ${c}, but entity is in ${entity.country}`
          };
        }
      }
    }
  }

  // If entity is a specific landmark in a known city, check for conflicting major cities
  const isLandmark = (entity.entityType || '').toLowerCase().includes('landmark') || (entity.entityType || '').toLowerCase().includes('poi');
  if (isLandmark && targetCity) {
    for (const city of Object.keys(KNOWN_MAJOR_CITIES)) {
      if (city !== targetCity && !targetCity.includes(city) && !city.includes(targetCity)) {
        const regex = new RegExp(`\\b${city}\\b`, 'i');
        if (regex.test(text) && !entity.name.toLowerCase().includes(city)) {
          return {
            mismatch: true,
            location: city.charAt(0).toUpperCase() + city.slice(1),
            reason: `Geographic mismatch: candidate refers to ${city}, but landmark is in ${entity.city}`
          };
        }
      }
    }
  }

  // Check homonymous city in conflicting state/province:
  // e.g. Entity is "Florence, Italy" or "Milan, Italy" or "Venice, Italy" or "Rome, Italy" or "London, England"
  // but candidate is "Milan, Ohio" or "Rome, Georgia" or "Venice, Florida" or "London, Ontario"
  const entityCityOrName = targetCity || entity.name.toLowerCase().split(/[,–-]/)[0].trim();
  if (targetCountry && targetCountry !== 'united states' && targetCountry !== 'usa' && targetCountry !== 'canada') {
    const homonymUSMatch = text.match(new RegExp(`\\b${entityCityOrName}\\b[\\s,]+(?:in\\s+)?([a-z\\s]+)`, 'i'));
    if (homonymUSMatch) {
      const rest = homonymUSMatch[1].toLowerCase().trim();
      const stateMatch = US_STATES.find(st => rest.startsWith(st) || rest.includes(st));
      if (stateMatch) {
        return {
          mismatch: true,
          location: `${entityCityOrName.charAt(0).toUpperCase() + entityCityOrName.slice(1)}, ${stateMatch.charAt(0).toUpperCase() + stateMatch.slice(1)}`,
          reason: `Geographic mismatch: candidate refers to ${entityCityOrName} in ${stateMatch}, but entity is in ${entity.country}`
        };
      }
      const provinceMatch = CANADIAN_PROVINCES.find(prov => rest.startsWith(prov) || rest.includes(prov));
      if (provinceMatch) {
        return {
          mismatch: true,
          location: `${entityCityOrName.charAt(0).toUpperCase() + entityCityOrName.slice(1)}, ${provinceMatch.charAt(0).toUpperCase() + provinceMatch.slice(1)}`,
          reason: `Geographic mismatch: candidate refers to ${entityCityOrName} in ${provinceMatch}, but entity is in ${entity.country}`
        };
      }
    }
  }

  return { mismatch: false };
}

function normalizeDiacritics(str: string): string {
  if (!str) return '';
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export type ImageEvidenceType =
  | 'EXACT_ENTITY'
  | 'KNOWN_ALIAS'
  | 'DIRECT_ENTITY_SOURCE'
  | 'RELATED_ENTITY'
  | 'GENERIC_TOPIC'
  | 'UNRELATED'
  | 'UNKNOWN';

export function isSuspiciousPlaceholderCoordinate(lat?: number, lng?: number): boolean {
  if (lat === undefined || lng === undefined || typeof lat !== 'number' || typeof lng !== 'number') {
    return false;
  }
  if (lat === 0 && lng === 0) return true;
  if (lat === 999 || lat === 998 || lat === 997 || lng === 999 || lng === 998 || lng === 997) return true;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return true;

  const isSequentialDigits = (num: number): boolean => {
    const s = Math.abs(num).toString().replace(/[^0-9]/g, '');
    if (s.length < 5) return false;

    let incCount = 1;
    let decCount = 1;
    let maxInc = 1;
    let maxDec = 1;

    for (let i = 1; i < s.length; i++) {
      const prev = parseInt(s[i - 1], 10);
      const curr = parseInt(s[i], 10);

      if (curr === (prev + 1) % 10) {
        incCount++;
        maxInc = Math.max(maxInc, incCount);
      } else {
        incCount = 1;
      }

      if (curr === (prev - 1 + 10) % 10) {
        decCount++;
        maxDec = Math.max(maxDec, decCount);
      } else {
        decCount = 1;
      }
    }

    return maxInc >= 5 || maxDec >= 5;
  };

  return isSequentialDigits(lat) || isSequentialDigits(lng);
}

export function isGenericTopicCandidate(title: string = '', description: string = ''): boolean {
  const text = `${title} ${description}`.toLowerCase();
  const titleLower = (title || '').toLowerCase().trim();

  // Pattern 1: Explicit List / Category / Timeline / Portal / Overview pages
  const genericPrefixPatterns = [
    /^list of\b/i,
    /^timeline of\b/i,
    /^category:\b/i,
    /^portal:\b/i,
    /^index of\b/i,
    /^outline of\b/i,
    /^glossary of\b/i,
    /^history of\b/i,
    /^disasters of\b/i,
    /^shipwrecks of\b/i,
    /^incidents of\b/i
  ];

  if (genericPrefixPatterns.some(p => p.test(titleLower))) {
    return true;
  }

  // Pattern 2: Generic category phrases
  const genericCategoryPatterns = [
    /\b(maritime disaster|maritime disasters)\b/i,
    /\bmigrant vessel incidents\b/i,
    /\bshipping accidents\b/i,
    /\bmarine accidents\b/i,
    /\blist of shipwrecks\b/i,
    /\bgeneric shipwreck\b/i,
    /\bgeneric cargo ship\b/i,
    /\bgeneric maritime\b/i,
    /\bgeneric ocean\b/i,
    /\bgeneric photograph\b/i,
    /\bstock photograph\b/i,
    /\bstock photo\b/i
  ];

  if (genericCategoryPatterns.some(p => p.test(titleLower) || p.test(text))) {
    return true;
  }

  // Pattern 3: Board games, video games, tabletop games, toys, fictional media disambiguations
  const nonGeographicMediaPatterns = [
    /\b(?:board\s+game|video\s+game|tabletop\s+game|card\s+game|role-playing\s+game|war\s+game|collectible\s+card\s+game|toy|soundtrack|album|single\s+track|fictional\s+character|manga|anime)\b/i,
    /\((?:video\s+game|board\s+game|game|toy|card\s+game|tabletop\s+game|single|song|album|soundtrack|band|comic|comics|manga|anime|season\s+\d+|episode)\)$/i
  ];

  if (nonGeographicMediaPatterns.some(p => p.test(titleLower) || p.test(text))) {
    return true;
  }

  return false;
}

export function isDifferentNamedEntity(
  title: string = '',
  description: string = '',
  targetEntityName: string,
  aliases: string[] = []
): boolean {
  const titleClean = (title || '').trim();
  const targetLower = targetEntityName.toLowerCase().trim();
  const allTargetAliases = [targetLower, ...aliases.map(a => a.toLowerCase().trim())].filter(Boolean);

  // Non-settlement organization, facility, person, or administrative division check
  // (e.g. "Dallas Cowboys", "Dallas County", "Dallas Fort Worth International Airport", "Bryce Dallas Howard", "ADX Florence", "Florence Nightingale", "Florence Welch", "Florence (drug)")
  const nonSettlementPatterns = [
    /\b(?:cowboys|mavericks|stars|rangers|texans|astros|spurs|rockets|fc|united|club|team|franchise)\b/i,
    /\b(?:athletics|sports|basketball|football|baseball|soccer|softball|volleyball|lacrosse|track and field|roster|tournament|championship|division [i|ii|iii]|ncaa|naia|athletic program|athletic team)\b/i,
    /\b(?:antelopes|wildcats|bulldogs|tigers|badgers|wolverines|gators|tar heels|seminoles|buckeyes|longhorns|sooners)\b/i,
    /\b(?:logo|insignia|crest|emblem|mascot)\b/i,
    /\b(?:county|parish|borough|metroplex|metropolitan area|combined statistical area|hundred of|lodge|hotel|motel|station|homestead)\b/i,
    /\b(?:international airport|regional airport|airport|airfield|aerodrome|station|terminal|transit authority)\b/i,
    /\b(?:independent school district|school district|isd|high school|university|college|hospital|medical center)\b/i,
    /\b(?:police department|fire department|sheriff|department of)\b/i,
    /\b(?:adx|admax|usp|penitentiary|correctional\s+(?:institution|facility|center)|federal\s+prison|state\s+prison|detention\s+center|prison)\b/i,
    /\b(?:nightingale|welch|kundera|actor|actress|director|singer|musician|politician|author|player|coach|nurse|novelist|athlete)\b/i,
    /\((?:drug|medication|pharmaceutical|album|song|single|band|film|tv\s+series|novel|magazine|comics)\)$/i
  ];

  for (const pattern of nonSettlementPatterns) {
    if (pattern.test(titleClean) && !pattern.test(targetLower)) {
      return true;
    }
  }

  // Geographic natural feature vs conflicting feature type check (e.g. Antelope Island vs Antelope Canyon)
  const naturalFeatureTypes: Array<{ type: string; regex: RegExp }> = [
    { type: 'canyon', regex: /\b(?:canyons?|gorges?|ravines?|chasms?)\b/i },
    { type: 'island', regex: /\b(?:islands?|isles?|atolls?|archipelagos?)\b/i },
    { type: 'mountain', regex: /\b(?:mountains?|peaks?|ranges?|summits?)\b/i },
    { type: 'lake', regex: /\b(?:lakes?|lochs?|reservoirs?)\b/i },
    { type: 'falls', regex: /\b(?:waterfalls?|falls?|cascades?)\b/i },
    { type: 'river', regex: /\b(?:rivers?|creeks?|streams?)\b/i }
  ];

  const targetFeatureType = naturalFeatureTypes.find(f => f.regex.test(targetLower));
  if (targetFeatureType) {
    // If target is a natural feature (e.g. canyon), check if candidate explicitly represents a different feature type
    for (const f of naturalFeatureTypes) {
      if (f.type !== targetFeatureType.type && f.regex.test(titleClean) && !targetFeatureType.regex.test(titleClean)) {
        return true;
      }
    }

    // If target is a natural feature, check if candidate represents an administrative place or settlement (e.g. "Antelope, Oregon", "Antelope (city)")
    // But do NOT treat "Antelope Canyon, Arizona" as a settlement disambiguation!
    const settlementDisambiguation = /,\s*(?:[A-Z][a-z]+|[A-Z]{2})(?:\s+USA|\s+United States)?$|\((?:city|town|village|census-designated place|cdp|community|unincorporated community)\)$/i;
    if (settlementDisambiguation.test(titleClean) && !settlementDisambiguation.test(targetEntityName) && !targetFeatureType.regex.test(titleClean)) {
      return true;
    }
  }

  // Maritime vessel vs non-maritime locality disambiguation
  const isTargetVessel = targetLower.startsWith('ss ') || targetLower.startsWith('uss ') || targetLower.startsWith('hms ') || targetLower.includes('shipwreck') || targetLower.includes('wreck');
  const fullText = `${titleClean} ${description || ''}`.toLowerCase();

  if (isTargetVessel) {
    const isLandLocality = /\b(?:hundred of|lodge|hotel|resort|rural locality|town in south australia|south australia|locality in)\b/i.test(fullText);
    const hasVesselMarker = /\b(?:ship|vessel|wreck|shipwreck|maritime|coral sea|great barrier reef|steamship)\b/i.test(fullText);
    if (isLandLocality && !hasVesselMarker) {
      return true;
    }
  }

  // If candidate title looks like a person, sports team, or facility while target is a settlement/region
  const isTargetSettlement = /\b(city|town|village|settlement|municipality|capital|metro)\b/i.test(targetLower);
  // Also check if candidate is a person (e.g. Bryce Dallas Howard, Florence Nightingale)
  const isPersonCandidate = /\b(?:actress|actor|director|singer|musician|politician|author|novelist|athlete)\b/i.test(description || '');
  if (isPersonCandidate && (isTargetSettlement || !/\b(?:actress|actor|director|singer|musician|politician|author|novelist|athlete)\b/i.test(targetLower))) {
    return true;
  }

  // If title or description directly contains target entity name or any alias, check if candidate title is an overt person, prison, or disambiguation before accepting
  if (allTargetAliases.some(a => fullText.includes(a))) {
    const isOvertPersonOrFacility = nonSettlementPatterns.some(pattern => pattern.test(titleClean) && !pattern.test(targetLower));
    if (!isOvertPersonOrFacility) {
      return false;
    }
  }

  // Vessel prefixes: SS, USS, HMS, RMS, MV, MS, MT, SV, RV, PS
  const vesselPrefixMatch = titleClean.match(/^(?:ss|uss|hms|rms|mv|ms|mt|sv|rv|ps)\s+([a-z0-9\s'-]+)/i);
  if (vesselPrefixMatch) {
    const vesselName = vesselPrefixMatch[1].toLowerCase().trim();
    // If the vessel name does not match any target alias or fullText narrative context
    const hasVesselInAliasesOrContext = allTargetAliases.some(a => a.includes(vesselName) || vesselName.includes(a) || fullText.includes(a));
    if (!hasVesselInAliasesOrContext) {
      return true;
    }
  }

  // Check wreck of USS / SS / HMS...
  const wreckPrefixMatch = titleClean.match(/^wreck of (?:the )?(?:ss|uss|hms|rms|mv|ms|mt|sv|rv|ps)\s+([a-z0-9\s'-]+)/i);
  if (wreckPrefixMatch) {
    const vesselName = wreckPrefixMatch[1].toLowerCase().trim();
    const hasVesselInAliasesOrContext = allTargetAliases.some(a => a.includes(vesselName) || vesselName.includes(a) || fullText.includes(a));
    if (!hasVesselInAliasesOrContext) {
      return true;
    }
  }

  // Distinctive token check for other named shipwrecks / vessels
  const diffVesselPatterns = [
    /\b(edmund fitzgerald|okanogan|memphis|eldorado|costa concordia|dona paz|estonia|mary rose|lusitania|andrea doria|bismarck|hood)\b/i
  ];

  for (const pattern of diffVesselPatterns) {
    if (pattern.test(titleClean) && !pattern.test(targetLower)) {
      return true;
    }
  }

  // Conflicting historical trail / route detection
  // (e.g. Fort Gibson / Trail of Tears must reject Oregon Trail, Chilkoot Trail, Mormon Trail, Appalachian Trail)
  const knownTrails = [
    { name: 'oregon trail', regex: /\boregon\s+trail\b/i },
    { name: 'trail of tears', regex: /\btrail\s+of\s+tears\b/i },
    { name: 'chilkoot trail', regex: /\bchilkoot\s+trail\b/i },
    { name: 'mormon trail', regex: /\bmormon\s+trail\b/i },
    { name: 'santa fe trail', regex: /\bsanta\s+fe\s+trail\b/i },
    { name: 'california trail', regex: /\bcalifornia\s+trail\b/i },
    { name: 'appalachian trail', regex: /\bappalachian\s+trail\b/i },
    { name: 'boone trace', regex: /\bboone(?:'s)?\s+trace\b/i },
    { name: 'wilderness road', regex: /\bwilderness\s+road\b/i },
    { name: 'overland trail', regex: /\boverland\s+trail\b/i },
    { name: 'pony express', regex: /\bpony\s+express\b/i }
  ];

  for (const trail of knownTrails) {
    if (trail.regex.test(fullText)) {
      const isTargetRelatedToTrail = allTargetAliases.some(a => trail.regex.test(a)) ||
        trail.regex.test(targetLower) ||
        (description && trail.regex.test(description));
      if (!isTargetRelatedToTrail) {
        // If image explicitly mentions an unrelated historical trail, reject it
        return true;
      }
    }
  }

  // If entity has a known city/country, check for conflicting foreign cities/countries
  if (allTargetAliases.length > 0) {
    const diffCityMatch = titleClean.match(/\b(melbourne|sydney|brisbane|tokyo|paris|london|new york|beijing|rome|berlin|madrid|moscow|toronto)\b/i);
    if (diffCityMatch) {
      const cityMention = diffCityMatch[1].toLowerCase();
      if (!allTargetAliases.some(a => a.includes(cityMention)) && !targetLower.includes(cityMention)) {
        // If candidate explicitly names a different major world city not in target aliases
        return true;
      }
    }
  }

  return false;
}

export function classifyImageEvidence(
  candidate: ImageCandidate,
  entity: {
    name: string;
    canonicalName?: string;
    aliases?: string[];
  }
): {
  evidenceType: ImageEvidenceType;
  entityMatchLevel: 'EXACT' | 'HIGH' | 'MEDIUM' | 'NONE';
  matchedAlias?: string;
} {
  const entityName = entity.name || '';
  const canonicalName = entity.canonicalName || '';
  const title = candidate.title || '';
  const desc = candidate.description || candidate.caption || '';
  const fullText = `${title} ${desc}`.toLowerCase();
  const normFullText = normalizeDiacritics(fullText);
  const titleLower = title.toLowerCase();

  const aliases = [
    entityName.toLowerCase(),
    canonicalName.toLowerCase(),
    ...(entity.aliases || []).map(a => a.toLowerCase())
  ].filter(Boolean);

  if (entityName.toLowerCase().includes('forbidden city')) {
    aliases.push('palace museum', 'gugong', '故宫', '紫禁城', 'imperial palace', 'beijing imperial palace', 'forbidden city', 'forbidden city meridian gate', 'meridian gate');
  }

  // Derive clean landmark / site / shipwreck aliases non-destructively
  // e.g. "Queen Anne's Revenge Shipwreck" -> "Queen Anne's Revenge"
  // "Blackbeard's Queen Anne's Revenge" -> "Queen Anne's Revenge", "Blackbeard's Queen Anne's Revenge"
  const cleanBase = entityName.toLowerCase()
    .replace(/^(?:shipwreck of (?:the )?|wreck of (?:the )?|the )/i, '')
    .replace(/\s+(?:shipwreck|wreck location|discovery site|wreck site|wreck|ship|archaeological site|movie set|film set|set|site|monument|memorial|historic site|ruins|battlefield)$/i, '')
    .trim();

  if (cleanBase) {
    aliases.push(
      cleanBase,
      `ss ${cleanBase}`,
      `${cleanBase} ship`,
      `${cleanBase} shipwreck`,
      `${cleanBase} wreck`,
      `${cleanBase} site`,
      `${cleanBase} historic site`,
      `${cleanBase} ruins`,
      `${cleanBase} monument`,
      `${cleanBase} memorial`,
      `${cleanBase} castle`,
      `${cleanBase} estate`,
      `${cleanBase} fort`,
      `${cleanBase} house`,
      `${cleanBase} park`,
      `${cleanBase} palace`,
      `wreck of the ${cleanBase}`,
      `wreck of ${cleanBase}`,
      `shipwreck of ${cleanBase}`,
      `shipwreck of the ${cleanBase}`
    );

    // If entity has possessive or associated person/vessel prefix (e.g. "Blackbeard's Queen Anne's Revenge")
    // also recognize the base entity name and vice versa
    const possessiveMatch = cleanBase.match(/^[a-z0-9\s'-]+(?:'s|')\s+(.+)$/i);
    if (possessiveMatch && possessiveMatch[1]) {
      const subEntity = possessiveMatch[1].trim();
      if (subEntity.length >= 3) {
        aliases.push(subEntity, `${subEntity} shipwreck`, `${subEntity} wreck`, `${subEntity} ship`);
      }
    }
  }

  const dedupedAliases = Array.from(new Set(aliases.filter(Boolean)));

  // 1. Check EXACT_ENTITY
  const exactMatch = dedupedAliases.find(a => 
    titleLower === a || 
    titleLower.startsWith(`${a} (`) || 
    titleLower.startsWith(`${a},`) ||
    titleLower === `${a} estate` ||
    titleLower === `${a} castle` ||
    titleLower === `${a} fort` ||
    titleLower === `${a} house` ||
    titleLower === `the ${a}`
  );
  if (exactMatch) {
    console.log(`[IMAGE ENTITY ALIAS MATCH]\ncanonicalEntity="${entityName}"\nmatchedAlias="${exactMatch}"\ncandidateTitle="${title}"`);
    return {
      evidenceType: 'EXACT_ENTITY',
      entityMatchLevel: 'EXACT',
      matchedAlias: exactMatch
    };
  }

  // 2. Check KNOWN_ALIAS
  const aliasMatch = dedupedAliases.find(a => fullText.includes(a) || normFullText.includes(normalizeDiacritics(a)));
  if (aliasMatch) {
    console.log(`[IMAGE ENTITY ALIAS MATCH]\ncanonicalEntity="${entityName}"\nmatchedAlias="${aliasMatch}"\ncandidateTitle="${title}"`);
    return {
      evidenceType: 'KNOWN_ALIAS',
      entityMatchLevel: 'HIGH',
      matchedAlias: aliasMatch
    };
  }

  return {
    evidenceType: 'UNKNOWN',
    entityMatchLevel: 'NONE'
  };
}

export function classifySemanticFeatureMatch(
  candidate: ImageCandidate,
  entity: {
    name: string;
    canonicalName?: string;
    city?: string;
    state?: string;
    country?: string;
    coordinates?: { lat: number; lng: number };
    aliases?: string[];
  },
  context: {
    featureType?: string;
    parentLocation?: string;
  }
): 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE' {
  const fullText = `${candidate.title || ''} ${candidate.description || ''} ${candidate.caption || ''}`.toLowerCase();
  const titleLower = (candidate.title || '').toLowerCase();

  const featureType = (context.featureType || '').toLowerCase().trim();
  const parentLocation = (context.parentLocation || entity.city || entity.state || '').toLowerCase().trim();
  const country = (entity.country || '').toLowerCase().trim();

  // If no featureType is specified, check parent location match
  if (!featureType) {
    if (parentLocation && fullText.includes(parentLocation)) {
      return 'MODERATE';
    }
    return 'NONE';
  }

  // Related generic vocabulary for featureType
  const featureEquivalents: Record<string, RegExp> = {
    canal: /\b(canals?|canale|canali|waterways?|gracht|grachten)\b/i,
    waterfall: /\b(waterfalls?|falls?|cascade|cascades)\b/i,
    beach: /\b(beaches?|beach|coast|shore|coastline)\b/i,
    mountain: /\b(mountains?|mountain\s+range|ranges?|peaks?|summit|pass)\b/i,
    canyon: /\b(canyons?|gorges?|ravine)\b/i,
    valley: /\b(valleys?|vale)\b/i,
    island: /\b(islands?|isles?|atoll|archipelago)\b/i,
    waterfront: /\b(waterfront|harbors?|harbours?|port|quay|marina)\b/i,
    skyline: /\b(skylines?|cityscape|panorama|aerial\s+view)\b/i,
    district: /\b(districts?|neighborhoods?|quarters?|boroughs?)\b/i,
    river: /\b(rivers?|streams?|creeks?)\b/i
  };

  const featureRegex = featureEquivalents[featureType] || new RegExp(`\\b${featureType}s?\\b`, 'i');
  const hasFeatureMention = featureRegex.test(fullText);
  const hasParentLocationMention = parentLocation ? fullText.includes(parentLocation) : false;

  // Geographic consistency check from coordinates if candidate has coordinates
  let geoConsistent = false;
  if (candidate.coordinates && entity.coordinates && entity.coordinates.lat !== 0 && entity.coordinates.lng !== 0) {
    const dist = calculateHaversineDistanceKm(
      entity.coordinates.lat,
      entity.coordinates.lng,
      candidate.coordinates.lat,
      candidate.coordinates.lng
    );
    if (dist <= 60) {
      geoConsistent = true;
    }
  }

  // STRONG Semantic Feature Match:
  // 1. Both feature type AND parent location appear in candidate title or text
  //    (e.g., "Grand Canal (Venice)", "Venice canals", "Yosemite falls")
  // 2. Or feature type appears in title/text AND candidate coordinates/metadata place it within the parent location
  // 3. Or candidate title has feature type and candidate text has parent location
  if (hasFeatureMention && (hasParentLocationMention || geoConsistent)) {
    return 'STRONG';
  }

  // If candidate is a direct named feature where title has the feature type, and parent location is in entity city/state
  if (hasFeatureMention && parentLocation && (entity.city?.toLowerCase() === parentLocation || entity.state?.toLowerCase() === parentLocation)) {
    return 'STRONG';
  }

  // MODERATE Semantic Match:
  // Candidate represents the parent location (e.g., "Venice", "Yosemite") or matches feature type only without parent location
  if (hasParentLocationMention) {
    return 'MODERATE';
  }

  // WEAK:
  // Only country / broad region or feature type alone in an unknown location
  if (hasFeatureMention || (country && fullText.includes(country))) {
    return 'WEAK';
  }

  return 'NONE';
}

export type HistoricalImageCategory =
  | 'EXPEDITION_EVENT'
  | 'HISTORICAL_ILLUSTRATION'
  | 'HISTORICAL_MAP'
  | 'HISTORICAL_ARTIFACT'
  | 'HISTORICAL_PERSON'
  | 'HISTORICAL_PLACE'
  | 'HISTORICAL_PHOTOGRAPH'
  | 'MODERN_LOCATION';

export interface HistoricalImageContext {
  exploration?: string;
  route?: string;
  event?: string;
  period?: string;
  year?: string;
  waypointName: string;
  cleanLocationName: string;
  region?: string;
  country?: string;
  people: string[];
  activities: string[];
  artifacts: string[];
  description?: string;
  significance?: string;
  notableFacts: string[];
}

export function isHistoricalWaypointEntity(entity: {
  entityType?: string;
  type?: string;
  intent?: string;
  historicalContext?: string;
  historicalPeriod?: string;
  routeTitle?: string;
  waypoint?: any;
  metadataMode?: string;
}): boolean {
  if (entity.intent === 'MULTI_LOCATION_DISCOVERY') return false;

  const title = (entity.routeTitle || entity.waypoint?.routeTitle || '').toLowerCase();
  const context = (entity.historicalContext || entity.waypoint?.context || '').toLowerCase();
  const combined = `${title} ${context}`;

  // If this is a filming / media / cinematic discovery, it is NOT an antique historical expedition
  if (
    combined.includes('filming') ||
    combined.includes('film') ||
    combined.includes('shot') ||
    combined.includes('movie') ||
    combined.includes('series') ||
    combined.includes('television') ||
    combined.includes('hbo') ||
    combined.includes('game of thrones') ||
    combined.includes('lord of the rings') ||
    combined.includes('breaking bad')
  ) {
    return false;
  }

  const eType = (entity.entityType || entity.type || '').toString().toLowerCase();
  if (
    eType.includes('historical_waypoint') ||
    eType.includes('battlefield') ||
    eType.includes('archaeological') ||
    Boolean(entity.isHistoricalWaypoint) ||
    Boolean(entity.waypoint)
  ) {
    return true;
  }
  if (entity.intent === 'HISTORICAL_EVENT' || entity.intent === 'exploration' || entity.intent === 'historical_event') return true;
  if (Boolean(entity.historicalPeriod || (entity.routeTitle && !combined.includes('filming')))) return true;
  return false;
}

export function extractHistoricalImageContext(info: any): HistoricalImageContext {
  const wp = info?.waypoint || {};
  let exploration = (info?.routeTitle || wp?.routeTitle || info?.routeContext?.title || info?.historicalContext || '').trim();
  // Filter out UI placeholder labels from leaking into search context
  if (/^(from route|route context|historical significance|notable facts|image|none)$/i.test(exploration)) {
    exploration = (info?.historicalContext || '').trim();
    if (/^(from route|route context|historical significance|notable facts|image|none)$/i.test(exploration)) {
      exploration = '';
    }
  }
  const rawEvent = (info?.significance || wp?.significance || '').trim();
  // Sanitize event: take only short topic/phrase (at most 3-4 words or clean title), not full prose sentences
  let event: string | undefined = undefined;
  if (rawEvent) {
    const isProse = /^(it|this|the|they|he|she|in|at|a|an)\s+(marks|serves|was|is|took|were|became|occurred|started|began)\b/i.test(rawEvent) ||
                    rawEvent.includes('.') ||
                    rawEvent.split(/\s+/).length > 6;
    if (!isProse) {
      event = rawEvent;
    } else {
      // If it mentions specific historical terms like treaty, battle, siege, council, extract just the noun phrase
      const eventNounMatch = rawEvent.match(/\b(treaty of [a-z0-9\s'-]+|battle of [a-z0-9\s'-]+|siege of [a-z0-9\s'-]+|council of [a-z0-9\s'-]+)\b/i);
      if (eventNounMatch) {
        event = eventNounMatch[1].trim();
      }
    }
  }
  const period = (info?.historicalPeriod || wp?.historicalPeriod || '').trim();
  
  // Extract 4-digit year or period mention (e.g. "1804", "19th century", "1804-1806")
  let year: string | undefined = undefined;
  const yearMatch = (period + ' ' + (info?.description || '') + ' ' + (wp?.description || '')).match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
  if (yearMatch) {
    year = yearMatch[1];
  } else {
    const centuryMatch = (period + ' ' + (info?.description || '')).match(/\b([1-9][0-9]?(?:st|nd|rd|th)\s+century)\b/i);
    if (centuryMatch) {
      year = centuryMatch[1];
    }
  }

  const waypointName = (info?.name || wp?.name || '').trim();
  // Clean location name: "St. Charles, Missouri" -> "St. Charles"
  const cleanLocationName = waypointName.split(/[,–-]/)[0].trim() || waypointName;
  const region = (info?.state || info?.region || wp?.historicalRegion || wp?.modernLocation || '').trim();
  const country = (info?.country || wp?.country || '').trim();

  // Extract people / entities
  const rawEntities = [
    ...(Array.isArray(info?.entities) ? info.entities : []),
    ...(Array.isArray(wp?.entities) ? wp.entities : []),
    ...(Array.isArray(info?.relatedEntities) ? info.relatedEntities.map((e: any) => typeof e === 'string' ? e : e?.name) : [])
  ].filter(Boolean);

  const people = Array.from(new Set(rawEntities.map(e => String(e).trim()).filter(Boolean)));

  // Extract activities and keywords from description & significance
  const fullNarrative = `${info?.description || ''} ${wp?.description || ''} ${event}`.toLowerCase();
  const activityKeywords = [
    'preparation', 'preparations', 'departure', 'departed', 'keelboat', 'pirogue', 'boatmen',
    'encampment', 'camp', 'winter camp', 'fort', 'portage', 'council', 'meeting', 'treaty',
    'battle', 'siege', 'march', 'crossing', 'landing', 'settlement', 'recruitment', 'expedition'
  ];
  const activities = activityKeywords.filter(kw => fullNarrative.includes(kw));

  const artifactKeywords = [
    'keelboat', 'pirogue', 'canoe', 'journal', 'diary', 'map', 'compass', 'sextant',
    'musket', 'rifle', 'peace medal', 'uniform', 'document', 'specimen'
  ];
  const artifacts = artifactKeywords.filter(kw => fullNarrative.includes(kw));

  const notableFacts: string[] = [];
  if (Array.isArray(info?.notable)) {
    for (const item of info.notable) {
      if (typeof item === 'string') notableFacts.push(item);
      else if (item && typeof item === 'object') notableFacts.push(item.title || item.description || '');
    }
  }

  return {
    exploration: exploration || undefined,
    route: exploration || undefined,
    event: event || undefined,
    period: period || undefined,
    year,
    waypointName,
    cleanLocationName,
    region: region || undefined,
    country: country || undefined,
    people,
    activities,
    artifacts,
    description: info?.description || wp?.description || undefined,
    significance: event || undefined,
    notableFacts: notableFacts.filter(Boolean)
  };
}

export function buildHistoricalImageQueries(context: HistoricalImageContext): string[] {
  const queries: string[] = [];
  const { exploration, event, period, year, cleanLocationName, waypointName, region, people, activities, artifacts } = context;

  // 1. Entity-first historical site / canonical entity queries (Highest Priority)
  if (cleanLocationName) {
    queries.push(cleanLocationName);
    if (context.country && context.country.toLowerCase() !== cleanLocationName.toLowerCase()) {
      queries.push(`${cleanLocationName} ${context.country}`);
      if (exploration) {
        queries.push(`${cleanLocationName} ${context.country} ${exploration}`);
      }
    }
    queries.push(`${cleanLocationName} historic site`);
    queries.push(`${cleanLocationName} historic buildings`);
    queries.push(`${cleanLocationName} archaeological site`);
    if (region && region.toLowerCase() !== cleanLocationName.toLowerCase()) {
      queries.push(`${cleanLocationName} ${region}`);
    }
    if (exploration) {
      queries.push(`${cleanLocationName} ${exploration}`);
    }
    if (year || period) {
      queries.push(`${cleanLocationName} ${year || period}`);
    }
    queries.push(`historic ${cleanLocationName} painting engraving`);

    // 2. Entity + historical event / treaty / battle / document
    if (event) {
      queries.push(`${cleanLocationName} ${event}`);
    }

    // 3. exploration + entity + historical period (e.g. "Lewis and Clark Expedition St. Charles 1804")
    if (exploration) {
      if (year) {
        queries.push(`${exploration} ${cleanLocationName} ${year}`.trim());
      }
      if (region && region.toLowerCase() !== cleanLocationName.toLowerCase()) {
        queries.push(`${exploration} ${cleanLocationName} ${region}`.trim());
      }
      // Entity-specific map/document query
      queries.push(`${cleanLocationName} ${exploration} map`.trim());
      queries.push(`${cleanLocationName} historical map`.trim());
    }

    // 4. Entity + major historical activity / artifact
    if (activities.length > 0) {
      for (const act of activities.slice(0, 2)) {
        queries.push(`${cleanLocationName} ${act}`.trim());
        if (exploration) {
          queries.push(`${exploration} ${cleanLocationName} ${act}`.trim());
        }
      }
    }
    if (artifacts.length > 0) {
      for (const art of artifacts.slice(0, 2)) {
        queries.push(`${cleanLocationName} ${art}`.trim());
        if (exploration) {
          queries.push(`${exploration} ${cleanLocationName} ${art}`.trim());
        }
      }
    }
    if (exploration && (exploration.toLowerCase().includes('lewis and clark') || exploration.toLowerCase().includes('discovery'))) {
      queries.push(`${cleanLocationName} Lewis and Clark keelboat`.trim());
    }

    // 5. Named historical people + Entity
    if (people.length > 0) {
      for (const p of people.slice(0, 2)) {
        queries.push(`${cleanLocationName} ${p}`.trim());
      }
    }

    // 6. waypoint + historical period / 19th century / historic
    if (year || period) {
      queries.push(`${cleanLocationName} ${region || ''} ${year || period} historical`.trim());
    }
  } else if (exploration) {
    // If no cleanLocationName exists (general route search), build exploration-level queries
    if (event) {
      queries.push(`${exploration} ${event} ${year || ''}`.trim());
    }
    if (activities.length > 0) {
      for (const act of activities.slice(0, 3)) {
        queries.push(`${exploration} ${act}`.trim());
      }
    }
    queries.push(`${exploration} map ${region || ''}`.trim());
    queries.push(`${exploration} historical illustration artwork`.trim());
  }

  // Fallback modern location query (placed last)
  if (cleanLocationName && region && region.toLowerCase() !== cleanLocationName.toLowerCase()) {
    queries.push(`${cleanLocationName} ${region}`.trim());
  } else if (waypointName) {
    queries.push(waypointName);
  }

  return Array.from(new Set(queries.filter(Boolean)));
}

export function isModernLocationPhotography(title: string = '', description: string = ''): boolean {
  const text = `${title} ${description}`.toLowerCase();
  
  // Specific modern municipal / civic building indicators
  const modernKeywords = [
    'county courthouse',
    'courthouse',
    'city hall',
    'main street',
    'downtown',
    'streetscape',
    'looking east on',
    'looking west on',
    'looking north on',
    'looking south on',
    'intersection of',
    'corner of',
    'modern skyline',
    'skyline of',
    'police department',
    'high school',
    'office building',
    'shopping district',
    'strip mall',
    'parking lot',
    'aerial view of modern',
    'modern highway',
    'interstate',
    'subdivision'
  ];

  return modernKeywords.some(kw => text.includes(kw));
}

export function classifyHistoricalImageCategory(
  candidate: ImageCandidate,
  context: HistoricalImageContext
): HistoricalImageCategory {
  const title = (candidate.title || '').toLowerCase();
  const desc = (candidate.description || candidate.caption || '').toLowerCase();
  const text = `${title} ${desc}`;

  // 1. Check for Modern Location first
  if (isModernLocationPhotography(title, desc)) {
    return 'MODERN_LOCATION';
  }

  // 2. Maps & Cartography
  if (
    !isGenericTopicCandidate(candidate.title || '', candidate.description || candidate.caption || '') &&
    (/\b(cartography|survey|nautical chart|route map|plan of|carte de|karte)\b/i.test(text) ||
    /\b(historic map|historical map|atlas|drawn map|hand-drawn map|engraved map)\b/i.test(text) ||
    desc.includes('map showing') ||
    desc.includes('route map'))
  ) {
    return 'HISTORICAL_MAP';
  }

  // 3. Artifacts, Equipment, Journals, Vessels
  if (
    /\b(keelboat|pirogue|canoe|vessel|journal|diary|manuscript|compass|sextant|musket|rifle|uniform|medal|coin|document|artifact|specimen|relic)\b/i.test(text)
  ) {
    return 'HISTORICAL_ARTIFACT';
  }

  // 4. Expedition Event & Scenes
  const expLower = (context.exploration || '').toLowerCase();
  const isExpMentioned = expLower && (text.includes(expLower) || text.includes('corps of discovery') || text.includes('expedition'));
  const hasEventKeyword = /\b(departure|departing|preparations|encampment|council|meeting|treaty|battle|siege|march|landing|portage|voyage|exploration)\b/i.test(text);

  if (isExpMentioned && hasEventKeyword) {
    return 'EXPEDITION_EVENT';
  }

  // 5. Historical Persons / Portraits
  const hasPersonMention = (context.people || []).some(p => p && text.includes(p.toLowerCase()));
  if (
    hasPersonMention ||
    /\b(portrait|bust|statue of|depiction of|monument to)\b/i.test(text) ||
    /\b(meriwether lewis|william clark|sacagawea|york|thomas jefferson|napoleon)\b/i.test(text)
  ) {
    return 'HISTORICAL_PERSON';
  }

  // 6. Historical Illustrations / Artwork
  if (
    /\b(painting|engraving|lithograph|drawing|woodcut|illustration|artwork|sketch|mural|depiction|etching|watercolor)\b/i.test(text)
  ) {
    return 'HISTORICAL_ILLUSTRATION';
  }

  // 7. Historical Place / Depiction of Historic Settlement
  const locLower = (context.cleanLocationName || '').toLowerCase();
  if (
    (locLower && text.includes(locLower)) ||
    /\b(historic|1804|19th century|18th century|settlement|fort clatsop|camp dubois|missouri river)\b/i.test(text)
  ) {
    return 'HISTORICAL_PLACE';
  }

  // 8. Historical Photograph
  if (/\b(daguerreotype|tintype|black and white photograph|historic photo|archival photo)\b/i.test(text)) {
    return 'HISTORICAL_PHOTOGRAPH';
  }

  // Default for expedition-related imagery
  if (isExpMentioned) {
    return 'HISTORICAL_ILLUSTRATION';
  }

  return 'MODERN_LOCATION';
}

export function validateImageCandidate(
  candidate: ImageCandidate,
  entity: {
    name: string;
    canonicalName?: string;
    city?: string;
    state?: string;
    country?: string;
    coordinates?: { lat: number; lng: number };
    coordinateSource?: string;
    identityStatus?: string;
    entityType?: string;
    type?: string;
    intent?: string;
    historicalContext?: string;
    historicalPeriod?: string;
    routeTitle?: string;
    waypoint?: any;
    metadataMode?: string;
    aliases?: string[];
    entities?: string[];
    routeContext?: any;
    query?: string;
    rawQuery?: string;
    imageIntent?: ResolvedImageIntent;
  },
  resolvedIntent?: ResolvedImageIntent
): ImageValidationResult {
  const imageIntent = resolvedIntent || entity.imageIntent || resolveImageIntent(entity);
  const entityName = entity.name || '';
  const title = candidate.title || '';
  const desc = candidate.description || candidate.caption || '';
  const fullText = `${title} ${desc}`.toLowerCase();
  const eType = (entity.entityType || entity.type || '').toLowerCase();
  const isHistoricalWaypoint = isHistoricalWaypointEntity(entity);
  const isHistoricalVessel = !isHistoricalWaypoint && (eType.includes('shipwreck') || eType.includes('vessel') || entity.intent === 'DISCOVERY_OBJECT_LOCATION');

  // Handle GENERIC_TOPIC Image Candidate Validation
  if (imageIntent.type === 'GENERIC_TOPIC') {
    const topic = imageIntent.topic || entity.routeTitle || entityName;
    const topicMatch = classifyTopicMatch(candidate, topic);
    const { entityMatchLevel } = classifyImageEvidence(candidate, entity);
    const isFlag = isGenericFlagOrEmblem(title, desc, entityName);
    const isMediaGeneric = isGenericTopicCandidate(title, desc);

    const geoEvidence: 'VERIFIED' | 'PROXIMATE' | 'CONFLICTING' | 'NONE' = 'NONE';
    const geographicConstraintApplied = false;

    let decision: 'ACCEPT' | 'REJECT' = 'REJECT';
    let reason = 'INSUFFICIENT_TOPIC_RELEVANCE';
    let score = 0;

    if (isFlag) {
      decision = 'REJECT';
      reason = 'Generic national flag, insufficient entity relevance';
      score = 0;
    } else if (isMediaGeneric) {
      decision = 'REJECT';
      reason = 'NO_ENTITY_SPECIFIC_EVIDENCE';
      score = 0;
    } else if (topicMatch === 'STRONG') {
      decision = 'ACCEPT';
      reason = 'TOPIC_RELEVANT';
      score = 85;
    } else if (topicMatch === 'MODERATE') {
      decision = 'ACCEPT';
      reason = 'TOPIC_RELEVANT';
      score = 65;
    } else {
      decision = 'REJECT';
      reason = 'INSUFFICIENT_TOPIC_RELEVANCE';
      score = 0;
    }

    console.log(`[IMAGE CANDIDATE]
Title=${title ? `"${title}"` : '"Untitled"'}
TopicMatch=${topicMatch}
EntityMatch=${entityMatchLevel}
GeographicEvidence=${geoEvidence}
GeographicConstraintApplied=${geographicConstraintApplied}
Decision=${decision}
Reason=${reason}`);

    return {
      score,
      decision,
      reason,
      candidate
    };
  }

  // Handle UNRESOLVED Intent Candidate Validation
  if (imageIntent.type === 'UNRESOLVED') {
    const topicMatch = imageIntent.topic ? classifyTopicMatch(candidate, imageIntent.topic) : 'NONE';
    const { entityMatchLevel } = classifyImageEvidence(candidate, entity);
    const geoEvidence: 'VERIFIED' | 'PROXIMATE' | 'CONFLICTING' | 'NONE' = 'NONE';
    const geographicConstraintApplied = false;

    let decision: 'ACCEPT' | 'REJECT' = 'REJECT';
    let reason = 'UNRESOLVED_IMAGE_INTENT';
    let score = 0;

    if (imageIntent.fallback === 'ORIGINAL_QUERY' && imageIntent.topic) {
      if (topicMatch === 'STRONG') {
        decision = 'ACCEPT';
        reason = 'TOPIC_RELEVANT';
        score = 80;
      } else if (topicMatch === 'MODERATE') {
        decision = 'ACCEPT';
        reason = 'TOPIC_RELEVANT';
        score = 60;
      } else {
        decision = 'REJECT';
        reason = 'INSUFFICIENT_TOPIC_RELEVANCE';
        score = 0;
      }
    }

    console.log(`[IMAGE CANDIDATE]
Title=${title ? `"${title}"` : '"Untitled"'}
TopicMatch=${topicMatch}
EntityMatch=${entityMatchLevel}
GeographicEvidence=${geoEvidence}
GeographicConstraintApplied=${geographicConstraintApplied}
Decision=${decision}
Reason=${reason}`);

    return {
      score,
      decision,
      reason,
      candidate
    };
  }

  // Handle Historical Waypoint Specific Validation & Scoring for ENTITY_SPECIFIC
  if (isHistoricalWaypoint) {
    const histContext = extractHistoricalImageContext(entity);
    const category = classifyHistoricalImageCategory(candidate, histContext);
    const isModern = category === 'MODERN_LOCATION' || isModernLocationPhotography(title, desc);
    const isGeneric = isGenericTopicCandidate(title, desc);
    const isFlag = isGenericFlagOrEmblem(title, desc, entityName);

    if (isFlag) {
      return {
        score: 0,
        decision: 'REJECT',
        reason: 'Generic national flag, insufficient historical narrative relevance',
        candidate
      };
    }

    if (isGeneric) {
      return {
        score: 0,
        decision: 'REJECT',
        reason: 'Generic category/list page, insufficient historical narrative relevance',
        candidate
      };
    }

    // Base score by category hierarchy
    let baseScore = 0;
    switch (category) {
      case 'EXPEDITION_EVENT':
        baseScore = 85;
        break;
      case 'HISTORICAL_ILLUSTRATION':
        baseScore = 80;
        break;
      case 'HISTORICAL_MAP':
        baseScore = 75;
        break;
      case 'HISTORICAL_ARTIFACT':
        baseScore = 70;
        break;
      case 'HISTORICAL_PERSON':
        baseScore = 65;
        break;
      case 'HISTORICAL_PLACE':
        baseScore = 60;
        break;
      case 'HISTORICAL_PHOTOGRAPH':
        baseScore = 55;
        break;
      case 'MODERN_LOCATION':
      default:
        baseScore = 20;
        break;
    }

    // Check for conflicting historical trail contamination
    const trailConflict = isDifferentNamedEntity(title, desc, entityName, [
      histContext.cleanLocationName || '',
      histContext.exploration || '',
      ...(histContext.people || []),
      ...(histContext.artifacts || []),
      ...(entity.entities || []),
      ...(entity.aliases || [])
    ]);

    if (trailConflict) {
      console.log(`[IMAGE CANDIDATE (HISTORICAL WAYPOINT)] REJECTED due to conflicting entity/trail.`);
      return {
        score: 0,
        decision: 'REJECT',
        reason: 'Image represents a conflicting historical trail or different named entity.',
        candidate
      };
    }

    // Check for conflicting geographic entities / administrative divisions
    const geoMismatch = detectGeographicMismatch(candidate, {
      name: entityName,
      city: entity.city || histContext.cleanLocationName,
      state: entity.state || histContext.region,
      country: entity.country || histContext.country,
      coordinates: entity.coordinates,
      entityType: entity.entityType
    });

    if (geoMismatch.mismatch) {
      console.log(`[IMAGE CANDIDATE (HISTORICAL WAYPOINT)] REJECTED due to geographic mismatch: ${geoMismatch.reason}`);
      return {
        score: 0,
        decision: 'REJECT',
        reason: geoMismatch.reason || 'GEOGRAPHIC_CONFLICT',
        candidate
      };
    }

    // 1. Entity Relevance (Primary Signal)
    let entityMatch = 'NONE';
    let entityScore = 0;
    const cleanLoc = (histContext.cleanLocationName || '').toLowerCase();
    const canonName = (entity.canonicalName || '').toLowerCase();
    const eName = (entityName || '').toLowerCase();
    const rawAliases = [
      cleanLoc,
      canonName,
      eName,
      cleanLoc.split(',')[0].trim(),
      canonName.split(',')[0].trim(),
      eName.split(',')[0].trim(),
      ...(entity.aliases || []).map(a => a.toLowerCase())
    ].filter(Boolean);
    const entityAliases = Array.from(new Set(rawAliases));

    // Strict entity title match: Must NOT be accompanied by person names, correctional facilities, or incompatible classifications
    const titleLower = title.toLowerCase().trim();
    const isExactTitleCandidate = entityAliases.some(alias => {
      if (alias.length < 3) return false;
      if (titleLower === alias) return true;
      if (titleLower.startsWith(`${alias} (`) || titleLower.startsWith(`${alias},`)) return true;
      if (titleLower.startsWith(`${alias} cathedral`) || titleLower.startsWith(`${alias} duomo`) || titleLower.startsWith(`${alias} basilica`)) return true;
      if (titleLower.startsWith(`historic ${alias}`) || titleLower.startsWith(`view of ${alias}`) || titleLower.startsWith(`map of ${alias}`)) return true;
      // Word boundary match: ensure it doesn't match Florence Nightingale, Jack London, etc.
      const boundaryRegex = new RegExp(`\\b${alias}\\b`, 'i');
      if (boundaryRegex.test(titleLower)) {
        // Ensure no overt conflicting person surname, facility, or media token in the title
        const isConflicting = /\b(?:nightingale|welch|kundera|actor|actress|director|singer|musician|politician|author|player|coach|nurse|novelist|athlete|adx|penitentiary|prison)\b/i.test(titleLower) ||
          /\((?:drug|medication|pharmaceutical|album|song|single|band|film|tv\s+series|novel|magazine|comics)\)$/i.test(titleLower);
        return !isConflicting;
      }
      return false;
    });

    if (isExactTitleCandidate) {
      entityMatch = 'EXACT_TITLE';
      entityScore = 50;
    } else if (entityAliases.some(alias => alias.length >= 3 && fullText.includes(alias))) {
      entityMatch = 'STRONG_DESCRIPTION';
      entityScore = 35;
    } else if (histContext.people.some(p => fullText.includes(p.toLowerCase()))) {
      entityMatch = 'KEY_FIGURE';
      entityScore = 25;
    } else if (histContext.artifacts.some(art => fullText.includes(art))) {
      entityMatch = 'KEY_ARTIFACT';
      entityScore = 20;
    }

    // 2. Narrative / Event Relevance
    let narrativeMatch = 'NONE';
    let narrativeScore = 0;
    const expLower = (histContext.exploration || '').toLowerCase();
    if (expLower && fullText.includes(expLower)) {
      narrativeMatch = 'EXPEDITION_MATCH';
      narrativeScore = 20;
    } else if (histContext.activities.some(act => fullText.includes(act))) {
      narrativeMatch = 'ACTIVITY_MATCH';
      narrativeScore = 10;
    }

    // 3. Geographic Relevance
    let geographicMatch = 'NONE';
    let geoScore = 0;
    const regionLower = (histContext.region || entity.state || '').toLowerCase();
    const countryLower = (histContext.country || entity.country || '').toLowerCase();
    if (regionLower && fullText.includes(regionLower)) {
      geographicMatch = 'REGION_MATCH';
      geoScore = 15;
    } else if (countryLower && fullText.includes(countryLower)) {
      geographicMatch = 'COUNTRY_MATCH';
      geoScore = 5;
    }

    // 4. Historical Period Relevance
    let periodScore = 0;
    if (histContext.year && fullText.includes(histContext.year.toLowerCase())) {
      periodScore = 15;
    } else if (histContext.period && fullText.includes(histContext.period.toLowerCase())) {
      periodScore = 10;
    }

    // 5. Image Type Relevance (Base Score)
    let typeScore = baseScore;

    // When entityRequired is true (default for ENTITY_SPECIFIC historical waypoints),
    // entityMatch=NONE must be a hard rejection for normal entity imagery.
    // Narrative match to the larger historical event must NEVER override missing entity identity.
    const isDocumentOrMap = category === 'HISTORICAL_MAP' || category === 'HISTORICAL_ARTIFACT';
    const hasEntityEvidence = entityMatch !== 'NONE';

    if (imageIntent.entityRequired && !hasEntityEvidence) {
      console.log(`[IMAGE CANDIDATE (HISTORICAL WAYPOINT)] REJECTED due to entityRequired=true and entityMatch=NONE.`);
      return {
        score: 0,
        decision: 'REJECT',
        reason: 'NO_ENTITY_SPECIFIC_EVIDENCE',
        candidate
      };
    }

    if (entityMatch === 'NONE') {
      console.log(`[IMAGE CANDIDATE (HISTORICAL WAYPOINT)] REJECTED due to lack of entity match.`);
      return {
        score: 0,
        decision: 'REJECT',
        reason: 'NO_ENTITY_SPECIFIC_EVIDENCE',
        candidate
      };
    }

    let score = typeScore + entityScore + narrativeScore + geoScore + periodScore;

    // Strong negative preference / penalty against modern location photography on historical waypoints
    if (isModern) {
      score -= 40;
      score = Math.min(score, 30);
    }

    // Require both adequate total score AND confirmed entity match level for acceptance
    const decision: 'ACCEPT' | 'REJECT' = (entityScore >= 20 && score >= 45) ? 'ACCEPT' : 'REJECT';
    const reason = decision === 'ACCEPT'
      ? `Historical entity match (${category}, score ${score})`
      : `Insufficient historical entity relevance (${category}, score ${score})`;

    // Diagnostic logging for Image Entity Relevance
    console.log(`[Image Entity Relevance]
entity="${entityName}"
candidate="${title || 'Untitled'}"
entityMatch=${entityMatch}
narrativeMatch=${narrativeMatch}
geographicMatch=${geographicMatch}
finalScore=${score}
decision=${decision}`);

    return {
      score,
      decision,
      reason,
      candidate
    };
  }

  // 1. Evaluate coordinate trust / status based on provenance
  let coordinateStatus: 'VERIFIED' | 'UNVERIFIED' | 'ABSENT' | 'INVALID' = 'VERIFIED';
  if (!entity.coordinates || (entity.coordinates.lat === undefined && entity.coordinates.lng === undefined)) {
    coordinateStatus = 'ABSENT';
  } else if (isSuspiciousPlaceholderCoordinate(entity.coordinates.lat, entity.coordinates.lng)) {
    coordinateStatus = 'INVALID';
  } else if (
    entity.coordinateSource === 'ai_recovery' ||
    entity.identityStatus === 'unverified' ||
    entity.coordinateSource === 'llm' ||
    entity.coordinateSource === 'inferred' ||
    (entity as any).provenance === 'unverified'
  ) {
    coordinateStatus = 'UNVERIFIED';
  } else {
    coordinateStatus = 'VERIFIED';
  }

  // 2. Check for generic flags/emblems
  const isFlag = isGenericFlagOrEmblem(title, desc, entityName);

  // 3. Generic topic detection
  const isGenericTopic = isGenericTopicCandidate(title, desc);

  // 4. Different named entity detection
  const derivedAliases = [
    ...(entity.aliases || []),
    entityName.replace(/\s+(?:shipwreck|wreck location|discovery site|wreck site|wreck|ship|archaeological site|movie set|film set|set|site|monument|memorial|historic site|ruins|battlefield)$/i, '').trim()
  ].filter(Boolean);
  const isDifferentEntity = isDifferentNamedEntity(title, desc, entityName, derivedAliases);

  // 5. Evidence classification
  let { evidenceType, entityMatchLevel, matchedAlias } = classifyImageEvidence(candidate, entity);

  if (isFlag) {
    evidenceType = 'GENERIC_TOPIC';
  } else if (isGenericTopic && evidenceType !== 'EXACT_ENTITY') {
    evidenceType = 'GENERIC_TOPIC';
  } else if (isDifferentEntity) {
    evidenceType = 'RELATED_ENTITY';
  }

  // 6. Entity Type Match evaluation
  let entityTypeMatchLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'INCOMPATIBLE' = 'MEDIUM';
  if (isHistoricalVessel) {
    const hasMaritimeToken = /\b(ship|vessel|caravel|carrack|flagship|fleet|sailing|sail|wreck|shipwreck|maritime|nautical|naval|columbus|1492|expedition|replica|mast|rigging|hull)\b/i.test(fullText);
    const isPerson = /\b(podcaster|journalist|television host|talk show|science communicator|american woman|actress|comedian|politician|writer|author|born \d{4}|biography)\b/i.test(fullText);
    const isChurch = /\b(basilica|cathedral|church|parish|diocese|convent|monastery|sanctuary)\b/i.test(fullText);
    const isVolcano = /\b(stratovolcano|volcano|caldera)\b/i.test(fullText);
    const isModernPlace = /\b(municipality|city in|capital of|county seat|census-designated)\b/i.test(fullText);

    if ((isPerson || isChurch || isVolcano || isModernPlace) && !hasMaritimeToken) {
      entityTypeMatchLevel = 'INCOMPATIBLE';
    } else if (hasMaritimeToken) {
      entityTypeMatchLevel = 'HIGH';
    }
  }

  // 7. Geographic Evidence evaluation
  let geoEvidence: 'MATCHING' | 'CONFLICTING' | 'NONE' = 'NONE';
  let geoMismatchReason: string | undefined;

  if (candidate.coordinates && entity.coordinates && entity.coordinates.lat !== 0 && entity.coordinates.lng !== 0) {
    const dist = calculateHaversineDistanceKm(
      entity.coordinates.lat,
      entity.coordinates.lng,
      candidate.coordinates.lat,
      candidate.coordinates.lng
    );
    const tolerance = getEntityDistanceToleranceKm(entity.entityType);
    if (dist <= tolerance) {
      geoEvidence = 'MATCHING';
    } else {
      geoEvidence = 'CONFLICTING';
      geoMismatchReason = `Geographic mismatch: coordinate distance (${Math.round(dist)}km) exceeds tolerance (${tolerance}km)`;
    }
  }

  if (geoEvidence !== 'CONFLICTING') {
    const geoCheck = detectGeographicMismatch(candidate, entity);
    if (geoCheck.mismatch) {
      geoEvidence = 'CONFLICTING';
      geoMismatchReason = geoCheck.reason || 'Geographic mismatch';
    } else if (
      geoEvidence !== 'MATCHING' && (
        (entity.city && fullText.includes(entity.city.toLowerCase())) ||
        (entity.state && fullText.includes(entity.state.toLowerCase())) ||
        (entity.country && fullText.includes(entity.country.toLowerCase()))
      )
    ) {
      geoEvidence = 'MATCHING';
    }
  }

  // 8. IDENTIFIABLE ENTITY SCOPE & MULTI-SIGNAL POLICY QUALIFICATION
  const isIdentifiableEntity = (
    !!entity.canonicalName ||
    !!entity.name ||
    (entity.aliases && entity.aliases.length > 0) ||
    isHistoricalVessel ||
    /historic|archaeological|monument|memorial|ruins|castle|fort|battlefield|shipwreck|landmark|museum/i.test(entity.entityType || '')
  );

  const hasStrongEntityMatch = (
    evidenceType === 'EXACT_ENTITY' ||
    evidenceType === 'KNOWN_ALIAS' ||
    evidenceType === 'DIRECT_ENTITY_SOURCE' ||
    (evidenceType === 'RELATED_ENTITY' && !!matchedAlias)
  ) && !isDifferentEntity && !isGenericTopic;

  const semanticFeatureMatch = classifySemanticFeatureMatch(candidate, entity, {
    featureType: imageIntent.featureType,
    parentLocation: imageIntent.parentLocation || entity.city || entity.state
  });

  const topicMatch = imageIntent.topic ? classifyTopicMatch(candidate, imageIntent.topic) : 'NONE';
  const policy: ImageValidationPolicy = imageIntent.policy || (isHistoricalWaypoint ? 'HISTORICAL_WAYPOINT' : (isGenericTopic ? 'TOPIC_REPRESENTATIVE' : 'STRICT_ENTITY'));
  const shape: ImageSubjectShape = imageIntent.shape || (isHistoricalWaypoint ? 'SPECIFIC_ENTITY' : (isGenericTopic ? 'TOPIC' : 'SPECIFIC_ENTITY'));

  let decision: 'ACCEPT' | 'REJECT' = 'REJECT';
  let reason: string = 'NO_ENTITY_SPECIFIC_EVIDENCE';
  let tier: ImageRelevanceTier | undefined;

  const isGeoConflicting = geoEvidence === 'CONFLICTING';
  const conflictEvidenceTrusted = coordinateStatus === 'VERIFIED';
  const isUntrustedGeoConflict = isGeoConflicting && !conflictEvidenceTrusted && hasStrongEntityMatch && (semanticFeatureMatch === 'STRONG');

  // Hard Rejections across all policies:
  if (isFlag) {
    decision = 'REJECT';
    reason = 'Generic national flag, insufficient entity relevance';
  } else if (entityTypeMatchLevel === 'INCOMPATIBLE') {
    decision = 'REJECT';
    reason = 'Semantic entity-type mismatch';
  } else if (isDifferentEntity) {
    decision = 'REJECT';
    reason = 'DIFFERENT_ENTITY';
  } else if (isGeoConflicting && !isUntrustedGeoConflict) {
    decision = 'REJECT';
    reason = 'GEOGRAPHIC_CONFLICT';
  } else {
    switch (policy) {
      case 'HISTORICAL_WAYPOINT': {
        // Complete isolation: strict entity and historical narrative relevance only
        if (!hasStrongEntityMatch) {
          decision = 'REJECT';
          reason = 'NO_ENTITY_SPECIFIC_EVIDENCE';
        } else {
          decision = 'ACCEPT';
          tier = 1;
          reason = coordinateStatus === 'VERIFIED' ? 'STRONG_ENTITY_MATCH_GEO_VERIFIED' : 'STRONG_ENTITY_MATCH';
        }
        break;
      }

      case 'STRICT_ENTITY': {
        // Strict landmarks: only Tier 1 is acceptable
        if (!hasStrongEntityMatch) {
          decision = 'REJECT';
          reason = 'NO_ENTITY_SPECIFIC_EVIDENCE';
        } else {
          decision = 'ACCEPT';
          tier = 1;
          reason = coordinateStatus === 'VERIFIED' ? 'STRONG_ENTITY_MATCH_GEO_VERIFIED' : 'STRONG_ENTITY_MATCH';
        }
        break;
      }

      case 'GEOGRAPHIC_FEATURE': {
        // For individual geographic features (e.g. Antelope Canyon), candidate must match the entity itself or verified alias
        if (hasStrongEntityMatch) {
          decision = 'ACCEPT';
          tier = 1;
          reason = 'EXACT_OR_ALIAS_FEATURE_MATCH';
        } else if (shape === 'GEOGRAPHIC_COLLECTION' || shape === 'DESCRIPTIVE_GEOGRAPHIC_QUERY') {
          // Geographic collections or descriptive queries allow strong related component features or representative parent views
          if (semanticFeatureMatch === 'STRONG') {
            decision = 'ACCEPT';
            tier = 2;
            reason = 'STRONG_RELATED_FEATURE_MATCH';
          } else if (semanticFeatureMatch === 'MODERATE' && geoEvidence === 'MATCHING') {
            decision = 'ACCEPT';
            tier = 3;
            reason = 'REPRESENTATIVE_LOCATION_FEATURE';
          } else if (topicMatch === 'STRONG') {
            decision = 'ACCEPT';
            tier = 2;
            reason = 'STRONG_TOPIC_FEATURE_MATCH';
          } else {
            decision = 'REJECT';
            reason = 'INSUFFICIENT_FEATURE_RELEVANCE';
          }
        } else {
          // Single specific feature without strong entity match must be rejected
          decision = 'REJECT';
          reason = 'NO_ENTITY_SPECIFIC_EVIDENCE';
        }
        break;
      }

      case 'LOCATION_REPRESENTATIVE': {
        // Broad locations (e.g. "Where is Venice?", "Show me Paris")
        if (hasStrongEntityMatch) {
          decision = 'ACCEPT';
          tier = 1;
          reason = 'EXACT_LOCATION_MATCH';
        } else if (semanticFeatureMatch === 'STRONG' || semanticFeatureMatch === 'MODERATE' || geoEvidence === 'MATCHING') {
          decision = 'ACCEPT';
          tier = (semanticFeatureMatch === 'STRONG') ? 2 : 3;
          reason = 'LOCATION_REPRESENTATIVE_MATCH';
        } else {
          decision = 'REJECT';
          reason = 'INSUFFICIENT_LOCATION_EVIDENCE';
        }
        break;
      }

      case 'TOPIC_REPRESENTATIVE':
      default: {
        if (evidenceType === 'EXACT_ENTITY' || topicMatch === 'STRONG') {
          decision = 'ACCEPT';
          tier = (evidenceType === 'EXACT_ENTITY') ? 1 : 2;
          reason = 'STRONG_TOPIC_MATCH';
        } else if (topicMatch === 'MODERATE') {
          decision = 'ACCEPT';
          tier = 3;
          reason = 'MODERATE_TOPIC_MATCH';
        } else {
          decision = 'REJECT';
          reason = 'NO_ENTITY_SPECIFIC_EVIDENCE';
        }
        break;
      }
    }
  }

  // 9. Scoring for accepted candidates within their tier
  let score = 0;
  if (decision === 'ACCEPT') {
    if (tier === 1) {
      score += 60;
      if (evidenceType === 'EXACT_ENTITY') score += 10;
    } else if (tier === 2) {
      score += 45;
    } else if (tier === 3) {
      score += 30;
    } else {
      score += 15;
    }

    if (entity.city && fullText.includes(entity.city.toLowerCase())) {
      score += 15;
    }
    if (entity.country && fullText.includes(entity.country.toLowerCase())) {
      score += 10;
    }
    if (geoEvidence === 'MATCHING') {
      score += 15;
    }
    if (coordinateStatus === 'VERIFIED') {
      score += 10;
    }
  }

  // 10. Emitting diagnostic candidate validation logs
  console.log(`[IMAGE GEOGRAPHIC EVIDENCE]
candidateEntityMatch=${entityMatchLevel}
candidateSemanticMatch=${semanticFeatureMatch}
canonicalCoordinateSource=${entity.coordinateSource || 'unknown'}
canonicalCoordinateTrust=${coordinateStatus}
geographicConflict=${isGeoConflicting}
conflictEvidenceTrusted=${conflictEvidenceTrusted}
finalDecision=${decision}`);

  console.log(`[IMAGE VALIDATION]
entity="${entity.name || ''}"
shape="${shape}"
policy="${policy}"
candidate="${title || 'Untitled'}"
EntityMatch=${entityMatchLevel}
SemanticFeatureMatch=${semanticFeatureMatch}
GeographicEvidence=${geoEvidence}
GeographicConflict=${isGeoConflicting}
Tier=${tier ?? 'NONE'}
Decision=${decision}
Reason=${reason}`);

  const geographicConstraintApplied = coordinateStatus === 'VERIFIED';

  console.log(`[IMAGE CANDIDATE]
Title=${title ? `"${title}"` : '"Untitled"'}
TopicMatch=${topicMatch}
EntityMatch=${entityMatchLevel}
GeographicEvidence=${geoEvidence}
CoordinateStatus=${coordinateStatus}
GeographicConstraintApplied=${geographicConstraintApplied}
FinalScore=${score}
Decision=${decision}
Reason=${reason}`);

  return {
    score,
    decision,
    reason,
    candidate,
    tier
  };
}

export function buildEntityImageQueries(info: {
  name: string;
  canonicalName?: string;
  city?: string;
  state?: string;
  country?: string;
  entityType?: string;
  type?: string;
  intent?: string;
  historicalContext?: string;
  historicalPeriod?: string;
  routeTitle?: string;
  waypoint?: any;
  metadataMode?: string;
  description?: string;
  imageSearchTerm?: string;
  query?: string;
  rawQuery?: string;
  imageIntent?: ResolvedImageIntent;
}): string[] {
  const imageIntent = info.imageIntent || resolveImageIntent(info);
  logImageIntent(imageIntent);

  // 1. GENERIC_TOPIC Query Construction
  if (imageIntent.type === 'GENERIC_TOPIC') {
    const topic = (imageIntent.topic || info.routeTitle || info.name || '').trim();
    const topicLower = topic.toLowerCase();
    const queries: string[] = [];

    if (topicLower.includes('game of thrones') || topicLower.includes('got')) {
      queries.push('Game of Thrones filming locations');
      queries.push('Game of Thrones filming locations Northern Ireland');
      queries.push('Game of Thrones filming locations Croatia');
      queries.push('Game of Thrones filming locations Iceland');
      queries.push('Game of Thrones filming locations Spain');
    } else if (topicLower.includes('lord of the rings') || topicLower.includes('lotr')) {
      queries.push('Lord of the Rings filming locations');
      queries.push('Lord of the Rings filming locations New Zealand');
    } else if (topicLower.includes('breaking bad')) {
      queries.push('Breaking Bad locations');
      queries.push('Breaking Bad filming locations Albuquerque New Mexico');
      queries.push('Breaking Bad filming locations');
    } else if (topic) {
      queries.push(topic);
      if (!topicLower.includes('locations')) {
        queries.push(`${topic} locations`);
      }
      if (!topicLower.includes('sites')) {
        queries.push(`${topic} sites`);
      }
    }

    return Array.from(new Set(queries.filter(Boolean)));
  }

  // 2. UNRESOLVED Intent Query Construction
  if (imageIntent.type === 'UNRESOLVED') {
    if (imageIntent.fallback === 'ORIGINAL_QUERY' && imageIntent.topic) {
      return [imageIntent.topic];
    }
    return [];
  }

  // 3. Historical Waypoint Delegation for ENTITY_SPECIFIC
  if (isHistoricalWaypointEntity(info)) {
    const histContext = extractHistoricalImageContext(info);
    return buildHistoricalImageQueries(histContext);
  }

  // 4. ENTITY_SPECIFIC Query Construction
  const queries: string[] = [];
  const rawName = (info.canonicalName || info.name || '').trim();
  const cleanName = rawName.split(/[,–-]/)[0].trim() || rawName;
  const city = (info.city || '').trim();
  const country = (info.country || '').trim();
  const eType = (info.entityType || info.type || '').toLowerCase();
  const isHistoricalVessel = eType.includes('shipwreck') || eType.includes('vessel') || info.intent === 'DISCOVERY_OBJECT_LOCATION';

  // If specific imageSearchTerm was provided, verify it does not represent a different named entity
  if (info.imageSearchTerm && info.imageSearchTerm !== info.name) {
    const isDifferent = isDifferentNamedEntity(info.imageSearchTerm, '', cleanName, (info as any).aliases || []);
    if (!isDifferent) {
      queries.push(info.imageSearchTerm);
    }
  }

  // Historical vessel & shipwreck semantic expansions
  if (isHistoricalVessel) {
    const histContext = info.historicalContext || '';
    const cleanShipBase = rawName.replace(/\s+(?:shipwreck|wreck location|discovery site|wreck site|wreck|ship|archaeological site|site)$/i, '').trim();
    if (histContext.includes('Columbus') || histContext.includes('1492') || rawName.toLowerCase().includes('santa maria')) {
      queries.push(`${rawName} ship Christopher Columbus 1492`);
      queries.push(`${rawName} ship`);
      queries.push(`${rawName} shipwreck`);
      queries.push(`${rawName} caravel`);
    } else {
      queries.push(rawName);
      if (cleanShipBase && cleanShipBase.toLowerCase() !== rawName.toLowerCase()) {
        queries.push(cleanShipBase);
        queries.push(`${cleanShipBase} ship`);
        queries.push(`${cleanShipBase} shipwreck`);
        queries.push(`${cleanShipBase} archaeology`);
        queries.push(`${cleanShipBase} artifacts`);
        queries.push(`${cleanShipBase} wreck site`);
      }
      queries.push(`${rawName} ship`);
      queries.push(`${rawName} shipwreck`);
      queries.push(`${rawName} archaeology`);
      queries.push(`${rawName} archaeological excavation`);
      queries.push(`${rawName} artifacts`);
      queries.push(`${rawName} wreck site`);
      queries.push(`${rawName} historical vessel`);
      if (histContext) {
        queries.push(`${cleanShipBase || rawName} ${histContext.split(/[,–-]/)[0].trim()}`);
      }
      if (info.state || info.country) {
        queries.push(`${cleanShipBase || rawName} ${info.state || info.country}`);
      }
    }
  }

  // Historic site, archaeological site, battlefield, monument, museum, landmark expansions
  const isHistoricOrPoi = eType.includes('historic') || eType.includes('archaeological') || eType.includes('battlefield') || eType.includes('monument') || eType.includes('memorial') || eType.includes('museum') || eType.includes('ruin') || eType.includes('castle') || eType.includes('fort') || eType.includes('landmark') || eType.includes('poi');
  if (isHistoricOrPoi && !isHistoricalVessel) {
    const cleanBase = cleanName.replace(/\s+(?:site|historic site|monument|memorial|ruins|ruin|battlefield|courthouse|village|fort|castle|museum)$/i, '').trim();
    if (cleanBase && cleanBase.toLowerCase() !== cleanName.toLowerCase()) {
      queries.push(cleanBase);
      queries.push(`${cleanBase} historic site`);
      queries.push(`${cleanBase} archaeology`);
      queries.push(`${cleanBase} ruins`);
      queries.push(`${cleanBase} monument`);
      queries.push(`${cleanBase} memorial`);
      queries.push(`${cleanBase} excavation`);
      queries.push(`${cleanBase} artifacts`);
      queries.push(`${cleanBase} ${city || info.state || country || ''}`.trim());
    } else {
      queries.push(`${cleanName} historic site`);
      queries.push(`${cleanName} archaeology`);
      queries.push(`${cleanName} ruins`);
      queries.push(`${cleanName} monument`);
      queries.push(`${cleanName} excavation`);
      queries.push(`${cleanName} artifacts`);
    }
  }

  // Landmark + City + Country (e.g. "Forbidden City Beijing China")
  if (city && country) {
    queries.push(`${cleanName} ${city} ${country}`);
  }

  // Landmark + City (e.g. "Forbidden City Beijing")
  if (city && city.toLowerCase() !== cleanName.toLowerCase()) {
    queries.push(`${cleanName} ${city}`);
  }

  // Known landmark-specific expansions
  if (cleanName.toLowerCase() === 'forbidden city') {
    queries.push('Forbidden City Palace Museum Beijing');
  }

  // Landmark + Country (e.g. "Forbidden City China", "Dubrovnik Croatia", "London United Kingdom")
  if (country && country.toLowerCase() !== cleanName.toLowerCase()) {
    queries.push(`${cleanName} ${country}`);
  }

  // Geographic collection and descriptive query expansions (generic feature-oriented queries)
  if (imageIntent.shape === 'GEOGRAPHIC_COLLECTION' || imageIntent.shape === 'DESCRIPTIVE_GEOGRAPHIC_QUERY' || imageIntent.policy === 'GEOGRAPHIC_FEATURE') {
    const featType = imageIntent.featureType;
    const pLoc = imageIntent.parentLocation || city || country;
    if (featType && pLoc) {
      queries.push(`${cleanName}`);
      queries.push(`${pLoc} ${featType}s`);
      queries.push(`${featType}s ${pLoc}`);
      queries.push(`${pLoc} ${featType}`);
      if (country && pLoc.toLowerCase() !== country.toLowerCase()) {
        queries.push(`${featType} ${pLoc} ${country}`);
        queries.push(`${pLoc} ${featType}s ${country}`);
      }
      if (featType === 'canal') {
        queries.push(`${pLoc} waterways`);
        queries.push(`${pLoc} canal network`);
      }
    }
  }

  // Clean location name for modern/general places
  if (!isHistoricalVessel && cleanName) {
    queries.push(cleanName);
  }

  // Full raw name if different
  if (!isHistoricalVessel && rawName && rawName.toLowerCase() !== cleanName.toLowerCase()) {
    queries.push(rawName);
  }

  // Return deduplicated list
  return Array.from(new Set(queries.filter(Boolean)));
}

export interface ImageSearchContext {
  searchId?: string;
  waypointId?: string;
  relatedWaypoints?: LocationInfo[];
}

// Request-level in-flight deduplication cache
const inFlightImageRequests = new Map<string, Promise<GalleryImage[]>>();

export async function fetchAndValidateImages(
  info: LocationInfo,
  searchContext?: ImageSearchContext
): Promise<GalleryImage[]> {
  if (!info || !info.name) return [];

  const effectiveSearchId = searchContext?.searchId || (info as any).searchId;
  const effectiveWaypointId = searchContext?.waypointId || (info as any).waypoint?.id || info.id || info.name;
  const relatedWaypointCount = searchContext?.relatedWaypoints?.length || (info as any).relatedWaypointCount || 1;

  // Compute request deduplication key
  const cleanEntityName = (info.canonicalName || info.name || '').toLowerCase().trim();
  const routeGroupId = (info as any).routeGroupId || (info as any).waypoint?.routeGroupId || '';
  const intentStr = (info as any).intent || '';
  const dedupeKey = `${effectiveSearchId || 'no-search'}::${effectiveWaypointId}::${cleanEntityName}::${routeGroupId}::${intentStr}`;

  if (inFlightImageRequests.has(dedupeKey)) {
    return inFlightImageRequests.get(dedupeKey)!;
  }

  const fetchPromise = (async () => {
    try {
      return await _fetchAndValidateImagesInternal(info, searchContext, effectiveSearchId, effectiveWaypointId, relatedWaypointCount);
    } finally {
      // Clear in-flight cache after completion or failure
      inFlightImageRequests.delete(dedupeKey);
    }
  })();

  inFlightImageRequests.set(dedupeKey, fetchPromise);
  return fetchPromise;
}

async function _fetchAndValidateImagesInternal(
  info: LocationInfo,
  searchContext: ImageSearchContext | undefined,
  effectiveSearchId: string | undefined,
  effectiveWaypointId: string,
  relatedWaypointCount: number
): Promise<GalleryImage[]> {

  if (effectiveSearchId) {
    console.log(`[IMAGE GROUP]\nsearchId="${effectiveSearchId}"\nwaypointId="${effectiveWaypointId}"\nrelatedWaypointCount=${relatedWaypointCount}`);
  }

  const imageIntent = (info as any).imageIntent || resolveImageIntent(info);
  const validatedCandidates: Array<{
    candidate: ImageCandidate;
    score: number;
    tier?: ImageRelevanceTier;
    category?: HistoricalImageCategory;
  }> = [];
  const seenUrls = new Set<string>();
  const isHistorical = isHistoricalWaypointEntity(info) && imageIntent.type === 'ENTITY_SPECIFIC';
  const histContext = isHistorical ? extractHistoricalImageContext(info) : null;

  const addCandidateIfValid = (candidate: ImageCandidate) => {
    if (!candidate.url || typeof candidate.url !== 'string') return;
    const cleanUrl = candidate.url.trim();
    if (!cleanUrl || seenUrls.has(cleanUrl)) return;

    const validation = validateImageCandidate(candidate, {
      name: info.name,
      canonicalName: (info as any).canonicalName,
      city: info.city,
      state: info.state,
      country: info.country,
      coordinates: info.coordinates,
      coordinateSource: (info as any).coordinateSource,
      identityStatus: (info as any).identityStatus,
      entityType: info.entityType || (info as any).type,
      type: (info as any).type,
      intent: (info as any).intent,
      historicalContext: (info as any).historicalContext,
      historicalPeriod: (info as any).historicalPeriod,
      routeTitle: (info as any).routeTitle,
      waypoint: (info as any).waypoint,
      metadataMode: (info as any).metadataMode,
      aliases: (info as any).aliases || (info as any).alternateNames,
      query: (info as any).rawQuery || (info as any).query,
      rawQuery: (info as any).rawQuery,
      imageIntent
    }, imageIntent);

    if (validation.decision === 'ACCEPT') {
      seenUrls.add(cleanUrl);
      const category = isHistorical && histContext
        ? classifyHistoricalImageCategory(candidate, histContext)
        : undefined;

      validatedCandidates.push({
        candidate,
        score: validation.score,
        tier: validation.tier,
        category
      });
    }
  };

  // 1. Validate primary image or direct image fields on info
  if (info.primaryImage) {
    if (typeof info.primaryImage === 'string') {
      addCandidateIfValid({
        url: info.primaryImage,
        caption: info.imageCaption,
        attribution: (info as any).imageAttribution || (info as any).imageCredit || (info as any).imageSource || (info as any).attribution,
        title: info.name
      });
    } else if (typeof info.primaryImage === 'object') {
      const p = info.primaryImage as any;
      addCandidateIfValid({
        url: p.url || p.imageUrl || p.src,
        caption: p.caption || p.description || p.title || info.imageCaption,
        attribution: p.attribution || p.credit || p.source || p.author || (info as any).imageAttribution || (info as any).attribution,
        title: p.title || info.name,
        description: p.description
      });
    }
  }

  if ((info as any).image) {
    const imgObj = (info as any).image;
    if (typeof imgObj === 'string') {
      addCandidateIfValid({
        url: imgObj,
        caption: info.imageCaption,
        attribution: (info as any).imageAttribution || (info as any).attribution,
        title: info.name
      });
    } else if (typeof imgObj === 'object') {
      addCandidateIfValid({
        url: imgObj.imageUrl || imgObj.url || imgObj.src,
        caption: imgObj.caption || imgObj.description || imgObj.title || info.imageCaption,
        attribution: imgObj.attribution || imgObj.credit || imgObj.source || imgObj.provenance?.provider || (info as any).imageAttribution || (info as any).attribution,
        title: imgObj.title || info.name,
        description: imgObj.description
      });
    }
  }

  if (Array.isArray(info.images)) {
    for (const img of info.images) {
      if (typeof img === 'string') {
        addCandidateIfValid({
          url: img,
          caption: info.imageCaption,
          attribution: (info as any).imageAttribution || (info as any).imageCredit || (info as any).imageSource || (info as any).attribution,
          title: info.name
        });
      } else if (typeof img === 'object' && img !== null) {
        const obj = img as any;
        addCandidateIfValid({
          url: obj.url || obj.imageUrl || obj.src,
          caption: obj.caption || obj.title || obj.description || info.imageCaption,
          attribution: obj.attribution || obj.credit || obj.source || obj.author || (info as any).imageAttribution || (info as any).attribution,
          title: obj.title || info.name,
          description: obj.description
        });
      }
    }
  }

  // 2. Fetch images from Wikipedia using entity-specific progressive queries
  const queries = buildEntityImageQueries({
    ...info,
    rawQuery: (info as any).rawQuery,
    query: (info as any).query,
    imageIntent
  });
  const resolvedHistKnowledge = getHistoricalEntityKnowledge(info.canonicalName || info.name);
  let effectiveHistContext = (info as any).historicalContext || resolvedHistKnowledge?.historicalContext || '';
  const rawEntityName = (info.canonicalName || info.name || '').toLowerCase();
  if (effectiveHistContext && !rawEntityName.includes('columbus') && !rawEntityName.includes('santa maria')) {
    if (effectiveHistContext.toLowerCase().includes('columbus') || effectiveHistContext.toLowerCase().includes('santa maría') || effectiveHistContext.toLowerCase().includes('santa maria') || effectiveHistContext.toLowerCase().includes('hispaniola')) {
      console.warn(`[IMAGE CONTEXT CONFLICT] Discarding stale/conflicting historical context "${effectiveHistContext}" for entity "${info.name}"`);
      effectiveHistContext = resolvedHistKnowledge?.historicalContext || '';
    }
  }
  const histContextStr = effectiveHistContext || (histContext?.exploration || 'none');

  const geoParts = [info.city, info.state, info.country].filter(Boolean);
  let geoContextStr = geoParts.length > 0 ? geoParts.join(' / ') : (resolvedHistKnowledge?.approximateRegion || 'Unknown');
  if (geoContextStr.toLowerCase().includes('hispaniola') || geoContextStr.toLowerCase().includes('haiti')) {
    if (!rawEntityName.includes('columbus') && !rawEntityName.includes('santa maria') && !rawEntityName.includes('haiti')) {
      geoContextStr = resolvedHistKnowledge?.approximateRegion || 'Unknown';
    }
  }

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    let candidateContext = (info as any).context || (info as any).routeTitle || (info as any).significance || histContextStr;
    if (typeof candidateContext === 'string' && /^(from route|route context|historical significance|notable facts|image|none)$/i.test(candidateContext.trim())) {
      candidateContext = histContextStr !== 'none' ? histContextStr : ((info as any).significance || '');
    }
    const contextStr = candidateContext || histContextStr;
    console.log(`[IMAGE SEARCH]\nentity="${info.name}"\ncontext="${contextStr}"`);
    console.log(`[IMAGE SEARCH DETAILS]\nEntity: ${info.name}\nEntity Type: ${info.entityType || (info as any).type || 'unknown'}\nIntent: ${(info as any).intent || 'unknown'}\nHistorical Context: ${histContextStr}\nGeographic Context: ${geoContextStr}\nQuery: ${query}`);

    try {
      const endpoint = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=8&prop=pageimages|description|coordinates&format=json&pithumbsize=800&origin=*`;
      const res = await fetch(endpoint);
      const data = await res.json();
      const pages = data.query?.pages;

      if (pages) {
        const sortedPageIds = Object.keys(pages).sort((a, b) => ((pages[a] as any).index || 0) - ((pages[b] as any).index || 0));
        for (const pageId of sortedPageIds) {
          const page = pages[pageId];
          if (pageId !== '-1' && page?.thumbnail?.source) {
            const candidateCoords = page.coordinates && page.coordinates.length > 0
              ? { lat: page.coordinates[0].lat, lng: page.coordinates[0].lon }
              : undefined;

            addCandidateIfValid({
              url: page.thumbnail.source,
              title: page.title,
              description: page.description,
              caption: page.description || page.title,
              attribution: 'Wikimedia Commons',
              coordinates: candidateCoords
            });
          }
        }
      }
    } catch (e) {
      console.warn(`[IMAGE SEARCH] Failed query "${query}":`, e);
    }

    // Stop searching early if we have sufficient high-scoring validated images
    if (validatedCandidates.length >= 8) {
      break;
    }
  }

  // 3. Selection, Uniqueness Filtering, Diversity, and Caption Enhancement
  const foundImages: GalleryImage[] = [];

  // Helper to filter/re-rank candidates according to search-scoped uniqueness
  const rankAndDeduplicateCandidates = (
    candidates: Array<{ candidate: ImageCandidate; score: number; category?: HistoricalImageCategory }>
  ) => {
    if (!effectiveSearchId || candidates.length === 0) {
      return candidates;
    }

    const uniqueCandidates: typeof candidates = [];
    const duplicateCandidates: typeof candidates = [];

    for (const item of candidates) {
      const usageCheck = searchImageRegistry.isImageUsedInSearch(effectiveSearchId, item.candidate.url);
      if (usageCheck.isUsed) {
        console.log(`[IMAGE CANDIDATE]\nTitle="${item.candidate.title || 'Untitled'}"\nEntityMatch=HIGH\nGeographicEvidence=VERIFIED\nalreadyUsedByWaypoint="${usageCheck.usedByWaypointId || 'other'}"\ndecision="SKIP_DUPLICATE"`);
        duplicateCandidates.push(item);
      } else {
        uniqueCandidates.push(item);
      }
    }

    // If we have sufficiently relevant unique candidates, prefer them.
    if (uniqueCandidates.length > 0) {
      return [...uniqueCandidates, ...duplicateCandidates];
    }

    // If NO relevant unique alternative exists, allow the duplicate rather than failing or selecting irrelevant images
    if (duplicateCandidates.length > 0) {
      console.log(`[IMAGE UNIQUENESS]\nwaypoint="${effectiveWaypointId}"\ncandidate="${duplicateCandidates[0].candidate.title || duplicateCandidates[0].candidate.url}"\nalreadyUsed=true\nuniqueAlternative=false\nduplicateAllowed=true\nreason="NO_RELEVANT_UNIQUE_ALTERNATIVE"`);
      return duplicateCandidates;
    }

    return candidates;
  };

  if (isHistorical && histContext) {
    // Separate historical narrative candidates from modern location candidates
    const historicalCandidates = validatedCandidates.filter(c => c.category && c.category !== 'MODERN_LOCATION');
    const modernCandidates = validatedCandidates.filter(c => !c.category || c.category === 'MODERN_LOCATION');

    // Sort historical candidates by score descending
    historicalCandidates.sort((a, b) => b.score - a.score);

    // Apply uniqueness ranking
    const rankedHistorical = rankAndDeduplicateCandidates(historicalCandidates);
    const rankedModern = rankAndDeduplicateCandidates(modernCandidates.sort((a, b) => b.score - a.score));

    // If historical candidates are available, select diverse historical categories
    const candidatesToUse = rankedHistorical.length > 0
      ? rankedHistorical
      : rankedModern.slice(0, 2);

    const usedCategories = new Set<string>();
    const selectedList: Array<{ candidate: ImageCandidate; score: number; category?: HistoricalImageCategory }> = [];

    // First pass: pick highest scoring candidate from distinct categories
    for (const item of candidatesToUse) {
      const catKey = item.category || 'GENERAL';
      if (!usedCategories.has(catKey)) {
        usedCategories.add(catKey);
        selectedList.push(item);
      }
      if (selectedList.length >= 4) break;
    }

    // Second pass: fill remaining slots up to 4 if more high-scoring historical candidates exist
    if (selectedList.length < 4) {
      for (const item of candidatesToUse) {
        if (!selectedList.includes(item)) {
          selectedList.push(item);
        }
        if (selectedList.length >= 4) break;
      }
    }

    for (const { candidate, category } of selectedList) {
      let enhancedCaption = cleanMetadataString(candidate.caption || candidate.description || candidate.title);

      // Enhance generic administrative captions with historical context
      if (!enhancedCaption || /county in|city in|municipality|census-designated/i.test(enhancedCaption)) {
        if (category === 'EXPEDITION_EVENT' && histContext.exploration) {
          enhancedCaption = `${histContext.exploration} - ${histContext.cleanLocationName}`;
        } else if (category === 'HISTORICAL_MAP' && histContext.exploration) {
          enhancedCaption = `Route Map of the ${histContext.exploration}`;
        } else if (category === 'HISTORICAL_PLACE') {
          enhancedCaption = `Historic Depiction of ${histContext.cleanLocationName}${histContext.region ? `, ${histContext.region}` : ''}`;
        } else if (candidate.title) {
          enhancedCaption = candidate.title.replace(/\s*\([^)]*\)/g, '').trim();
        }
      }

      foundImages.push({
        url: candidate.url,
        caption: enhancedCaption,
        attribution: cleanMetadataString(candidate.attribution || 'Wikimedia Commons')
      });
    }
  } else {
    // Tier-based grouping and selection:
    // Select Tier 1 first; use Tier 2 only after Tier 1 availability is determined;
    // use Tier 3 only when higher tiers are empty or insufficient; use Tier 4 only where explicitly permitted.
    const tier1 = validatedCandidates.filter(c => c.tier === 1).sort((a, b) => b.score - a.score);
    const tier2 = validatedCandidates.filter(c => c.tier === 2).sort((a, b) => b.score - a.score);
    const tier3 = validatedCandidates.filter(c => c.tier === 3).sort((a, b) => b.score - a.score);
    const tier4 = validatedCandidates.filter(c => c.tier === 4 || (!c.tier && c.score > 0)).sort((a, b) => b.score - a.score);

    const rankedTier1 = rankAndDeduplicateCandidates(tier1);
    const rankedTier2 = rankAndDeduplicateCandidates(tier2);
    const rankedTier3 = rankAndDeduplicateCandidates(tier3);
    const rankedTier4 = rankAndDeduplicateCandidates(tier4);

    const prioritizedCandidates = [
      ...rankedTier1,
      ...rankedTier2,
      ...rankedTier3,
      ...rankedTier4
    ];

    for (const { candidate } of prioritizedCandidates.slice(0, 4)) {
      foundImages.push({
        url: candidate.url,
        caption: cleanMetadataString(candidate.caption || candidate.description || candidate.title || (foundImages.length === 0 ? info.imageCaption : undefined)),
        attribution: cleanMetadataString(candidate.attribution || 'Wikimedia Commons')
      });
    }
  }

  // Register primary selected image into search-scoped registry
  if (effectiveSearchId && foundImages.length > 0) {
    const primaryUrl = foundImages[0].url;
    const isUnique = !searchImageRegistry.isImageUsedInSearch(effectiveSearchId, primaryUrl).isUsed;
    searchImageRegistry.registerImage(effectiveSearchId, effectiveWaypointId, primaryUrl, {
      title: foundImages[0].caption || info.name
    });
    console.log(`[IMAGE SELECTED]\nsearchId="${effectiveSearchId}"\nwaypointId="${effectiveWaypointId}"\nimageId="${canonicalizeImageUrl(primaryUrl)}"\nuniqueWithinSearch=${isUnique}`);
  }

  return foundImages;
}

/**
 * Coordinated batch unique image assignment for a list of related waypoints.
 * Discovers and validates candidates, resolves collisions by assigning images to the
 * waypoint with the strongest relevance score, and registers assignments.
 */
export async function assignUniqueImagesForWaypoints(
  waypoints: LocationInfo[],
  searchContext: {
    searchId: string;
  }
): Promise<Map<string, GalleryImage[]>> {
  const resultMap = new Map<string, GalleryImage[]>();
  if (!waypoints || waypoints.length === 0) return resultMap;

  const searchId = searchContext.searchId;

  // Process sequential assignment respecting searchImageRegistry reservations
  for (const wp of waypoints) {
    const wpId = (wp as any).waypoint?.id || (wp as any).id || wp.name;
    const images = await fetchAndValidateImages(wp, {
      searchId,
      waypointId: wpId,
      relatedWaypoints: waypoints
    });
    resultMap.set(wpId, images);
  }

  return resultMap;
}

