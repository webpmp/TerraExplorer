import { LocationInfo } from '../types';
import { cleanMetadataString, formatImageAttribution, GalleryImage } from '../components/InfoPanel';

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

export interface ImageValidationResult {
  score: number;
  decision: 'ACCEPT' | 'REJECT';
  reason: string;
  candidate: ImageCandidate;
}

export type ResolvedImageIntentType = 'ENTITY_SPECIFIC' | 'GENERIC_TOPIC' | 'UNRESOLVED';

export interface ResolvedImageIntent {
  type: ResolvedImageIntentType;
  topic?: string;
  entity?: string;
  entityRequired: boolean;
  geographicConstraint: boolean;
  source: 'USER_QUERY' | 'ROUTE_CONTEXT' | 'ENTITY_NAME' | 'FALLBACK_QUERY' | 'UNKNOWN';
  fallback?: 'ORIGINAL_QUERY' | 'NONE';
}

export function logImageIntent(intent: ResolvedImageIntent): void {
  const lines = [
    '[IMAGE INTENT]',
    `type=${intent.type}`,
    `topic=${intent.topic ? `"${intent.topic}"` : 'none'}`,
    `entity=${intent.entity ? `"${intent.entity}"` : 'none'}`,
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

    return {
      type: 'ENTITY_SPECIFIC',
      topic: undefined,
      entity: targetEntity || nameString,
      entityRequired: true,
      geographicConstraint: true,
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

  // If entity is in China (e.g. Forbidden City in Beijing, China) and candidate text explicitly mentions San Francisco, California, USA
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

  // Check conflicting foreign country mentions when entity country is known
  if (targetCountry) {
    for (const c of KNOWN_COUNTRIES) {
      if (c !== targetCountry && !targetCountry.includes(c) && !c.includes(targetCountry)) {
        const regex = new RegExp(`\\b${c}\\b`, 'i');
        // Only trigger if country is present and target entity name does not contain that country
        if (regex.test(text) && !entity.name.toLowerCase().includes(c)) {
          // Check if candidate also mentions the target entity explicitly. If not, conflicting country is a mismatch
          const entityLower = entity.name.toLowerCase();
          if (!text.includes(entityLower)) {
            return {
              mismatch: true,
              location: c.toUpperCase(),
              reason: `Geographic mismatch: candidate refers to ${c}, but entity is in ${entity.country}`
            };
          }
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

  // Helper to check for sequential digit progression (e.g. 12.3456, 78.9012, 12345, 67890)
  const isSequentialDigits = (num: number): boolean => {
    const s = Math.abs(num).toString().replace(/[^0-9]/g, '');
    if (s.length < 4) return false;

    // Check if >= 4 digits are in consecutive increasing arithmetic sequence (mod 10)
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

    if (maxInc >= 4 || maxDec >= 4) return true;

    // Check for repetitive digits >= 4 times in fractional part (e.g. .1111, .0000)
    const parts = Math.abs(num).toString().split('.');
    if (parts.length > 1) {
      const frac = parts[1];
      if (/(\d)\1{3,}/.test(frac)) return true;
    }

    return false;
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

  // If title directly contains target entity name or any alias, it is not a different entity
  if (allTargetAliases.some(a => titleClean.toLowerCase().includes(a))) {
    return false;
  }

  // Vessel prefixes: SS, USS, HMS, RMS, MV, MS, MT, SV, RV, PS
  const vesselPrefixMatch = titleClean.match(/^(?:ss|uss|hms|rms|mv|ms|mt|sv|rv|ps)\s+([a-z0-9\s'-]+)/i);
  if (vesselPrefixMatch) {
    const vesselName = vesselPrefixMatch[1].toLowerCase().trim();
    // If the vessel name does not match any target alias
    if (!allTargetAliases.some(a => a.includes(vesselName) || vesselName.includes(a))) {
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

  if (entityName.toLowerCase() === 'forbidden city') {
    aliases.push('palace museum', 'gugong', '故宫', '紫禁城', 'imperial palace', 'beijing imperial palace');
  }

  // Check for auto-generated vessel aliases: e.g. "El Faro" -> "ss el faro", "el faro shipwreck", "el faro wreck"
  const cleanBase = entityName.toLowerCase().replace(/^(?:shipwreck of (?:the )?|wreck of (?:the )?|the )/i, '').trim();
  if (cleanBase) {
    aliases.push(
      cleanBase,
      `ss ${cleanBase}`,
      `${cleanBase} shipwreck`,
      `${cleanBase} wreck`,
      `wreck of the ${cleanBase}`,
      `wreck of ${cleanBase}`,
      `shipwreck of ${cleanBase}`,
      `shipwreck of the ${cleanBase}`
    );
  }

  const dedupedAliases = Array.from(new Set(aliases.filter(Boolean)));

  // 1. Check EXACT_ENTITY
  const exactMatch = dedupedAliases.find(a => 
    titleLower === a || 
    titleLower.startsWith(`${a} (`) || 
    titleLower.startsWith(`${a},`) ||
    titleLower === `the ${a}`
  );
  if (exactMatch) {
    return {
      evidenceType: 'EXACT_ENTITY',
      entityMatchLevel: 'EXACT',
      matchedAlias: exactMatch
    };
  }

  // 2. Check KNOWN_ALIAS
  const aliasMatch = dedupedAliases.find(a => fullText.includes(a) || normFullText.includes(normalizeDiacritics(a)));
  if (aliasMatch) {
    return {
      evidenceType: 'KNOWN_ALIAS',
      entityMatchLevel: 'HIGH',
      matchedAlias: aliasMatch
    };
  }

  // 3. Significant token match if >= 80% distinctive tokens match
  const tokens = cleanBase.split(/\s+/).filter(t => t.length > 2);
  if (tokens.length > 0) {
    const matching = tokens.filter(t => fullText.includes(t) || normFullText.includes(normalizeDiacritics(t)));
    if (matching.length === tokens.length && tokens.length >= 2) {
      return {
        evidenceType: 'KNOWN_ALIAS',
        entityMatchLevel: 'HIGH',
        matchedAlias: matching.join(' ')
      };
    }
    if (matching.length / tokens.length >= 0.6) {
      return {
        evidenceType: 'RELATED_ENTITY',
        entityMatchLevel: 'MEDIUM',
        matchedAlias: matching.join(' ')
      };
    }
  }

  return {
    evidenceType: 'UNKNOWN',
    entityMatchLevel: 'NONE'
  };
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
    eType.includes('archaeological')
  ) {
    return true;
  }
  if (entity.metadataMode === 'historical_site') return true;
  if (entity.intent === 'HISTORICAL_EVENT' || entity.intent === 'exploration' || entity.intent === 'historical_event') return true;
  if (Boolean(entity.historicalPeriod || (entity.routeTitle && !combined.includes('filming')))) return true;
  return false;
}

export function extractHistoricalImageContext(info: any): HistoricalImageContext {
  const wp = info?.waypoint || {};
  const exploration = (info?.routeTitle || wp?.routeTitle || info?.routeContext?.title || info?.historicalContext || '').trim();
  const event = (info?.significance || wp?.significance || '').trim();
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

  // 1. exploration + historical event (e.g. "Lewis and Clark Expedition final preparations departure 1804")
  if (exploration && event) {
    const cleanEvent = event.replace(/[^\w\s]/g, ' ').split(/\s+/).slice(0, 5).join(' ');
    queries.push(`${exploration} ${cleanEvent} ${year || ''}`.trim());
  }

  // 2. exploration + waypoint + historical period (e.g. "Lewis and Clark Expedition St. Charles 1804", "Lewis and Clark St. Charles Missouri")
  if (exploration && cleanLocationName) {
    if (year) {
      queries.push(`${exploration} ${cleanLocationName} ${year}`.trim());
    }
    if (region && region.toLowerCase() !== cleanLocationName.toLowerCase()) {
      queries.push(`${exploration} ${cleanLocationName} ${region}`.trim());
    } else {
      queries.push(`${exploration} ${cleanLocationName}`.trim());
    }
  }

  // 3. exploration + major historical activity / artifact (e.g. "Lewis and Clark keelboat", "Corps of Discovery 1804")
  if (exploration) {
    if (activities.length > 0) {
      for (const act of activities.slice(0, 3)) {
        queries.push(`${exploration} ${act}`.trim());
      }
    }
    if (artifacts.length > 0) {
      for (const art of artifacts.slice(0, 3)) {
        queries.push(`${exploration} ${art}`.trim());
      }
    }
    if (exploration.toLowerCase().includes('lewis and clark') || exploration.toLowerCase().includes('discovery')) {
      queries.push(`${exploration} keelboat`);
      queries.push(`Corps of Discovery ${year || '1804'}`);
    }
    if (year) {
      queries.push(`${exploration} ${year}`.trim());
    }
  }

  // 4. exploration + historical maps / journals / illustrations
  if (exploration) {
    queries.push(`${exploration} map ${region || ''}`.trim());
    queries.push(`${exploration} historical illustration artwork`.trim());
    queries.push(`${exploration} journal map`.trim());
  }

  // 5. Named historical people / Corps of Discovery
  if (people.length > 0) {
    for (const p of people.slice(0, 2)) {
      queries.push(`${p} ${exploration || ''} ${year || ''}`.trim());
    }
  }

  // 6. waypoint + historical period / 19th century / historic
  if (cleanLocationName && (year || period)) {
    queries.push(`${cleanLocationName} ${region || ''} ${year || period} historical`.trim());
  }

  // 7. historical depiction of waypoint
  if (cleanLocationName) {
    queries.push(`historic ${cleanLocationName} ${region || ''} painting engraving`.trim());
  }

  // 8. Fallback modern location query (placed last)
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

    let score = baseScore;
    const expLower = (histContext.exploration || '').toLowerCase();
    const locLower = (histContext.cleanLocationName || '').toLowerCase();

    if (expLower && fullText.includes(expLower)) {
      score += 20;
    }
    if (histContext.year && fullText.includes(histContext.year.toLowerCase())) {
      score += 15;
    }
    if (locLower && fullText.includes(locLower)) {
      score += 10;
    }
    if (histContext.activities.some(act => fullText.includes(act))) {
      score += 10;
    }
    if (histContext.artifacts.some(art => fullText.includes(art))) {
      score += 10;
    }
    if (histContext.people.some(p => fullText.includes(p.toLowerCase()))) {
      score += 10;
    }

    // Strong negative preference / penalty against modern location photography on historical waypoints
    if (isModern) {
      score -= 40;
      score = Math.min(score, 30);
    }

    const decision: 'ACCEPT' | 'REJECT' = score >= 45 ? 'ACCEPT' : 'REJECT';
    const reason = decision === 'ACCEPT'
      ? `Historical narrative match (${category}, score ${score})`
      : `Insufficient historical narrative relevance (${category}, score ${score})`;

    console.log(`[IMAGE CANDIDATE (HISTORICAL WAYPOINT)]
Title: ${title || 'Untitled'}
Waypoint: ${entityName}
Exploration: ${histContext.exploration || 'N/A'}
Category: ${category}
Is Modern Photo: ${isModern}
Score: ${score}
Decision: ${decision}
Reason: ${reason}`);

    return {
      score,
      decision,
      reason,
      candidate
    };
  }

  // 1. Evaluate coordinate trust for standard entities
  let coordinateTrust: 'TRUSTED' | 'UNVERIFIED' | 'UNTRUSTED' = 'TRUSTED';
  if (entity.coordinates) {
    if (isSuspiciousPlaceholderCoordinate(entity.coordinates.lat, entity.coordinates.lng)) {
      coordinateTrust = 'UNTRUSTED';
    } else if (entity.coordinateSource === 'ai_recovery' && entity.identityStatus === 'unverified') {
      coordinateTrust = 'UNVERIFIED';
    }
  } else {
    coordinateTrust = 'UNVERIFIED';
  }

  // 2. Check for generic flags/emblems
  const isFlag = isGenericFlagOrEmblem(title, desc, entityName);

  // 3. Generic topic detection
  const isGenericTopic = isGenericTopicCandidate(title, desc);

  // 4. Different named entity detection
  const isDifferentEntity = isDifferentNamedEntity(title, desc, entityName, entity.aliases || []);

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
  let geoEvidence: 'VERIFIED' | 'PROXIMATE' | 'CONFLICTING' | 'NONE' = 'NONE';
  let geoMismatch = false;
  let geoMismatchReason: string | undefined;

  if (coordinateTrust === 'TRUSTED' && candidate.coordinates && entity.coordinates && entity.coordinates.lat !== 0 && entity.coordinates.lng !== 0) {
    const dist = calculateHaversineDistanceKm(
      entity.coordinates.lat,
      entity.coordinates.lng,
      candidate.coordinates.lat,
      candidate.coordinates.lng
    );
    const tolerance = getEntityDistanceToleranceKm(entity.entityType);
    if (dist <= tolerance) {
      geoEvidence = 'VERIFIED';
    } else {
      geoEvidence = 'CONFLICTING';
      geoMismatch = true;
      geoMismatchReason = `Geographic mismatch: coordinate distance (${Math.round(dist)}km) exceeds tolerance (${tolerance}km)`;
    }
  } else {
    const geoCheck = detectGeographicMismatch(candidate, entity);
    if (geoCheck.mismatch) {
      geoEvidence = 'CONFLICTING';
      geoMismatch = true;
      geoMismatchReason = geoCheck.reason || 'Geographic mismatch';
    }
  }

  // 8. HARD FINAL ACCEPTANCE GATE
  const entitySpecificEvidence = (evidenceType === 'EXACT_ENTITY' || evidenceType === 'KNOWN_ALIAS' || evidenceType === 'DIRECT_ENTITY_SOURCE') && !isDifferentEntity && !isGenericTopic;

  let decision: 'ACCEPT' | 'REJECT' = entitySpecificEvidence ? 'ACCEPT' : 'REJECT';
  let reason = entitySpecificEvidence 
    ? (matchedAlias ? `Exact entity/alias match ('${matchedAlias}')` : 'Entity relevance verified')
    : 'NO_ENTITY_SPECIFIC_EVIDENCE';

  if (isFlag) {
    decision = 'REJECT';
    reason = 'Generic national flag, insufficient entity relevance';
  } else if (entityTypeMatchLevel === 'INCOMPATIBLE') {
    decision = 'REJECT';
    reason = 'Semantic entity-type mismatch';
  } else if (isDifferentEntity) {
    decision = 'REJECT';
    reason = 'DIFFERENT_ENTITY';
  } else if (isGenericTopic && evidenceType !== 'EXACT_ENTITY') {
    decision = 'REJECT';
    reason = 'NO_ENTITY_SPECIFIC_EVIDENCE';
  } else if (!entitySpecificEvidence) {
    decision = 'REJECT';
    reason = 'NO_ENTITY_SPECIFIC_EVIDENCE';
  } else if (geoMismatch) {
    decision = 'REJECT';
    reason = geoMismatchReason || 'Geographic mismatch';
  }

  // 9. Scoring for candidates that passed the hard entity-specific qualification gate
  let score = 0;
  if (decision === 'ACCEPT') {
    if (evidenceType === 'EXACT_ENTITY') {
      score += 60;
    } else if (evidenceType === 'KNOWN_ALIAS') {
      score += 55;
    } else if (evidenceType === 'DIRECT_ENTITY_SOURCE') {
      score += 55;
    }

    if (entity.city && fullText.includes(entity.city.toLowerCase())) {
      score += 20;
    }
    if (entity.country && fullText.includes(entity.country.toLowerCase())) {
      score += 15;
    }
    if (geoEvidence === 'VERIFIED') {
      score += 20;
    }

    if (score >= 50) {
      decision = 'ACCEPT';
      reason = matchedAlias ? `Exact entity/alias match ('${matchedAlias}')` : 'Entity relevance verified';
    } else {
      decision = 'REJECT';
      reason = `Low relevance score (${score})`;
    }
  }

  // 10. Emitting candidate log
  const topicMatch = imageIntent.topic ? classifyTopicMatch(candidate, imageIntent.topic) : 'NONE';
  const geographicConstraintApplied = true;

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

  // Historical vessel semantic expansions
  if (isHistoricalVessel) {
    const histContext = info.historicalContext || '';
    if (histContext.includes('Columbus') || histContext.includes('1492') || rawName.toLowerCase().includes('santa maria')) {
      queries.push(`${rawName} ship Christopher Columbus 1492`);
      queries.push(`${rawName} ship`);
      queries.push(`${rawName} shipwreck`);
      queries.push(`${rawName} caravel`);
    } else {
      queries.push(`${rawName} ship`);
      queries.push(`${rawName} shipwreck`);
      queries.push(`${rawName} vessel`);
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

export async function fetchAndValidateImages(info: LocationInfo): Promise<GalleryImage[]> {
  if (!info || !info.name) return [];

  const imageIntent = (info as any).imageIntent || resolveImageIntent(info);
  const validatedCandidates: Array<{
    candidate: ImageCandidate;
    score: number;
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
      aliases: (info as any).alternateNames,
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
  const histContextStr = (info as any).historicalContext || ((info as any).intent === 'DISCOVERY_OBJECT_LOCATION' ? 'Christopher Columbus / 1492 / Santa María' : (histContext?.exploration || 'none'));
  const geoContextStr = [info.city, info.state, info.country].filter(Boolean).join(' / ') || ((info as any).intent === 'DISCOVERY_OBJECT_LOCATION' ? 'Haiti / Northern Hispaniola' : 'Unknown');

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const contextStr = (info as any).context || (info as any).routeTitle || (info as any).significance || histContextStr;
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

  // 3. Selection, Diversity, and Caption Enhancement
  const foundImages: GalleryImage[] = [];

  if (isHistorical && histContext) {
    // Separate historical narrative candidates from modern location candidates
    const historicalCandidates = validatedCandidates.filter(c => c.category && c.category !== 'MODERN_LOCATION');
    const modernCandidates = validatedCandidates.filter(c => !c.category || c.category === 'MODERN_LOCATION');

    // Sort historical candidates by score descending
    historicalCandidates.sort((a, b) => b.score - a.score);

    // If historical candidates are available, select diverse historical categories
    const candidatesToUse = historicalCandidates.length > 0
      ? historicalCandidates
      : modernCandidates.sort((a, b) => b.score - a.score).slice(0, 2);

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
    // Standard sorting by score descending
    validatedCandidates.sort((a, b) => b.score - a.score);
    for (const { candidate } of validatedCandidates.slice(0, 4)) {
      foundImages.push({
        url: candidate.url,
        caption: cleanMetadataString(candidate.caption || candidate.description || candidate.title || (foundImages.length === 0 ? info.imageCaption : undefined)),
        attribution: cleanMetadataString(candidate.attribution || 'Wikimedia Commons')
      });
    }
  }

  return foundImages;
}
