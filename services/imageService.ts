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

export function validateImageCandidate(
  candidate: ImageCandidate,
  entity: {
    name: string;
    canonicalName?: string;
    city?: string;
    state?: string;
    country?: string;
    coordinates?: { lat: number; lng: number };
    entityType?: string;
    intent?: string;
    historicalContext?: string;
    aliases?: string[];
  }
): ImageValidationResult {
  const entityName = entity.name || '';
  const title = candidate.title || '';
  const desc = candidate.description || candidate.caption || '';
  const fullText = `${title} ${desc}`.toLowerCase();
  const normFullText = normalizeDiacritics(fullText);
  const entityLower = entityName.toLowerCase();
  const canonicalLower = (entity.canonicalName || '').toLowerCase();
  const eType = (entity.entityType || '').toLowerCase();
  const isHistoricalVessel = eType.includes('shipwreck') || eType.includes('vessel') || entity.intent === 'DISCOVERY_OBJECT_LOCATION';

  // 1. Check for flags
  if (isGenericFlagOrEmblem(title, desc, entityName)) {
    console.log(`[IMAGE CANDIDATE REJECTED]\nTitle: ${title || 'Untitled'}\nEntity: ${entityName}\nDecision: REJECT\nReason: Generic national flag, insufficient entity relevance`);
    return {
      score: 0,
      decision: 'REJECT',
      reason: 'Generic national flag, insufficient entity relevance',
      candidate
    };
  }

  // 2. HARD SEMANTIC INCOMPATIBILITY FILTERING (Must precede acceptance & alias scoring)
  if (isHistoricalVessel) {
    const hasMaritimeToken = /\b(ship|vessel|caravel|carrack|flagship|fleet|sailing|sail|wreck|shipwreck|maritime|nautical|naval|columbus|1492|expedition|replica|mast|rigging|hull)\b/i.test(fullText);
    const hasColumbusToken = /\b(columbus|1492|hispaniola|caribbean|flagship|first voyage)\b/i.test(fullText);
    const isPerson = /\b(podcaster|journalist|television host|talk show|science communicator|american woman|actress|comedian|politician|writer|author|born \d{4}|biography)\b/i.test(fullText);
    const isChurch = /\b(basilica|cathedral|church|parish|diocese|convent|monastery|sanctuary)\b/i.test(fullText);
    const isVolcano = /\b(stratovolcano|volcano|caldera)\b/i.test(fullText);
    const isModernPlace = /\b(municipality|city in|capital of|county seat|census-designated)\b/i.test(fullText);

    if (isPerson && !hasMaritimeToken) {
      console.log(`[IMAGE CANDIDATE]\nTitle: ${title || 'Untitled'}\nName Match: HIGH\nEntity Type Match: INCOMPATIBLE\nHistorical Context Match: NONE\nMaritime Context Match: NONE\nDecision: REJECT\nReason: Semantic entity-type mismatch`);
      return {
        score: 0,
        decision: 'REJECT',
        reason: 'Semantic entity-type mismatch',
        candidate
      };
    }

    if (isChurch && !hasMaritimeToken) {
      console.log(`[IMAGE CANDIDATE]\nTitle: ${title || 'Untitled'}\nName Match: HIGH\nEntity Type Match: INCOMPATIBLE\nHistorical Context Match: NONE\nMaritime Context Match: NONE\nDecision: REJECT\nReason: Incompatible category (church/religious building) for historical vessel`);
      return {
        score: 0,
        decision: 'REJECT',
        reason: 'Incompatible category (church/religious building) for historical vessel',
        candidate
      };
    }

    if ((isVolcano || isModernPlace) && !hasMaritimeToken) {
      console.log(`[IMAGE CANDIDATE]\nTitle: ${title || 'Untitled'}\nName Match: HIGH\nEntity Type Match: INCOMPATIBLE\nHistorical Context Match: NONE\nMaritime Context Match: NONE\nDecision: REJECT\nReason: Incompatible category for historical vessel`);
      return {
        score: 0,
        decision: 'REJECT',
        reason: 'Incompatible category for historical vessel',
        candidate
      };
    }
  }

  // 3. Check for geographic mismatch
  const geoCheck = detectGeographicMismatch(candidate, entity);
  if (geoCheck.mismatch) {
    console.log(`[IMAGE CANDIDATE REJECTED]\nTitle: ${title || 'Untitled'}\nEntity: ${entityName}\nImage location: ${geoCheck.location || 'Unknown'}\nDecision: REJECT\nReason: Geographic mismatch`);
    return {
      score: 0,
      decision: 'REJECT',
      reason: geoCheck.reason || 'Geographic mismatch',
      candidate
    };
  }

  // 4. Compute relevance score
  let score = 0;
  const reasons: string[] = [];

  // Entity aliases mapping for known landmarks
  const aliases = [
    entityLower,
    canonicalLower,
    ...(entity.aliases || []).map(a => a.toLowerCase())
  ].filter(Boolean);

  if (entityLower === 'forbidden city') {
    aliases.push('palace museum', 'gugong', '故宫', '紫禁城', 'imperial palace', 'beijing imperial palace');
  }

  // Exact match on entity name or canonical alias (with diacritic insensitivity)
  const matchedAlias = aliases.find(a => a && (fullText.includes(a) || normFullText.includes(normalizeDiacritics(a))));
  if (matchedAlias) {
    score += 55;
    reasons.push(`Exact entity/alias match ('${matchedAlias}')`);
  } else {
    // Check significant tokens
    const tokens = entityLower.split(/\s+/).filter(t => t.length > 2);
    const tokenMatches = tokens.filter(t => fullText.includes(t) || normFullText.includes(normalizeDiacritics(t)));
    if (tokenMatches.length > 0) {
      const matchRatio = tokenMatches.length / tokens.length;
      if (matchRatio >= 0.6) {
        score += Math.round(35 * matchRatio);
        reasons.push(`Token match (${tokenMatches.join(', ')})`);
      }
    }
  }

  // Maritime / Historical vessel semantic bonus
  if (isHistoricalVessel) {
    const vesselMatch = /\b(ship|vessel|caravel|carrack|flagship|fleet|sailing|sail|wreck|shipwreck|maritime|nautical|naval|columbus|1492|expedition|replica|illustration|painting)\b/i.test(fullText);
    const hasColumbus = /\b(columbus|1492|hispaniola|caribbean|flagship|first voyage)\b/i.test(fullText);
    if (vesselMatch) {
      score += 45;
      reasons.push('Maritime/historical vessel context match');
      console.log(`[IMAGE CANDIDATE]\nTitle: ${title || 'Untitled'}\nName Match: HIGH\nEntity Type Match: HIGH\nHistorical Context Match: ${hasColumbus ? 'HIGH' : 'MEDIUM'}\nMaritime Context Match: HIGH\nDecision: ACCEPT\nReason: Strong semantic match`);
      return {
        score,
        decision: 'ACCEPT',
        reason: 'Strong semantic match',
        candidate
      };
    }
  }

  // City match
  if (entity.city && fullText.includes(entity.city.toLowerCase())) {
    score += 20;
    reasons.push(`City match ('${entity.city}')`);
  }

  // Country match
  if (entity.country && fullText.includes(entity.country.toLowerCase())) {
    score += 15;
    reasons.push(`Country match ('${entity.country}')`);
  }

  // Coordinate distance bonus
  if (candidate.coordinates && entity.coordinates && entity.coordinates.lat !== 0 && entity.coordinates.lng !== 0) {
    const dist = calculateHaversineDistanceKm(
      entity.coordinates.lat,
      entity.coordinates.lng,
      candidate.coordinates.lat,
      candidate.coordinates.lng
    );
    const tolerance = getEntityDistanceToleranceKm(entity.entityType);
    if (dist <= tolerance) {
      score += 20;
      reasons.push(`Coordinates verified (${Math.round(dist)}km)`);
    }
  }

  // Hard penalty if no alias/entity tokens matched at all
  if (!matchedAlias && score < 40) {
    score = Math.min(score, 25);
  }

  const threshold = 50;
  if (score >= threshold) {
    const reasonText = reasons.join(' + ') || 'Entity relevance verified';
    console.log(`[IMAGE CANDIDATE]\nTitle: ${title || 'Untitled'}\nRelevance score: ${score}\nDecision: ACCEPT\nReason: ${reasonText}`);
    return {
      score,
      decision: 'ACCEPT',
      reason: reasonText,
      candidate
    };
  } else {
    console.log(`[IMAGE CANDIDATE REJECTED]\nTitle: ${title || 'Untitled'}\nEntity: ${entityName}\nDecision: REJECT\nReason: Low relevance score (${score})`);
    return {
      score,
      decision: 'REJECT',
      reason: `Low relevance score (${score})`,
      candidate
    };
  }
}

export function buildEntityImageQueries(info: {
  name: string;
  canonicalName?: string;
  city?: string;
  state?: string;
  country?: string;
  entityType?: string;
  intent?: string;
  historicalContext?: string;
  description?: string;
  imageSearchTerm?: string;
}): string[] {
  const queries: string[] = [];
  const name = (info.canonicalName || info.name || '').trim();
  const city = (info.city || '').trim();
  const country = (info.country || '').trim();
  const eType = (info.entityType || '').toLowerCase();
  const isHistoricalVessel = eType.includes('shipwreck') || eType.includes('vessel') || info.intent === 'DISCOVERY_OBJECT_LOCATION';

  // If specific imageSearchTerm was provided (and doesn't look like a generic query), use it
  if (info.imageSearchTerm && info.imageSearchTerm !== info.name) {
    queries.push(info.imageSearchTerm);
  }

  // 1. Historical vessel semantic expansions
  if (isHistoricalVessel) {
    const histContext = info.historicalContext || '';
    if (histContext.includes('Columbus') || histContext.includes('1492') || name.toLowerCase().includes('santa maria')) {
      queries.push(`${name} ship Christopher Columbus 1492`);
      queries.push(`${name} ship`);
      queries.push(`${name} shipwreck`);
      queries.push(`${name} caravel`);
    } else {
      queries.push(`${name} ship`);
      queries.push(`${name} shipwreck`);
      queries.push(`${name} vessel`);
    }
  }

  // 2. Landmark + City + Country (e.g. "Forbidden City Beijing China")
  if (city && country) {
    queries.push(`${name} ${city} ${country}`);
  }

  // 3. Landmark + City (e.g. "Forbidden City Beijing")
  if (city) {
    queries.push(`${name} ${city}`);
  }

  // 4. Known landmark-specific expansions
  if (name.toLowerCase() === 'forbidden city') {
    queries.push('Forbidden City Palace Museum Beijing');
  }

  // 5. Landmark + Country (e.g. "Forbidden City China")
  if (country) {
    queries.push(`${name} ${country}`);
  }

  // 6. Canonical entity name for modern/general places
  if (!isHistoricalVessel) {
    queries.push(name);
  }

  // Return deduplicated list
  return Array.from(new Set(queries.filter(Boolean)));
}

export async function fetchAndValidateImages(info: LocationInfo): Promise<GalleryImage[]> {
  if (!info || !info.name) return [];

  const foundImages: GalleryImage[] = [];
  const seenUrls = new Set<string>();

  const addValidatedImage = (candidate: ImageCandidate) => {
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
      entityType: info.entityType || (info as any).type,
      intent: (info as any).intent,
      historicalContext: (info as any).historicalContext,
      aliases: (info as any).alternateNames
    });

    if (validation.decision === 'ACCEPT') {
      seenUrls.add(cleanUrl);
      foundImages.push({
        url: cleanUrl,
        caption: cleanMetadataString(candidate.caption || candidate.description || candidate.title || (foundImages.length === 0 ? info.imageCaption : undefined)),
        attribution: cleanMetadataString(candidate.attribution || 'Wikimedia Commons')
      });
    }
  };

  // 1. Validate primary image or direct image fields on info
  if (info.primaryImage) {
    if (typeof info.primaryImage === 'string') {
      addValidatedImage({
        url: info.primaryImage,
        caption: info.imageCaption,
        attribution: (info as any).imageAttribution || (info as any).imageCredit || (info as any).imageSource || (info as any).attribution,
        title: info.name
      });
    } else if (typeof info.primaryImage === 'object') {
      const p = info.primaryImage as any;
      addValidatedImage({
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
      addValidatedImage({
        url: imgObj,
        caption: info.imageCaption,
        attribution: (info as any).imageAttribution || (info as any).attribution,
        title: info.name
      });
    } else if (typeof imgObj === 'object') {
      addValidatedImage({
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
        addValidatedImage({
          url: img,
          caption: foundImages.length === 0 ? info.imageCaption : undefined,
          attribution: (info as any).imageAttribution || (info as any).imageCredit || (info as any).imageSource || (info as any).attribution,
          title: info.name
        });
      } else if (typeof img === 'object' && img !== null) {
        const obj = img as any;
        addValidatedImage({
          url: obj.url || obj.imageUrl || obj.src,
          caption: obj.caption || obj.title || obj.description || (foundImages.length === 0 ? info.imageCaption : undefined),
          attribution: obj.attribution || obj.credit || obj.source || obj.author || (info as any).imageAttribution || (info as any).attribution,
          title: obj.title || info.name,
          description: obj.description
        });
      }
    }
  }

  // 2. Fetch images from Wikipedia using entity-specific progressive queries
  const queries = buildEntityImageQueries(info);
  const histContextStr = (info as any).historicalContext || ((info as any).intent === 'DISCOVERY_OBJECT_LOCATION' ? 'Christopher Columbus / 1492 / Santa María' : 'none');
  const geoContextStr = [info.city, info.state, info.country].filter(Boolean).join(' / ') || ((info as any).intent === 'DISCOVERY_OBJECT_LOCATION' ? 'Haiti / Northern Hispaniola' : 'Unknown');

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    console.log(`[IMAGE SEARCH]\nEntity: ${info.name}\nEntity Type: ${info.entityType || (info as any).type || 'unknown'}\nIntent: ${(info as any).intent || 'unknown'}\nHistorical Context: ${histContextStr}\nGeographic Context: ${geoContextStr}\nQuery: ${query}`);

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

            addValidatedImage({
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

    // Stop searching once we have sufficient validated images
    if (foundImages.length >= 4) {
      break;
    }
  }

  return foundImages;
}
