import { LocationInfo } from '../types';
import { cleanMetadataString, formatImageAttribution, GalleryImage } from '../components/InfoPanel';
import { searchImageRegistry, canonicalizeImageUrl } from './imageDeduplicationService';
import { getHistoricalEntityKnowledge } from './geographic/historicalCoordinateValidator';
import { stripDiacritics, areEntitiesMatchingWithDiacritics, getUnicodeNormalizedForms } from './geographic/geographicNormalization';
import { logTraceNarration } from './waypointPipelineService';

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
  | 'LANDMARK_ENTITY'
  | 'GEOGRAPHIC_FEATURE'
  | 'LOCATION_REPRESENTATIVE'
  | 'HISTORICAL_WAYPOINT'
  | 'TOPIC_REPRESENTATIVE';

export type ImageRelevanceTier = 1 | 2 | 3 | 4;

export type ImageIntentCategory =
  | 'PHYSICAL_LOCATION'
  | 'PHOTOGRAPH'
  | 'HISTORICAL_PHOTOGRAPH'
  | 'HISTORICAL_EVENT'
  | 'MAP'
  | 'COAT_OF_ARMS'
  | 'FLAG'
  | 'SEAL'
  | 'LOGO'
  | 'PAINTING'
  | 'ILLUSTRATION'
  | 'DIAGRAM'
  | 'PORTRAIT'
  | 'SYMBOLIC_GRAPHIC'
  | 'ARCHITECTURAL_DRAWING'
  | 'GENERAL_VISUAL'
  | 'UNKNOWN';

export type CandidateMediaType =
  | 'PHOTOGRAPH'
  | 'HISTORICAL_PHOTOGRAPH'
  | 'PANORAMA_PHOTOGRAPH'
  | 'LOCATION_VIEW'
  | 'ILLUSTRATION'
  | 'MAP'
  | 'DIAGRAM'
  | 'LOGO'
  | 'COAT_OF_ARMS'
  | 'SEAL'
  | 'FLAG'
  | 'ICON'
  | 'PORTRAIT'
  | 'ORGANIZATION_GRAPHIC'
  | 'ARCHITECTURAL_DRAWING'
  | 'PAINTING'
  | 'OTHER_NON_PHOTOGRAPH'
  | 'UNKNOWN';

export interface ImageValidationResult {
  score: number;
  decision: 'ACCEPT' | 'REJECT';
  reason: string;
  candidate: ImageCandidate;
  tier?: ImageRelevanceTier;
  mediaType?: CandidateMediaType;
  photographicSuitability?: 'HIGH' | 'MEDIUM' | 'NONE';
  intentCompatibility?: 'HIGH' | 'MEDIUM' | 'LOW' | 'INCOMPATIBLE';
}

export type ResolvedImageIntentType = 'ENTITY_SPECIFIC' | 'GENERIC_TOPIC' | 'UNRESOLVED';

export interface ResolvedImageIntent {
  type: ResolvedImageIntentType;
  category?: ImageIntentCategory;
  explicitMediaIntent?: boolean;
  intentReason?: string;
  query?: string;
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

export function logImagePolicyRouting(params: {
  entity: string;
  entityType?: string;
  historicalContext?: string;
  routeContext?: string;
  selectedPolicy: string;
  reason: string;
}): void {
  console.log(`[IMAGE POLICY ROUTING]
entity="${params.entity}"
entityType="${params.entityType || 'unknown'}"
historicalContext="${params.historicalContext || 'none'}"
routeContext="${params.routeContext || 'none'}"
selectedPolicy="${params.selectedPolicy}"
reason="${params.reason}"`);
}

export function logImageCandidateValidation(params: {
  candidate: string;
  entityMatch: string;
  entityMatchReason: string;
  geographicMatch: string;
  geographicMatchReason: string;
  policy: string;
  accepted: boolean;
  rejectionReason: string;
}): void {
  console.log(`[IMAGE CANDIDATE VALIDATION]
candidate="${params.candidate}"
entityMatch=${params.entityMatch}
entityMatchReason="${params.entityMatchReason}"
geographicMatch=${params.geographicMatch}
geographicMatchReason="${params.geographicMatchReason}"
policy="${params.policy}"
accepted=${params.accepted}
rejectionReason="${params.rejectionReason}"`);
}

export function logImageFallback(params: {
  initialCandidateCount: number;
  initialAcceptedCount: number;
  fallbackTriggered: boolean;
  fallbackPolicy: string;
  fallbackAcceptedCount: number;
}): void {
  console.log(`[IMAGE FALLBACK]
initialCandidateCount=${params.initialCandidateCount}
initialAcceptedCount=${params.initialAcceptedCount}
fallbackTriggered=${params.fallbackTriggered}
fallbackPolicy="${params.fallbackPolicy}"
fallbackAcceptedCount=${params.fallbackAcceptedCount}`);
}

export function logImageMediaValidation(params: {
  candidate: string;
  mediaType: CandidateMediaType;
  mediaTypeEvidence?: string;
  photographicSuitability: 'HIGH' | 'MEDIUM' | 'NONE';
  intentCompatibility: 'HIGH' | 'MEDIUM' | 'LOW' | 'INCOMPATIBLE';
  decision: 'ACCEPT' | 'REJECT';
  reason?: string;
  rejectionReason?: string;
  imageIntent?: ImageIntentCategory;
}): void {
  const lines = [
    '[IMAGE MEDIA VALIDATION]',
    `candidate="${params.candidate}"`,
    `mediaType=${params.mediaType}`
  ];
  if (params.imageIntent) {
    lines.push(`imageIntent=${params.imageIntent}`);
  }
  if (params.mediaTypeEvidence) {
    lines.push(`mediaTypeEvidence="${params.mediaTypeEvidence}"`);
  }
  lines.push(`photographicSuitability=${params.photographicSuitability}`);
  lines.push(`intentCompatibility=${params.intentCompatibility}`);
  lines.push(`decision=${params.decision}`);
  if (params.decision === 'REJECT' && params.rejectionReason) {
    lines.push(`rejectionReason=${params.rejectionReason}`);
  } else if (params.reason) {
    lines.push(`reason=${params.reason}`);
  }
  console.log(lines.join('\n'));
}

export function logImageIntent(intent: ResolvedImageIntent): void {
  const lines = [
    '[IMAGE INTENT]',
    `query="${intent.query || intent.entity || intent.topic || 'none'}"`,
    `intent=${intent.category || intent.type}`,
    `explicitMediaIntent=${Boolean(intent.explicitMediaIntent)}`,
    `reason="${intent.intentReason || (intent.explicitMediaIntent ? 'Explicit media type detected' : (intent.category === 'HISTORICAL_EVENT' ? 'Historical event context' : 'Default physical-location search'))}"`,
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

/**
 * Detects the user's visual image intent category from the query, entity name, and context.
 */
export function detectImageIntentCategory(
  query: string = '',
  name: string = '',
  entityType: string = '',
  context: string = ''
): {
  category: ImageIntentCategory;
  explicitMediaIntent: boolean;
  reason: string;
} {
  const queryLower = query.toLowerCase().trim();
  const nameLower = name.toLowerCase().trim();
  const contextLower = context.toLowerCase().trim();

  // 1. Explicit Media Request Detection from Query or Name
  // Coat of Arms
  if (/\b(?:coats?\s+of\s+arms|arms\s+of|heraldic\s+arms|heraldry|blazon|armoiries|escudo\s+de|stemma\s+di|wappen)\b/i.test(queryLower || nameLower)) {
    return {
      category: 'COAT_OF_ARMS',
      explicitMediaIntent: true,
      reason: 'Explicit media type detected'
    };
  }

  // Flag
  if (/\b(?:flags?|national\s+flag|state\s+flag|civil\s+flag|ensign|standard|pennant|bandera|drapeau|flaggen)\b/i.test(queryLower || nameLower)) {
    return {
      category: 'FLAG',
      explicitMediaIntent: true,
      reason: 'Explicit media type detected'
    };
  }

  // Seal
  if (/\b(?:seals?|state\s+seal|great\s+seal|official\s+seal|papal\s+seal|sceau|sello)\b/i.test(queryLower || nameLower)) {
    return {
      category: 'SEAL',
      explicitMediaIntent: true,
      reason: 'Explicit media type detected'
    };
  }

  // Logo / Emblem
  if (/\b(?:logos?|emblems?|insignia|crests?|badges?)\b/i.test(queryLower || nameLower)) {
    return {
      category: 'LOGO',
      explicitMediaIntent: true,
      reason: 'Explicit media type detected'
    };
  }

  // Map
  if (/\b(?:maps?|mapping|cartography|battle\s+map|topographic\s+map|atlas|karte|carte|mappa|planta)\b/i.test(queryLower || nameLower)) {
    return {
      category: 'MAP',
      explicitMediaIntent: true,
      reason: 'Explicit media type detected'
    };
  }

  // Painting
  if (/\b(?:paintings?|oil\s+painting|watercolors?|frescoes?|fresco|canvas\s+art|fine\s+art)\b/i.test(queryLower || nameLower)) {
    return {
      category: 'PAINTING',
      explicitMediaIntent: true,
      reason: 'Explicit media type detected'
    };
  }

  // Illustration / Drawing
  if (/\b(?:illustrations?|historical\s+illustrations?|drawings?|sketches?|engravings?|etchings?|woodcuts?|lithographs?)\b/i.test(queryLower || nameLower)) {
    return {
      category: 'ILLUSTRATION',
      explicitMediaIntent: true,
      reason: 'Explicit media type detected'
    };
  }

  // Diagram
  if (/\b(?:diagrams?|charts?|schematics?|infographics?|cross[- ]sections?|graphs?)\b/i.test(queryLower || nameLower)) {
    return {
      category: 'DIAGRAM',
      explicitMediaIntent: true,
      reason: 'Explicit media type detected'
    };
  }

  // Architectural Drawing / Blueprint
  if (/\b(?:architectural\s+drawings?|blueprints?|elevations?|floor\s+plans?|section\s+drawings?)\b/i.test(queryLower || nameLower)) {
    return {
      category: 'ARCHITECTURAL_DRAWING',
      explicitMediaIntent: true,
      reason: 'Explicit media type detected'
    };
  }

  // Portrait
  if (/\b(?:portraits?|self[- ]portraits?|busts?)\b/i.test(queryLower || nameLower)) {
    return {
      category: 'PORTRAIT',
      explicitMediaIntent: true,
      reason: 'Explicit media type detected'
    };
  }

  // Historical Photograph (e.g. "historical photos of Vatican City", "what did Vatican City look like in 1944?")
  if (
    /\b(?:historical\s+(?:photos?|photographs?|pictures?|images?)|vintage\s+(?:photos?|photographs?|pictures?)|archival\s+(?:photos?|photographs?)|what\s+did\s+.+?\s+look\s+like\s+in\s+\d{4}|old\s+photos?\s+of|\b(?:18|19)\d{2}s?\s+(?:photos?|photographs?))\b/i.test(queryLower || nameLower)
  ) {
    return {
      category: 'HISTORICAL_PHOTOGRAPH',
      explicitMediaIntent: true,
      reason: 'Explicit media type detected'
    };
  }

  // Photograph (explicit "photos of ...", "pictures of ...", "photographs", "photography", "battlefield photos")
  if (
    /\b(?:photos?|photographs?|pictures?|pics?|photography|aerial\s+photos?|street\s+view|battlefield\s+photos?)\b/i.test(queryLower) ||
    /^\s*(?:photos?|pictures?|images?)\s+of\b/i.test(nameLower)
  ) {
    return {
      category: 'PHOTOGRAPH',
      explicitMediaIntent: true,
      reason: 'Explicit media type detected'
    };
  }

  // 2. Historical Event Context (Non-Explicit Media)
  const isHistoricalEvent =
    /\b(?:battle\s+of|siege\s+of|treaty\s+of|expedition\s+of|voyage\s+of|crusade|campaign\s+of|war\s+of|revolution\s+of)\b/i.test(queryLower || nameLower || contextLower) ||
    /battle|historical_event|expedition|siege/i.test(entityType || '');

  if (isHistoricalEvent) {
    return {
      category: 'HISTORICAL_EVENT',
      explicitMediaIntent: false,
      reason: 'Historical event context'
    };
  }

  // 3. Default Physical Location Search
  return {
    category: 'PHYSICAL_LOCATION',
    explicitMediaIntent: false,
    reason: 'Default physical-location search'
  };
}

/**
 * Classifies candidate media based on metadata, title, caption, description, and file characteristics.
 */
export function classifyCandidateMedia(candidate: ImageCandidate): {
  mediaType: CandidateMediaType;
  evidence: string;
} {
  const title = (candidate.title || '').trim();
  const desc = (candidate.description || candidate.caption || '').trim();
  const url = (candidate.url || '').toLowerCase();
  const fullText = `${title} ${desc} ${url}`.toLowerCase();
  const isSvg = url.includes('.svg') || fullText.includes('.svg');

  // 1. Coat of Arms / Heraldry
  if (
    /\b(?:coats?\s+of\s+arms|arms\s+of|escudo\s+de|armoiries\s+de|wappen|stemma\s+di|blason\s+de|heraldic\s+arms|heraldry|lesser\s+coat\s+of\s+arms|greater\s+coat\s+of\s+arms)\b/i.test(fullText) ||
    /coat_of_arms|arms_of|escudo_de|wappen/i.test(url)
  ) {
    return {
      mediaType: 'COAT_OF_ARMS',
      evidence: 'Title, description, or filename indicates coat of arms / heraldic emblem'
    };
  }

  // 2. Flag / Standard / Ensign
  if (
    /\b(?:flags?\s+of|national\s+flag|state\s+flag|civil\s+flag|bandera\s+de|drapeau\s+de|flagge\s+von|naval\s+ensign|royal\s+standard|presidential\s+standard)\b/i.test(fullText) ||
    /flag_of|bandera_de|drapeau_de/i.test(url)
  ) {
    return {
      mediaType: 'FLAG',
      evidence: 'Title, description, or filename indicates national, state, or civil flag'
    };
  }

  // 3. Seal
  if (
    /\b(?:seals?\s+of|state\s+seal|great\s+seal|official\s+seal|papal\s+seal|sceau\s+de|sello\s+de|siegel\s+von)\b/i.test(fullText) ||
    /seal_of|state_seal|great_seal/i.test(url)
  ) {
    return {
      mediaType: 'SEAL',
      evidence: 'Title, description, or filename indicates official seal'
    };
  }

  // 4. Logo / Organization Graphic / Unit Insignia
  if (
    /\b(?:official\s+logo|team\s+logo|sports?\s+logo|wordmark|insignia|emblem\s+of|badge\s+of|football\s+team\s+logo|national\s+football\s+team)\b/i.test(fullText) ||
    /\b(?:pontifical\s+commission|corps\s+of\s+gendarmerie|gendarmerie\s+corps|swiss\s+guard\s+uniform|swiss\s+guard\s+insignia|organization\s+graphic|organizational\s+chart)\b/i.test(fullText) ||
    /_logo\./i.test(url) || /_emblem\./i.test(url)
  ) {
    const isOrg = /\b(?:pontifical\s+commission|corps\s+of\s+gendarmerie|gendarmerie\s+corps|organization\s+graphic)\b/i.test(fullText);
    return {
      mediaType: isOrg ? 'ORGANIZATION_GRAPHIC' : 'LOGO',
      evidence: isOrg
        ? 'Title or metadata indicates organizational graphic / administrative unit graphic'
        : 'Title, description, or filename indicates organization, team, or brand logo/emblem'
    };
  }

  // 5. Map / Cartography
  if (
    /\b(?:maps?\s+of|locator\s+map|location\s+map|route\s+map|topographic\s+map|orthographic\s+map|cartography|relief\s+map|karte\s+von|carte\s+de|mappa\s+di|battle\s+map|geographic\s+map|papal\s+states\s+map|geographic\s+diagram)\b/i.test(fullText) ||
    /_map[._]|_in_.*_locator|locator_map/i.test(url)
  ) {
    return {
      mediaType: 'MAP',
      evidence: 'Title, description, or filename indicates geographic map or plan'
    };
  }

  // 6. Diagram / Technical Chart
  if (/\b(?:diagram|flowchart|schematic|infographic|cross[- ]section|graph\s+of|histogram|organigram|schema)\b/i.test(fullText)) {
    return {
      mediaType: 'DIAGRAM',
      evidence: 'Title or metadata indicates technical diagram, chart, or infographic'
    };
  }

  // 7. Architectural Drawing / Blueprint
  if (/\b(?:architectural\s+drawing|blueprint|elevation\s+drawing|floor\s+plan|cross-section\s+drawing|section\s+drawing)\b/i.test(fullText)) {
    return {
      mediaType: 'ARCHITECTURAL_DRAWING',
      evidence: 'Title or metadata indicates architectural drawing / blueprint'
    };
  }

  // 8. Icon
  if (/\b(?:icon\b|favicon|pictogram|symbol\s+icon|bullet\s+icon)\b/i.test(fullText)) {
    return {
      mediaType: 'ICON',
      evidence: 'Title or metadata indicates icon or pictogram'
    };
  }

  // 9. Portrait (unrelated person / painted portrait / bust)
  if (
    /\b(?:portrait\s+of|oil\s+portrait|painted\s+portrait|self[- ]portrait|bust\s+of)\b/i.test(fullText)
  ) {
    return {
      mediaType: 'PORTRAIT',
      evidence: 'Title or metadata indicates portrait of an individual'
    };
  }

  // 10. Painting / Fresco / Tapestry
  if (
    /\b(?:paintings?\s+by|historical\s+painting|oil\s+on\s+canvas|fresco\s+by|fresco\b|tempera\s+on|acrylic\s+on|canvas\s+painting|painted\s+by|bayeux\s+tapestry|\bpainting\b)\b/i.test(fullText) ||
    /^\s*painting\s+of\b/i.test(title)
  ) {
    return {
      mediaType: 'PAINTING',
      evidence: 'Title or metadata indicates artistic painting, fresco, canvas, or tapestry'
    };
  }

  // 11. Historical Illustration / Engraving / Woodcut
  if (
    /\b(?:historical\s+illustration|woodcut|engraving|etching|lithograph|sketch\s+of|drawing\s+of|miniature\s+illustration|artistic\s+depiction)\b/i.test(fullText)
  ) {
    return {
      mediaType: 'ILLUSTRATION',
      evidence: 'Title or metadata indicates historical illustration, engraving, woodcut, or drawing'
    };
  }

  // 12. Historical Photograph (e.g. 1944 photograph in Vatican City, 19th-century photo)
  if (
    /\b(?:historical\s+photo|vintage\s+photo|archival\s+photo|taken\s+in\s+(?:18\d{2}|19[0-7]\d)|\b(?:18|19)\d{2}\s+(?:photo|photograph)|c\.\s*19\d{2}|circa\s+19\d{2}|daguerreotype|gelatin\s+silver|black\s+and\s+white\s+photograph\s+from\s+(?:18|19)\d\d)\b/i.test(fullText)
  ) {
    return {
      mediaType: 'HISTORICAL_PHOTOGRAPH',
      evidence: 'Metadata indicates historical / vintage / archival photograph'
    };
  }

  // 13. Panorama Photograph
  if (/\b(?:panorama\s+of|panoramic\s+view|panoramic\s+photo|wide-angle\s+view)\b/i.test(fullText)) {
    return {
      mediaType: 'PANORAMA_PHOTOGRAPH',
      evidence: 'Metadata indicates panoramic photograph'
    };
  }

  // 14. Non-photographic SVG Fallback
  if (isSvg) {
    return {
      mediaType: 'OTHER_NON_PHOTOGRAPH',
      evidence: 'Vector SVG graphic without confirmed photographic subject'
    };
  }

  // 15. Physical Landmark / Location View / Photograph
  if (
    /\b(?:basilica|cathedral|square|piazza|gardens?|park|palace|castle|tower|monument|obelisk|building|facade|interior|street|bridge|river|mountain|canyon|waterfall|ruins|view|aerial|harbor|skyline)\b/i.test(fullText)
  ) {
    return {
      mediaType: 'LOCATION_VIEW',
      evidence: 'Photograph of physical landmark / location / architecture'
    };
  }

  return {
    mediaType: 'PHOTOGRAPH',
    evidence: 'Standard photograph / raster image'
  };
}

/**
 * Returns the photographic suitability level for location viewing.
 */
export function getPhotographicSuitability(mediaType: CandidateMediaType): 'HIGH' | 'MEDIUM' | 'NONE' {
  switch (mediaType) {
    case 'PHOTOGRAPH':
    case 'HISTORICAL_PHOTOGRAPH':
    case 'PANORAMA_PHOTOGRAPH':
    case 'LOCATION_VIEW':
      return 'HIGH';
    case 'UNKNOWN':
      return 'MEDIUM';
    case 'COAT_OF_ARMS':
    case 'FLAG':
    case 'SEAL':
    case 'LOGO':
    case 'ORGANIZATION_GRAPHIC':
    case 'MAP':
    case 'DIAGRAM':
    case 'ICON':
    case 'ARCHITECTURAL_DRAWING':
    case 'PORTRAIT':
    case 'PAINTING':
    case 'ILLUSTRATION':
    case 'OTHER_NON_PHOTOGRAPH':
    default:
      return 'NONE';
  }
}

/**
 * Evaluates the compatibility between user image intent and candidate media type.
 */
export function getIntentMediaCompatibility(
  intentCategory: ImageIntentCategory,
  mediaType: CandidateMediaType
): {
  compatibility: 'HIGH' | 'MEDIUM' | 'LOW' | 'INCOMPATIBLE';
  isExplicitMatch: boolean;
} {
  if (intentCategory === 'COAT_OF_ARMS') {
    if (mediaType === 'COAT_OF_ARMS') return { compatibility: 'HIGH', isExplicitMatch: true };
    if (mediaType === 'SEAL' || mediaType === 'LOGO') return { compatibility: 'MEDIUM', isExplicitMatch: false };
    if (mediaType === 'PHOTOGRAPH' || mediaType === 'LOCATION_VIEW') return { compatibility: 'LOW', isExplicitMatch: false };
    return { compatibility: 'INCOMPATIBLE', isExplicitMatch: false };
  }

  if (intentCategory === 'FLAG') {
    if (mediaType === 'FLAG') return { compatibility: 'HIGH', isExplicitMatch: true };
    if (mediaType === 'COAT_OF_ARMS' || mediaType === 'SEAL') return { compatibility: 'MEDIUM', isExplicitMatch: false };
    if (mediaType === 'PHOTOGRAPH' || mediaType === 'LOCATION_VIEW') return { compatibility: 'LOW', isExplicitMatch: false };
    return { compatibility: 'INCOMPATIBLE', isExplicitMatch: false };
  }

  if (intentCategory === 'MAP') {
    if (mediaType === 'MAP') return { compatibility: 'HIGH', isExplicitMatch: true };
    if (mediaType === 'ARCHITECTURAL_DRAWING' || mediaType === 'DIAGRAM') return { compatibility: 'MEDIUM', isExplicitMatch: false };
    if (mediaType === 'PHOTOGRAPH' || mediaType === 'LOCATION_VIEW') return { compatibility: 'LOW', isExplicitMatch: false };
    return { compatibility: 'INCOMPATIBLE', isExplicitMatch: false };
  }

  if (intentCategory === 'SEAL') {
    if (mediaType === 'SEAL') return { compatibility: 'HIGH', isExplicitMatch: true };
    if (mediaType === 'COAT_OF_ARMS' || mediaType === 'LOGO') return { compatibility: 'MEDIUM', isExplicitMatch: false };
    if (mediaType === 'PHOTOGRAPH' || mediaType === 'LOCATION_VIEW') return { compatibility: 'LOW', isExplicitMatch: false };
    return { compatibility: 'INCOMPATIBLE', isExplicitMatch: false };
  }

  if (intentCategory === 'LOGO') {
    if (mediaType === 'LOGO' || mediaType === 'ORGANIZATION_GRAPHIC') return { compatibility: 'HIGH', isExplicitMatch: true };
    if (mediaType === 'SEAL' || mediaType === 'COAT_OF_ARMS') return { compatibility: 'MEDIUM', isExplicitMatch: false };
    if (mediaType === 'PHOTOGRAPH' || mediaType === 'LOCATION_VIEW') return { compatibility: 'LOW', isExplicitMatch: false };
    return { compatibility: 'INCOMPATIBLE', isExplicitMatch: false };
  }

  if (intentCategory === 'PAINTING') {
    if (mediaType === 'PAINTING') return { compatibility: 'HIGH', isExplicitMatch: true };
    if (mediaType === 'ILLUSTRATION') return { compatibility: 'MEDIUM', isExplicitMatch: false };
    if (mediaType === 'PHOTOGRAPH' || mediaType === 'LOCATION_VIEW') return { compatibility: 'LOW', isExplicitMatch: false };
    return { compatibility: 'INCOMPATIBLE', isExplicitMatch: false };
  }

  if (intentCategory === 'ILLUSTRATION') {
    if (mediaType === 'ILLUSTRATION') return { compatibility: 'HIGH', isExplicitMatch: true };
    if (mediaType === 'PAINTING' || mediaType === 'ARCHITECTURAL_DRAWING') return { compatibility: 'MEDIUM', isExplicitMatch: false };
    if (mediaType === 'PHOTOGRAPH' || mediaType === 'LOCATION_VIEW') return { compatibility: 'LOW', isExplicitMatch: false };
    return { compatibility: 'INCOMPATIBLE', isExplicitMatch: false };
  }

  if (intentCategory === 'DIAGRAM') {
    if (mediaType === 'DIAGRAM' || mediaType === 'ARCHITECTURAL_DRAWING') return { compatibility: 'HIGH', isExplicitMatch: true };
    if (mediaType === 'MAP') return { compatibility: 'MEDIUM', isExplicitMatch: false };
    return { compatibility: 'INCOMPATIBLE', isExplicitMatch: false };
  }

  if (intentCategory === 'ARCHITECTURAL_DRAWING') {
    if (mediaType === 'ARCHITECTURAL_DRAWING') return { compatibility: 'HIGH', isExplicitMatch: true };
    if (mediaType === 'DIAGRAM' || mediaType === 'MAP') return { compatibility: 'MEDIUM', isExplicitMatch: false };
    return { compatibility: 'INCOMPATIBLE', isExplicitMatch: false };
  }

  if (intentCategory === 'PORTRAIT') {
    if (mediaType === 'PORTRAIT') return { compatibility: 'HIGH', isExplicitMatch: true };
    if (mediaType === 'PAINTING' || mediaType === 'PHOTOGRAPH') return { compatibility: 'MEDIUM', isExplicitMatch: false };
    return { compatibility: 'INCOMPATIBLE', isExplicitMatch: false };
  }

  if (intentCategory === 'HISTORICAL_PHOTOGRAPH') {
    if (mediaType === 'HISTORICAL_PHOTOGRAPH') return { compatibility: 'HIGH', isExplicitMatch: true };
    if (mediaType === 'PHOTOGRAPH' || mediaType === 'PANORAMA_PHOTOGRAPH' || mediaType === 'LOCATION_VIEW') return { compatibility: 'MEDIUM', isExplicitMatch: false };
    return { compatibility: 'INCOMPATIBLE', isExplicitMatch: false };
  }

  if (intentCategory === 'PHOTOGRAPH') {
    if (mediaType === 'PHOTOGRAPH' || mediaType === 'HISTORICAL_PHOTOGRAPH' || mediaType === 'PANORAMA_PHOTOGRAPH' || mediaType === 'LOCATION_VIEW') {
      return { compatibility: 'HIGH', isExplicitMatch: true };
    }
    return { compatibility: 'INCOMPATIBLE', isExplicitMatch: false };
  }

  if (intentCategory === 'HISTORICAL_EVENT') {
    if (
      mediaType === 'PHOTOGRAPH' ||
      mediaType === 'HISTORICAL_PHOTOGRAPH' ||
      mediaType === 'LOCATION_VIEW' ||
      mediaType === 'PAINTING' ||
      mediaType === 'ILLUSTRATION' ||
      mediaType === 'MAP'
    ) {
      return { compatibility: 'HIGH', isExplicitMatch: false };
    }
    if (mediaType === 'DIAGRAM' || mediaType === 'ARCHITECTURAL_DRAWING') {
      return { compatibility: 'MEDIUM', isExplicitMatch: false };
    }
    return { compatibility: 'INCOMPATIBLE', isExplicitMatch: false };
  }

  if (intentCategory === 'PHYSICAL_LOCATION') {
    if (
      mediaType === 'PHOTOGRAPH' ||
      mediaType === 'HISTORICAL_PHOTOGRAPH' ||
      mediaType === 'PANORAMA_PHOTOGRAPH' ||
      mediaType === 'LOCATION_VIEW'
    ) {
      return { compatibility: 'HIGH', isExplicitMatch: false };
    }
    if (mediaType === 'UNKNOWN') {
      return { compatibility: 'MEDIUM', isExplicitMatch: false };
    }
    return { compatibility: 'INCOMPATIBLE', isExplicitMatch: false };
  }

  // GENERAL_VISUAL or UNKNOWN
  if (
    mediaType === 'PHOTOGRAPH' ||
    mediaType === 'HISTORICAL_PHOTOGRAPH' ||
    mediaType === 'LOCATION_VIEW' ||
    mediaType === 'PAINTING' ||
    mediaType === 'ILLUSTRATION'
  ) {
    return { compatibility: 'HIGH', isExplicitMatch: false };
  }
  return { compatibility: 'MEDIUM', isExplicitMatch: false };
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
  const entityTypeString = typeof input === 'string' ? '' : (input.entityType || input.type || '').trim();

  // Detect image intent category
  const detectedIntent = detectImageIntentCategory(
    queryString,
    nameString,
    entityTypeString,
    contextString || routeTitleString
  );

  // 1. Explicit Unknown / Unresolved Intent
  if (intentString.toLowerCase() === 'unknown') {
    const hasMeaningfulQuery = Boolean(queryString && queryString.length > 3);
    const intent: ResolvedImageIntent = {
      type: 'UNRESOLVED',
      category: detectedIntent.category,
      explicitMediaIntent: detectedIntent.explicitMediaIntent,
      intentReason: detectedIntent.reason,
      query: queryString || undefined,
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
      category: detectedIntent.category,
      explicitMediaIntent: detectedIntent.explicitMediaIntent,
      intentReason: detectedIntent.reason,
      query: queryString || undefined,
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
  const isEntityPictureQuery = /^\s*(?:show\s+me\s+(?:pictures|images|photos|the\s+coat\s+of\s+arms|the\s+flag|the\s+map|the\s+seal)\s+of|pictures\s+of|images\s+of|photos\s+of|paintings\s+of|map\s+of)\s+(.+?)\s*[.?!]?\s*$/i.test(queryString);
  if (isEntityPictureQuery || nameString || intentString === 'DIRECT' || intentString === 'NATURAL_LOCATION' || intentString === 'specific_location' || detectedIntent.explicitMediaIntent || queryString) {
    let targetEntity = nameString;
    if (isEntityPictureQuery) {
      const match = queryString.match(/^\s*(?:show\s+me\s+(?:pictures|images|photos|the\s+coat\s+of\s+arms|the\s+flag|the\s+map|the\s+seal)\s+of|pictures\s+of|images\s+of|photos\s+of|paintings\s+of|map\s+of)\s+(.+?)\s*[.?!]?\s*$/i);
      if (match && match[1]) {
        targetEntity = match[1].trim();
      }
    }

    // Clean entity query terms if user typed "Vatican City coat of arms", "Battle of Hastings painting"
    if (!targetEntity && queryString) {
      targetEntity = queryString
        .replace(/^\s*(?:show\s+me\s+(?:the\s+)?|find\s+(?:the\s+)?|search\s+(?:for\s+)?(?:the\s+)?)/i, '')
        .replace(/\b(?:coat\s+of\s+arms|coats\s+of\s+arms|arms\s+of|state\s+seal|official\s+seal|seal\s+of|flags?\s+of|national\s+flag|state\s+flag|logos?\s+of|emblem\s+of|maps?\s+of|battle\s+map\s+of|paintings?\s+of|historical\s+illustrations?\s+of|illustrations?\s+of|historical\s+photos?\s+of|photos?\s+of|pictures?\s+of|images?\s+of)\b/gi, '')
        .replace(/\b(?:coat\s+of\s+arms|coats\s+of\s+arms|flags?|state\s+seal|seals?|logos?|emblems?|maps?|paintings?|illustrations?|drawings?|historical\s+photos?|historical\s+photographs?|photographs?|photos?|pictures?|images?|blueprints?)\b/gi, '')
        .replace(/^\s*(?:of|for|in|at)\s+/i, '')
        .replace(/[?.,!]+$/, '')
        .trim();
    }

    const effectiveTarget = targetEntity || nameString || queryString;
    const rawTarget = typeof input === 'object' ? input : { name: effectiveTarget };

    // Determine Subject Shape & Validation Policy Hierarchy:
    // A. HISTORICAL WAYPOINT (Completely isolated policy)
    if (isHistoricalWaypointEntity(rawTarget)) {
      const histPolicy: ImageValidationPolicy = 'HISTORICAL_WAYPOINT';
      logImagePolicyRouting({
        entity: effectiveTarget,
        entityType: typeof input === 'object' ? (input.entityType || input.type) : undefined,
        historicalContext: contextString,
        routeContext: routeTitleString || (typeof input === 'object' ? (input as any).routeGroupId : undefined),
        selectedPolicy: histPolicy,
        reason: 'Entity has explicit historical route context or explicit historical_waypoint classification'
      });
      return {
        type: 'ENTITY_SPECIFIC',
        category: detectedIntent.category,
        explicitMediaIntent: detectedIntent.explicitMediaIntent,
        intentReason: detectedIntent.reason,
        query: queryString || undefined,
        topic: undefined,
        entity: effectiveTarget,
        entityRequired: true,
        geographicConstraint: true,
        shape: 'SPECIFIC_ENTITY',
        policy: histPolicy,
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
      const isLandmark = /archaeological|historic_site|historic|archaeological_site|ruin|heritage|ancient|temple|pyramid/i.test(eType) ||
        /archaeological/i.test(intentString) ||
        /pyramids?|temples?|monuments?|ruins?|acropolis|colosseum|stonehenge|machu\s+picchu|sphinx/i.test(effectiveTarget);
      policy = isLandmark ? 'LANDMARK_ENTITY' : 'STRICT_ENTITY';
      entityRequired = true;
    }

    logImagePolicyRouting({
      entity: effectiveTarget,
      entityType: eType,
      historicalContext: contextString,
      routeContext: routeTitleString || (typeof input === 'object' ? (input as any).routeGroupId : undefined),
      selectedPolicy: policy,
      reason: policy === 'LANDMARK_ENTITY'
        ? 'Standalone archaeological site, historical landmark, or point of interest without route sequence'
        : (policy === 'STRICT_ENTITY' ? 'Specific named entity search' : 'Feature or location representative search')
    });

    return {
      type: 'ENTITY_SPECIFIC',
      category: detectedIntent.category,
      explicitMediaIntent: detectedIntent.explicitMediaIntent,
      intentReason: detectedIntent.reason,
      query: queryString || undefined,
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
    category: detectedIntent.category,
    explicitMediaIntent: detectedIntent.explicitMediaIntent,
    intentReason: detectedIntent.reason,
    query: queryString || undefined,
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
    type === 'poi' ||
    /\bpoi\b/.test(type) ||
    type.includes('temple') ||
    type.includes('palace') ||
    type.includes('church') ||
    type.includes('castle') ||
    type.includes('ruin') ||
    type.includes('square')
  ) {
    return 15; // Strict 15km radius for specific physical landmarks
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
    type.includes('natural') ||
    type.includes('waypoint') ||
    type.includes('historical')
  ) {
    return 25; // 25km radius for natural features and historical waypoints
  }
  if (type.includes('city') || type.includes('town') || type.includes('village') || type.includes('settlement')) {
    return 35; // 35km radius for cities/towns
  }
  if (type.includes('state') || type.includes('province') || type.includes('region') || type.includes('county')) {
    return 250; // Regional radius
  }
  if (type.includes('country') || type.includes('nation')) {
    return 1500; // Country-level radius
  }
  return 15;
}

export function isGenericFlagOrEmblem(
  title: string = '',
  description: string = '',
  entityName: string = '',
  imageIntent?: ResolvedImageIntent
): boolean {
  if (
    imageIntent &&
    (imageIntent.category === 'FLAG' ||
      imageIntent.category === 'COAT_OF_ARMS' ||
      imageIntent.category === 'SEAL' ||
      imageIntent.category === 'LOGO' ||
      imageIntent.category === 'SYMBOLIC_GRAPHIC' ||
      imageIntent.explicitMediaIntent)
  ) {
    return false;
  }
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
  return stripDiacritics(str).toLowerCase();
}

export type ImageEvidenceType =
  | 'EXACT_ENTITY'
  | 'KNOWN_ALIAS'
  | 'DIRECT_ENTITY_SOURCE'
  | 'COMPONENT'
  | 'SUBFEATURE'
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
  const normFullText = stripDiacritics(fullText).toLowerCase();
  if (allTargetAliases.some(a => fullText.includes(a) || normFullText.includes(stripDiacritics(a).toLowerCase()))) {
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

export type EntityMatchLevel = 'EXACT' | 'CANONICAL' | 'ALIAS' | 'COMPONENT' | 'SUBFEATURE' | 'PARTIAL' | 'HIGH' | 'MEDIUM' | 'NONE';

export function deriveEntityAliases(
  entityName: string,
  canonicalName?: string,
  additionalAliases?: string[]
): {
  exactAliases: string[];
  canonicalAliases: string[];
  alternateAliases: string[];
  componentAliases: string[];
} {
  const exactSet = new Set<string>();
  const canonicalSet = new Set<string>();
  const alternateSet = new Set<string>();
  const componentSet = new Set<string>();

  const addExact = (s: string) => {
    const clean = s.trim().toLowerCase();
    if (clean.length >= 2) exactSet.add(clean);
  };
  const addCanonical = (s: string) => {
    const clean = s.trim().toLowerCase();
    if (clean.length >= 2) canonicalSet.add(clean);
  };
  const addAlternate = (s: string) => {
    const clean = s.trim().toLowerCase();
    if (clean.length >= 2) alternateSet.add(clean);
  };
  const addComponent = (s: string) => {
    const clean = s.trim().toLowerCase();
    if (clean.length >= 2) componentSet.add(clean);
  };

  const rawPrimaryNames = [entityName, canonicalName].filter(Boolean) as string[];
  const primaryNames: string[] = [];
  for (const name of rawPrimaryNames) {
    primaryNames.push(name);
    const stripped = name.replace(/\s*\([^)]*\)/g, '').trim();
    if (stripped && stripped.toLowerCase() !== name.toLowerCase()) {
      primaryNames.push(stripped);
    }
    const parenMatch = name.match(/\(([^)]+)\)/);
    if (parenMatch && parenMatch[1].trim()) {
      addAlternate(parenMatch[1].trim());
    }
  }

  for (const name of primaryNames) {
    addExact(name);
    addCanonical(name);
    const noArticle = name.replace(/^(?:the|a|an)\s+/i, '').trim();
    if (noArticle) {
      addExact(noArticle);
      addCanonical(noArticle);

      // 1. Symmetrical Inversion: "[Noun(s)] of/do/da/de/del/du/di [Location/Person]" <-> "[Location/Person] [Noun(s)]"
      // e.g. "Pyramids of Giza" <-> "Giza Pyramids", "Caldeirão do Inferno" <-> "Inferno Caldeirão"
      const ofMatch = noArticle.match(/^(.+?)\s+(?:of|do|da|de|del|du|di)\s+(?:the\s+|a\s+|an\s+|o\s+|a\s+|os\s+|as\s+|il\s+|lo\s+|la\s+|i\s+|gli\s+|le\s+|el\s+)?(.+)$/i);
      if (ofMatch) {
        const noun = ofMatch[1].trim();
        const loc = ofMatch[2].trim();
        addCanonical(`${loc} ${noun}`);
        addAlternate(`${loc} ${noun}`);

        // Singular / Plural conversions
        const singularNoun = noun.replace(/s$/i, '');
        const pluralNoun = noun.endsWith('s') ? noun : `${noun}s`;
        addCanonical(`${loc} ${singularNoun}`);
        addCanonical(`${loc} ${pluralNoun}`);
        addCanonical(`${noun} of ${loc}`);
        addCanonical(`${singularNoun} of ${loc}`);
        addCanonical(`${pluralNoun} of ${loc}`);

        // Structural complex suffixes
        addAlternate(`${loc} ${singularNoun} complex`);
        addAlternate(`${loc} ${pluralNoun} complex`);
      }

      // 2. Inversion: "[Location] [Noun(s)]" -> "[Noun(s)] of [Location]"
      // e.g. "Giza Pyramids" -> "Pyramids of Giza"
      const locNounMatch = noArticle.match(/^([a-z0-9\s'-]+?)\s+(pyramids?|canals?|ruins?|temples?|tombs?|caves?|towers?|castles?|falls?|islands?)$/i);
      if (locNounMatch) {
        const loc = locNounMatch[1].trim();
        const noun = locNounMatch[2].trim();
        const singularNoun = noun.replace(/s$/i, '');
        const pluralNoun = noun.endsWith('s') ? noun : `${noun}s`;
        addCanonical(`${noun} of ${loc}`);
        addCanonical(`${singularNoun} of ${loc}`);
        addCanonical(`${pluralNoun} of ${loc}`);
        addCanonical(`${loc} ${singularNoun}`);
        addCanonical(`${loc} ${pluralNoun}`);
        addAlternate(`${loc} ${singularNoun} complex`);
        addAlternate(`${loc} ${pluralNoun} complex`);
      }

      // 3. Clean Base Landmark Suffix Truncation
      const cleanBase = noArticle
        .replace(/\s+(?:shipwreck|wreck location|discovery site|wreck site|wreck|ship|archaeological site|movie set|film set|set|site|monument|memorial|historic site|ruins|battlefield|complex|plateau|necropolis|park|national park|sanctuary)$/i, '')
        .trim();

      if (cleanBase && cleanBase.length >= 3 && cleanBase.toLowerCase() !== noArticle.toLowerCase()) {
        addAlternate(cleanBase);
      }
    }
  }

  for (const alias of (additionalAliases || [])) {
    if (alias) {
      addAlternate(alias);
      const noArticle = alias.replace(/^(?:the|a|an)\s+/i, '').trim();
      if (noArticle) {
        addAlternate(noArticle);
        const ofMatch = noArticle.match(/^(.+?)\s+of\s+(?:the\s+)?(.+)$/i);
        if (ofMatch) {
          const noun = ofMatch[1].trim();
          const loc = ofMatch[2].trim();
          addAlternate(`${loc} ${noun}`);
          const singularNoun = noun.replace(/s$/i, '');
          const pluralNoun = noun.endsWith('s') ? noun : `${noun}s`;
          addAlternate(`${loc} ${singularNoun}`);
          addAlternate(`${loc} ${pluralNoun}`);
          addAlternate(`${noun} of ${loc}`);
          addAlternate(`${singularNoun} of ${loc}`);
          addAlternate(`${pluralNoun} of ${loc}`);
          addAlternate(`${loc} ${singularNoun} complex`);
          addAlternate(`${loc} ${pluralNoun} complex`);
        }
      }
    }
  }

  // 4. Curated Component Landmarks for complex world-renowned sites
  const combined = [...primaryNames, ...(additionalAliases || [])].join(' ').toLowerCase();
  if (combined.includes('giza') || (combined.includes('pyramid') && (combined.includes('khufu') || combined.includes('cheops') || combined.includes('egypt')))) {
    addComponent('great pyramid of giza');
    addComponent('great pyramid');
    addComponent('pyramid of khufu');
    addComponent('pyramid of cheops');
    addComponent('pyramid of khafre');
    addComponent('pyramid of chefren');
    addComponent('pyramid of menkaure');
    addComponent('great sphinx of giza');
    addComponent('great sphinx');
    addComponent('sphinx of giza');
    addComponent('giza necropolis');
    addComponent('giza plateau');
  }

  if (combined.includes('forbidden city')) {
    addComponent('palace museum');
    addComponent('gugong');
    addComponent('故宫');
    addComponent('紫禁城');
    addComponent('imperial palace');
    addComponent('beijing imperial palace');
    addComponent('forbidden city meridian gate');
    addComponent('meridian gate');
  }

  if (combined.includes('burkhan khaldun') || combined.includes('burqan qaldun')) {
    addCanonical('burkhan khaldun');
    addCanonical('mount burkhan khaldun');
    addAlternate('burqan qaldun');
    addAlternate('khentii mountains');
    addAlternate('sacred mountain burkhan khaldun');
  }

  if (combined.includes('western xia') || combined.includes('yinchuan') || combined.includes('xixia') || combined.includes('xingqing')) {
    addCanonical('yinchuan');
    addAlternate('western xia');
    addAlternate('western xia tombs');
    addAlternate('xixia');
    addAlternate('xingqing');
  }

  if (combined.includes('zhongdu') || combined.includes('jin zhongdu')) {
    addCanonical('zhongdu');
    addCanonical('jin zhongdu');
    addAlternate('zhongdu of jin');
    addAlternate('jin dynasty zhongdu');
    addAlternate('zhongdu city wall');
    addAlternate('beijing');
  }

  return {
    exactAliases: Array.from(exactSet),
    canonicalAliases: Array.from(canonicalSet),
    alternateAliases: Array.from(alternateSet),
    componentAliases: Array.from(componentSet)
  };
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
  entityMatchLevel: EntityMatchLevel;
  matchedAlias?: string;
} {
  const entityName = entity.name || '';
  const canonicalName = entity.canonicalName || '';
  const title = candidate.title || '';
  const desc = candidate.description || candidate.caption || '';
  const fullText = `${title} ${desc} ${candidate.source || ''}`.toLowerCase();
  const normFullText = stripDiacritics(fullText).toLowerCase();
  const titleLower = title.toLowerCase().trim();
  const normTitle = stripDiacritics(titleLower).toLowerCase().trim();

  // Clean candidate title by stripping prefix "File:" / "Image:", file extension, and underscores
  const cleanTitle = title
    .replace(/^(?:file|image):\s*/i, '')
    .replace(/\.(?:jpe?g|png|svg|webp|gif)$/i, '')
    .replace(/_/g, ' ')
    .trim();
  const cleanTitleLower = cleanTitle.toLowerCase();
  const normCleanTitle = stripDiacritics(cleanTitleLower).toLowerCase().trim();

  const { exactAliases, canonicalAliases, alternateAliases, componentAliases } = deriveEntityAliases(
    entityName,
    canonicalName,
    entity.aliases
  );

  // Helper to match string against title or fullText
  const matchExactCandidateTitle = (alias: string): boolean => {
    const aliasLower = alias.toLowerCase().trim();
    const normAlias = stripDiacritics(aliasLower).toLowerCase().trim();
    if (normAlias.length < 2) return false;

    // Exact matches against raw or cleaned title (with or without diacritics)
    if (titleLower === aliasLower || normTitle === normAlias || cleanTitleLower === aliasLower || normCleanTitle === normAlias) return true;
    if (areEntitiesMatchingWithDiacritics(titleLower, aliasLower) || areEntitiesMatchingWithDiacritics(cleanTitleLower, aliasLower)) return true;

    // Prefixes / suffixes
    if (titleLower.startsWith(`${aliasLower} (`) || normTitle.startsWith(`${normAlias} (`) || cleanTitleLower.startsWith(`${aliasLower} (`) || normCleanTitle.startsWith(`${normAlias} (`)) return true;
    if (titleLower.startsWith(`${aliasLower},`) || normTitle.startsWith(`${normAlias},`) || cleanTitleLower.startsWith(`${aliasLower},`) || normCleanTitle.startsWith(`${normAlias},`)) return true;
    if (titleLower.startsWith(`${aliasLower} -`) || normTitle.startsWith(`${normAlias} -`) || cleanTitleLower.startsWith(`${aliasLower} -`) || normCleanTitle.startsWith(`${normAlias} -`)) return true;
    if (titleLower.startsWith(`${aliasLower}:`) || normTitle.startsWith(`${normAlias}:`) || cleanTitleLower.startsWith(`${aliasLower}:`) || normCleanTitle.startsWith(`${normAlias}:`)) return true;
    if (titleLower === `the ${aliasLower}` || normTitle === `the ${normAlias}` || cleanTitleLower === `the ${aliasLower}` || normCleanTitle === `the ${normAlias}`) return true;
    if (titleLower === `${aliasLower} estate` || titleLower === `${aliasLower} castle` || titleLower === `${aliasLower} fort` || titleLower === `${aliasLower} house`) return true;
    return false;
  };

  const matchTextPhrase = (alias: string): boolean => {
    const aliasLower = alias.toLowerCase().trim();
    const normAlias = stripDiacritics(aliasLower).toLowerCase().trim();
    if (normAlias.length < 3) return false;

    const escaped = normAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const boundary = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i');
    return boundary.test(normFullText) || boundary.test(normCleanTitle) || boundary.test(normTitle);
  };

  // 1. Check title matches first: EXACT -> CANONICAL -> ALIAS -> COMPONENT
  const exactMatch = exactAliases.find(a => matchExactCandidateTitle(a));
  if (exactMatch) {
    console.log(`[IMAGE ENTITY EXACT MATCH]\ncanonicalEntity="${entityName}"\nmatchedExact="${exactMatch}"\ncandidateTitle="${title}"`);
    return {
      evidenceType: 'EXACT_ENTITY',
      entityMatchLevel: 'EXACT',
      matchedAlias: exactMatch
    };
  }

  const canonicalTitleMatch = canonicalAliases.find(a => matchExactCandidateTitle(a));
  if (canonicalTitleMatch) {
    console.log(`[IMAGE ENTITY CANONICAL MATCH]\ncanonicalEntity="${entityName}"\nmatchedCanonical="${canonicalTitleMatch}"\ncandidateTitle="${title}"`);
    return {
      evidenceType: 'EXACT_ENTITY',
      entityMatchLevel: 'CANONICAL',
      matchedAlias: canonicalTitleMatch
    };
  }

  const aliasTitleMatch = alternateAliases.find(a => matchExactCandidateTitle(a));
  if (aliasTitleMatch) {
    console.log(`[IMAGE ENTITY ALIAS MATCH]\ncanonicalEntity="${entityName}"\nmatchedAlias="${aliasTitleMatch}"\ncandidateTitle="${title}"`);
    return {
      evidenceType: 'KNOWN_ALIAS',
      entityMatchLevel: 'ALIAS',
      matchedAlias: aliasTitleMatch
    };
  }

  const componentTitleMatch = componentAliases.find(a => matchExactCandidateTitle(a));
  if (componentTitleMatch) {
    console.log(`[IMAGE ENTITY COMPONENT MATCH]\ncanonicalEntity="${entityName}"\nmatchedComponent="${componentTitleMatch}"\ncandidateTitle="${title}"`);
    return {
      evidenceType: 'COMPONENT',
      entityMatchLevel: 'COMPONENT',
      matchedAlias: componentTitleMatch
    };
  }

  // 2. Check full text phrase matches: CANONICAL -> ALIAS -> COMPONENT
  const canonicalPhraseMatch = canonicalAliases.find(a => matchTextPhrase(a));
  if (canonicalPhraseMatch) {
    console.log(`[IMAGE ENTITY CANONICAL MATCH]\ncanonicalEntity="${entityName}"\nmatchedCanonical="${canonicalPhraseMatch}"\ncandidateTitle="${title}"`);
    return {
      evidenceType: 'EXACT_ENTITY',
      entityMatchLevel: 'CANONICAL',
      matchedAlias: canonicalPhraseMatch
    };
  }

  const aliasPhraseMatch = alternateAliases.find(a => matchTextPhrase(a));
  if (aliasPhraseMatch) {
    console.log(`[IMAGE ENTITY ALIAS MATCH]\ncanonicalEntity="${entityName}"\nmatchedAlias="${aliasPhraseMatch}"\ncandidateTitle="${title}"`);
    return {
      evidenceType: 'KNOWN_ALIAS',
      entityMatchLevel: 'ALIAS',
      matchedAlias: aliasPhraseMatch
    };
  }

  const componentPhraseMatch = componentAliases.find(a => matchTextPhrase(a));
  if (componentPhraseMatch) {
    console.log(`[IMAGE ENTITY COMPONENT MATCH]\ncanonicalEntity="${entityName}"\nmatchedComponent="${componentPhraseMatch}"\ncandidateTitle="${title}"`);
    return {
      evidenceType: 'COMPONENT',
      entityMatchLevel: 'COMPONENT',
      matchedAlias: componentPhraseMatch
    };
  }

  // 4. Check PARTIAL match
  // Identify key distinctive tokens (length >= 4) from entity name and canonical variants
  const rawTokens = [entityName, canonicalName]
    .filter(Boolean)
    .map(s => stripDiacritics(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' '))
    .join(' ')
    .split(/\s+/)
    .filter(t => t.length >= 4 && !['the', 'and', 'from', 'near', 'with', 'site', 'view', 'location', 'historic', 'ancient'].includes(t));
  const distinctTokens = Array.from(new Set(rawTokens));

  if (distinctTokens.length > 0) {
    const matchingTokens = distinctTokens.filter(t => normFullText.includes(t));
    if (matchingTokens.length >= Math.min(2, distinctTokens.length) || (distinctTokens.length === 1 && matchingTokens.length === 1)) {
      return {
        evidenceType: 'RELATED_ENTITY',
        entityMatchLevel: 'PARTIAL',
        matchedAlias: matchingTokens.join(' ')
      };
    }
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
  aliases?: string[];
}

export function isHistoricalWaypointEntity(entity: {
  entityType?: string;
  type?: string;
  intent?: string;
  historicalContext?: string;
  historicalPeriod?: string;
  routeTitle?: string;
  routeGroupId?: string;
  historicalRouteId?: string;
  routeEvidenceMode?: string;
  isHistoricalWaypoint?: boolean;
  waypoint?: any;
  metadataMode?: string;
  significance?: string;
}): boolean {
  if (entity.intent === 'MULTI_LOCATION_DISCOVERY') return false;
  if (entity.metadataMode === 'modern_place') return false;

  const wp = entity.waypoint || {};
  const name = (entity as any).name || (entity as any).canonicalName || wp.name || wp.canonicalName || '';
  const desc = (entity as any).description || wp.description || '';
  const title = (entity.routeTitle || (entity as any).routeGroupName || wp.routeTitle || wp.routeGroupName || '').toLowerCase();
  const context = (entity.historicalContext || entity.significance || (entity as any).context || wp.context || wp.historicalContext || wp.significance || '').toLowerCase();
  const combined = `${name} ${title} ${context} ${desc}`.toLowerCase();

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

  // If this is a modern travel guide, recommendation itinerary, or highlights route
  if (
    combined.includes('36 hours') ||
    combined.includes('travel guide') ||
    combined.includes('places to visit') ||
    combined.includes('itinerary') ||
    combined.includes('highlights')
  ) {
    return false;
  }

  const eType = (entity.entityType || entity.type || (entity as any).waypointType || wp.entityType || wp.type || wp.waypointType || '').toString().toLowerCase();

  const isExplicitHistoricalWaypointType =
    eType === 'historical_waypoint' ||
    eType === 'route_waypoint' ||
    Boolean(entity.isHistoricalWaypoint) ||
    Boolean(wp.isHistoricalWaypoint);

  const hasExplicitHistoricalRouteContext =
    Boolean(entity.routeGroupId) ||
    Boolean(wp.routeGroupId) ||
    Boolean(entity.historicalRouteId) ||
    Boolean(wp.historicalRouteId) ||
    Boolean(entity.historicalPeriod) ||
    Boolean(wp.historicalPeriod) ||
    ((Boolean(entity.routeTitle) || Boolean(wp.routeTitle) || Boolean((entity as any).routeGroupName) || Boolean(wp.routeGroupName)) &&
      !combined.includes('guide') && !combined.includes('hours') && !combined.includes('highlights'));

  const hasWaypointContext =
    Boolean(entity.historicalPeriod) ||
    Boolean(wp.historicalPeriod) ||
    Boolean(entity.historicalContext) ||
    Boolean(wp.historicalContext) ||
    Boolean((entity as any).context) ||
    Boolean(wp.context) ||
    Boolean(entity.significance) ||
    Boolean(wp.significance) ||
    eType.includes('battlefield') ||
    eType.includes('historic') ||
    /\b(1[0-9]{3}|20[0-2][0-9]|bce?|century|expedition|voyage|shipwreck|wreck|treaty|siege|battle)\b/i.test(combined);

  if (isExplicitHistoricalWaypointType && (hasExplicitHistoricalRouteContext || hasWaypointContext)) {
    return true;
  }

  if (hasExplicitHistoricalRouteContext && hasWaypointContext) {
    return true;
  }

  return false;
}

export function extractHistoricalImageContext(info: any): HistoricalImageContext {
  const wp = info?.waypoint || {};
  let exploration = (info?.routeTitle || wp?.routeTitle || info?.routeGroupName || wp?.routeGroupName || info?.routeContext?.title || info?.historicalContext || '').trim();
  // Filter out UI placeholder labels from leaking into search context
  if (/^(from route|route context|historical significance|notable facts|image|none)$/i.test(exploration)) {
    exploration = (info?.historicalContext || '').trim();
    if (/^(from route|route context|historical significance|notable facts|image|none)$/i.test(exploration)) {
      exploration = '';
    }
  }
  const rawEvent = (info?.significance || wp?.significance || info?.context || wp?.context || '').trim();
  // Sanitize event: take only short topic/phrase (at most 3-4 words or clean title), not full prose sentences
  let event: string | undefined = undefined;
  if (rawEvent) {
    const isProse = /^(it|this|the|they|he|she|in|at|a|an|[0-9]{3,4}:?)\s+/i.test(rawEvent) ||
                    rawEvent.includes('.') ||
                    rawEvent.split(/\s+/).length > 6;
    if (!isProse) {
      event = rawEvent;
    } else {
      // If it mentions specific historical terms like treaty, battle, siege, council, kurultai, extract just the noun phrase
      const eventNounMatch = rawEvent.match(/\b(treaty of [a-z0-9\s'-]+|battle of [a-z0-9\s'-]+|siege of [a-z0-9\s'-]+|council of [a-z0-9\s'-]+|kurultai of [a-z0-9\s'-]+)\b/i);
      if (eventNounMatch) {
        event = eventNounMatch[1].trim();
      }
    }
  }
  const period = (info?.historicalPeriod || wp?.historicalPeriod || '').trim();
  
  // Extract 4-digit year or period mention (e.g. "1804", "19th century", "1804-1806")
  let year: string | undefined = undefined;
  const yearMatch = (period + ' ' + (info?.description || '') + ' ' + (wp?.description || '') + ' ' + (info?.context || '') + ' ' + (wp?.context || '') + ' ' + (info?.historicalContext || '')).match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
  if (yearMatch) {
    year = yearMatch[1];
  } else {
    const centuryMatch = (period + ' ' + (info?.description || '')).match(/\b([1-9][0-9]?(?:st|nd|rd|th)\s+century)\b/i);
    if (centuryMatch) {
      year = centuryMatch[1];
    }
  }

  const rawWaypointName = (info?.canonicalName || wp?.canonicalName || info?.name || wp?.name || '').trim();
  // Clean location name: "Burkhan Khaldun (Mongolia)" -> "Burkhan Khaldun", "St. Charles, Missouri" -> "St. Charles"
  const cleanLocationName = rawWaypointName
    .replace(/\s*\([^)]*\)/g, '')
    .split(/[,–-]/)[0]
    .trim() || rawWaypointName;
  const region = (info?.state || info?.region || wp?.historicalRegion || wp?.modernLocation || '').trim();
  const country = (info?.country || wp?.country || '').trim();

  const derivedAliases = deriveEntityAliases(rawWaypointName, info?.canonicalName || wp?.canonicalName, info?.aliases || wp?.aliases);
  const aliases = Array.from(new Set([
    ...derivedAliases.exactAliases,
    ...derivedAliases.canonicalAliases,
    ...derivedAliases.alternateAliases,
    ...(info?.aliases || []),
    ...(wp?.aliases || [])
  ]));

  // Extract people / entities
  const rawEntities = [
    ...(Array.isArray(info?.entities) ? info.entities : []),
    ...(Array.isArray(wp?.entities) ? wp.entities : []),
    ...(Array.isArray(info?.relatedEntities) ? info.relatedEntities.map((e: any) => typeof e === 'string' ? e : e?.name) : [])
  ].filter(Boolean);

  const rawNarrativeText = [
    info?.description,
    wp?.description,
    info?.historicalContext,
    wp?.historicalContext,
    info?.context,
    wp?.context,
    info?.significance,
    wp?.significance,
    info?.routeContext?.text,
    ...(Array.isArray(info?.notable) ? info.notable.map((n: any) => typeof n === 'string' ? n : n?.description || n?.title || '') : [])
  ].filter(Boolean).join(' ');
  const fullNarrative = rawNarrativeText.toLowerCase();

  // Generic extraction of ships / vessels (e.g. HMS Erebus, HMS Terror, Endurance, James Caird, Santa Maria)
  const vesselRegex = /\b(?:hms|uss|ss|rms|mv|ms|mt|sv|rv|ps)\s+([a-z0-9\s'-]+)/gi;
  let vesselMatch: RegExpExecArray | null;
  const discoveredVessels: string[] = [];
  while ((vesselMatch = vesselRegex.exec(rawNarrativeText)) !== null) {
    const vName = vesselMatch[0].trim();
    if (vName && !discoveredVessels.some(v => v.toLowerCase() === vName.toLowerCase())) {
      discoveredVessels.push(vName);
    }
  }

  const people = Array.from(new Set(rawEntities.map(e => String(e).trim()).filter(Boolean)));
  const activityKeywords = [
    'preparation', 'preparations', 'departure', 'departed', 'keelboat', 'pirogue', 'boatmen',
    'encampment', 'camp', 'winter camp', 'fort', 'portage', 'council', 'meeting', 'treaty',
    'battle', 'siege', 'march', 'crossing', 'landing', 'settlement', 'recruitment', 'expedition',
    'shipwreck', 'wreck', 'graves', 'circumnavigate', 'circumnavigated', 'resting place'
  ];
  const activities = activityKeywords.filter(kw => fullNarrative.includes(kw));

  const artifactKeywords = [
    'keelboat', 'pirogue', 'canoe', 'journal', 'diary', 'map', 'compass', 'sextant',
    'musket', 'rifle', 'peace medal', 'uniform', 'document', 'specimen', 'wreck', 'shipwreck',
    ...discoveredVessels
  ];
  const artifacts = Array.from(new Set(artifactKeywords.filter(kw => fullNarrative.includes(kw.toLowerCase()) || discoveredVessels.includes(kw))));

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
    waypointName: rawWaypointName,
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
  const { exploration, event, period, year, cleanLocationName, waypointName, region, country, people, activities, artifacts } = context;

  const cleanExploration = exploration
    ? exploration.replace(/\s+route$/i, '').replace(/\s+trail$/i, '').replace(/\s+path$/i, '').trim()
    : undefined;

  // 1. Entity + Specific Historical Context / Exploration / Vessel (Highest Priority)
  if (cleanLocationName) {
    // 1a. Canonical entity query
    queries.push(cleanLocationName);

    // 1b. Entity + cleaned exploration (e.g. "Beechey Island Franklin Expedition")
    if (cleanExploration && cleanExploration.toLowerCase() !== cleanLocationName.toLowerCase()) {
      queries.push(`${cleanLocationName} ${cleanExploration}`);
      queries.push(`${cleanExploration} ${cleanLocationName}`);
    }

    // 1c. Entity + major historical artifact / vessel (e.g. "Terror Bay HMS Terror", "Queen Maud Gulf HMS Erebus")
    if (artifacts && artifacts.length > 0) {
      for (const art of artifacts.slice(0, 3)) {
        queries.push(`${cleanLocationName} ${art}`.trim());
        if (cleanExploration) {
          queries.push(`${cleanLocationName} ${cleanExploration} ${art}`.trim());
        }
      }
    }

    // 1d. Entity + activity (e.g. "Beechey Island graves", "Terror Bay wreck")
    if (activities && activities.length > 0) {
      for (const act of activities.slice(0, 3)) {
        queries.push(`${cleanLocationName} ${act}`.trim());
        if (cleanExploration) {
          queries.push(`${cleanLocationName} ${cleanExploration} ${act}`.trim());
        }
      }
    }

    // 1e. Entity + country / region (e.g. "Whalefish Islands Greenland", "Stromness Orkney")
    if (country && country.toLowerCase() !== cleanLocationName.toLowerCase()) {
      queries.push(`${cleanLocationName} ${country}`);
    }
    if (region && region.toLowerCase() !== cleanLocationName.toLowerCase()) {
      queries.push(`${cleanLocationName} ${region}`);
    }

    // 1f. Entity + historical event / treaty / battle / document
    if (event) {
      queries.push(`${cleanLocationName} ${event}`);
    }

    // 1g. Entity + year / period / historic site
    if (year || period) {
      queries.push(`${cleanLocationName} ${year || period}`);
      if (cleanExploration) {
        queries.push(`${cleanExploration} ${cleanLocationName} ${year || period}`.trim());
      }
    }
    queries.push(`${cleanLocationName} historic site`);
    queries.push(`${cleanLocationName} archaeological site`);
    queries.push(`historic ${cleanLocationName} painting engraving`);

    // 1h. Named historical people + Entity
    if (people && people.length > 0) {
      for (const p of people.slice(0, 2)) {
        queries.push(`${cleanLocationName} ${p}`.trim());
      }
    }

    if (cleanExploration) {
      queries.push(`${cleanLocationName} ${cleanExploration} map`.trim());
      queries.push(`${cleanLocationName} historical map`.trim());
    }
  } else if (cleanExploration) {
    // If no cleanLocationName exists (general route search), build exploration-level queries
    if (event) {
      queries.push(`${cleanExploration} ${event} ${year || ''}`.trim());
    }
    if (activities && activities.length > 0) {
      for (const act of activities.slice(0, 3)) {
        queries.push(`${cleanExploration} ${act}`.trim());
      }
    }
    queries.push(`${cleanExploration} map ${region || ''}`.trim());
    queries.push(`${cleanExploration} historical illustration artwork`.trim());
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

  // 7. Historical Place / Depiction of Historic Settlement / Architectural Landmark
  const locLower = (context.cleanLocationName || '').toLowerCase();
  const allAliases = [locLower, ...(context.aliases || []).map(a => a.toLowerCase())].filter(Boolean);
  const matchesEntityLocation = allAliases.some(alias => alias.length >= 3 && (text.includes(alias) || title.includes(alias)));

  if (
    matchesEntityLocation ||
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

export function isGeographicPlaceEntity(
  entity: {
    name?: string;
    canonicalName?: string;
    entityType?: string;
    type?: string;
    city?: string;
    state?: string;
    country?: string;
    category?: string;
    waypoint?: any;
  },
  shape?: ImageSubjectShape
): boolean {
  if (!entity) return false;

  const entityName = (entity.name || entity.canonicalName || '').trim();
  const eType = (entity.entityType || entity.type || entity.category || entity.waypoint?.entityType || entity.waypoint?.type || '').toString().toLowerCase().trim();

  // 1. Explicit discrete landmark / structure / vessel exclusions
  // These entities MUST remain discrete and require entity-specific validation
  const discreteLandmarkKeywords = [
    'museum', 'monument', 'statue', 'sculpture', 'building', 'tower', 'castle',
    'fort', 'fortress', 'palace', 'temple', 'cathedral', 'basilica', 'church',
    'chapel', 'shrine', 'mosque', 'synagogue', 'acropolis', 'parthenon', 'colosseum',
    'pyramid', 'sphinx', 'stonehenge', 'ruin', 'ruins', 'archaeological_site',
    'historic_site', 'heritage_site', 'wreck', 'shipwreck', 'vessel', 'bridge',
    'memorial', 'stadium', 'arena', 'observatory', 'mausoleum', 'tomb', 'arch'
  ];

  const hasDiscreteType = discreteLandmarkKeywords.some(kw => eType === kw || eType.includes(kw));
  if (hasDiscreteType) {
    return false;
  }

  // Name check for prominent discrete entities or discrete descriptors
  const discreteNameRegex = /\b(?:museum|monument|statue|tower|castle|fort|palace|temple|cathedral|basilica|acropolis|parthenon|colosseum|pyramid|sphinx|stonehenge|shipwreck|wreck\s+site|eiffel\s+tower|statue\s+of\s+liberty)\b/i;
  if (discreteNameRegex.test(entityName)) {
    return false;
  }

  // 2. Recognized Geographic Place Types
  const recognizedPlaceTypes = new Set([
    'city',
    'town',
    'village',
    'settlement',
    'island',
    'country',
    'state',
    'province',
    'region',
    'administrative',
    'administrative_region',
    'place',
    'geographic_place',
    'locality',
    'municipality',
    'county',
    'district',
    'commune',
    'department',
    'prefecture',
    'territory',
    'canton'
  ]);

  if (recognizedPlaceTypes.has(eType) || Array.from(recognizedPlaceTypes).some(t => eType === t || eType.includes(t))) {
    return true;
  }

  // 3. Recognized Shapes
  if (shape === 'BROAD_LOCATION' || (shape as string) === 'GEOGRAPHIC_PLACE') {
    return true;
  }

  // 4. City/Country/State Structural Hierarchy
  if (entity.city === entityName || entity.country === entityName || entity.state === entityName) {
    return true;
  }

  // 5. Geographic Locality Pattern (e.g. "Antikythera, Greece", "Boston, Massachusetts", "Symi, Greece", "Vatican City")
  // Matches "Name, Country/State" or "Name City / Island" without discrete landmark terms
  const isPlaceNamePattern = /^[A-Za-z\u00C0-\u024F\s.'-]+,\s*[A-Za-z\u00C0-\u024F\s.'-]+$/i.test(entityName) ||
    /\b(?:city|island|isle|town|village|municipality|republic|kingdom|state|province)\b/i.test(entityName);

  if (isPlaceNamePattern && !discreteNameRegex.test(entityName)) {
    return true;
  }

  return false;
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
  const normFullText = stripDiacritics(fullText).toLowerCase();
  const titleLower = title.toLowerCase().trim();
  const normTitle = stripDiacritics(titleLower).toLowerCase().trim();
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
    const canonName = (entity.canonicalName || entity.waypoint?.canonicalName || '').toLowerCase();
    const eName = (entityName || '').toLowerCase();
    const cleanEName = eName.replace(/\s*\([^)]*\)/g, '').trim();
    const derivedAliasesObj = deriveEntityAliases(entityName, entity.canonicalName || entity.waypoint?.canonicalName, entity.aliases);
    const rawAliases = [
      cleanLoc,
      canonName,
      eName,
      cleanEName,
      cleanLoc.split(',')[0].trim(),
      canonName.split(',')[0].trim(),
      eName.split(',')[0].trim(),
      cleanEName.split(',')[0].trim(),
      ...derivedAliasesObj.exactAliases,
      ...derivedAliasesObj.canonicalAliases,
      ...derivedAliasesObj.alternateAliases,
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

    // Strong negative preference / penalty against modern civic/streetscape photography on antique expeditions
    if (isModern && category === 'MODERN_LOCATION' && entityMatch !== 'EXACT_TITLE') {
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
  let coordinateStatus: 'VERIFIED' | 'PROVISIONAL' | 'UNVERIFIED' | 'ABSENT' | 'INVALID' = 'VERIFIED';
  if (!entity.coordinates || (entity.coordinates.lat === undefined && entity.coordinates.lng === undefined)) {
    coordinateStatus = 'ABSENT';
  } else if (isSuspiciousPlaceholderCoordinate(entity.coordinates.lat, entity.coordinates.lng)) {
    coordinateStatus = 'INVALID';
  } else if (
    entity.coordinateTrust === 'provisional' ||
    entity.coordinateSource === 'ai_recovery'
  ) {
    coordinateStatus = (entity.identityStatus === 'unverified' || (entity as any).provenance === 'unverified')
      ? 'UNVERIFIED'
      : 'PROVISIONAL';
  } else if (
    entity.identityStatus === 'unverified' ||
    entity.coordinateSource === 'llm' ||
    entity.coordinateSource === 'inferred' ||
    (entity as any).provenance === 'unverified' ||
    entity.coordinateTrust === 'unverified'
  ) {
    coordinateStatus = 'UNVERIFIED';
  } else {
    coordinateStatus = 'VERIFIED';
  }

  // 1b. Candidate Media Classification & Intent Compatibility
  const mediaClassification = classifyCandidateMedia(candidate);
  const candidateMediaType = mediaClassification.mediaType;
  const photographicSuitability = getPhotographicSuitability(candidateMediaType);
  const intentCompatibility = getIntentMediaCompatibility(imageIntent.category, candidateMediaType);

  // 2. Check for generic flags/emblems
  const isFlag = isGenericFlagOrEmblem(title, desc, entityName, imageIntent);

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
  let geoEvidence: 'MATCHING' | 'CONFLICTING' | 'UNKNOWN' = 'UNKNOWN';
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
      (entity.city && (fullText.includes(entity.city.toLowerCase()) || normFullText.includes(stripDiacritics(entity.city).toLowerCase()))) ||
      (entity.state && (fullText.includes(entity.state.toLowerCase()) || normFullText.includes(stripDiacritics(entity.state).toLowerCase()))) ||
      (entity.country && (fullText.includes(entity.country.toLowerCase()) || normFullText.includes(stripDiacritics(entity.country).toLowerCase())))
    ) {
      geoEvidence = 'MATCHING';
    } else if (geoEvidence !== 'MATCHING') {
      geoEvidence = 'UNKNOWN';
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
    entityMatchLevel === 'EXACT' ||
    entityMatchLevel === 'CANONICAL' ||
    entityMatchLevel === 'ALIAS' ||
    entityMatchLevel === 'HIGH' ||
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
  const isTrustedGeoConflict = isGeoConflicting && (coordinateStatus === 'VERIFIED' || coordinateStatus === 'UNVERIFIED');
  const isProvisionalGeoConflict = isGeoConflicting && coordinateStatus === 'PROVISIONAL';
  const conflictEvidenceTrusted = isTrustedGeoConflict;

  // Media / Intent Compatibility Checks
  const isNonPhotographicForPhysicalLocation =
    (imageIntent.category === 'PHYSICAL_LOCATION' || (!imageIntent.explicitMediaIntent && imageIntent.category === 'UNKNOWN')) &&
    (candidateMediaType === 'COAT_OF_ARMS' ||
      candidateMediaType === 'FLAG' ||
      candidateMediaType === 'SEAL' ||
      candidateMediaType === 'LOGO' ||
      candidateMediaType === 'ORGANIZATION_GRAPHIC' ||
      candidateMediaType === 'MAP' ||
      candidateMediaType === 'DIAGRAM' ||
      candidateMediaType === 'ICON' ||
      candidateMediaType === 'OTHER_NON_PHOTOGRAPH');

  const isIncompatibleForExplicitIntent =
    imageIntent.explicitMediaIntent &&
    intentCompatibility.compatibility === 'INCOMPATIBLE';

  // Hard Rejections across all policies:
  if (isFlag) {
    decision = 'REJECT';
    reason = 'Generic national flag, insufficient entity relevance';
  } else if (isDifferentEntity) {
    decision = 'REJECT';
    reason = 'DIFFERENT_ENTITY';
  } else if (isIncompatibleForExplicitIntent) {
    decision = 'REJECT';
    reason = 'INCOMPATIBLE_MEDIA_FOR_EXPLICIT_INTENT';
  } else if (isNonPhotographicForPhysicalLocation) {
    decision = 'REJECT';
    reason = 'NON_PHOTOGRAPHIC_MEDIA_FOR_LOCATION_INTENT';
  } else if (entityTypeMatchLevel === 'INCOMPATIBLE') {
    decision = 'REJECT';
    reason = 'Semantic entity-type mismatch';
  } else if (isTrustedGeoConflict) {
    decision = 'REJECT';
    reason = 'GEOGRAPHIC_CONFLICT';
  } else if (isProvisionalGeoConflict && !hasStrongEntityMatch && semanticFeatureMatch !== 'STRONG') {
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

      case 'LANDMARK_ENTITY': {
        if (hasStrongEntityMatch) {
          decision = 'ACCEPT';
          tier = 1;
          reason = isProvisionalGeoConflict
            ? 'STRONG_ENTITY_MATCH_PROVISIONAL_GEO_CONFLICT'
            : ((coordinateStatus === 'VERIFIED' && geoEvidence === 'MATCHING')
              ? 'STRONG_ENTITY_MATCH_GEO_VERIFIED'
              : 'STRONG_ENTITY_MATCH');
        } else if (entityMatchLevel === 'COMPONENT' || entityMatchLevel === 'SUBFEATURE' || evidenceType === 'COMPONENT' || evidenceType === 'SUBFEATURE') {
          if (isGeoConflicting) {
            decision = 'REJECT';
            reason = 'GEOGRAPHIC_CONFLICT';
          } else {
            decision = 'ACCEPT';
            tier = 2;
            reason = 'COMPONENT_LANDMARK_MATCH';
          }
        } else if (entityMatchLevel === 'PARTIAL') {
          if (geoEvidence === 'MATCHING') {
            decision = 'ACCEPT';
            tier = coordinateStatus === 'PROVISIONAL' ? 3 : 2;
            reason = coordinateStatus === 'PROVISIONAL'
              ? 'PARTIAL_ENTITY_MATCH_WITH_PROVISIONAL_GEO_CORROBORATION'
              : 'PARTIAL_ENTITY_MATCH_WITH_GEO_CORROBORATION';
          } else if (geoEvidence === 'CONFLICTING') {
            decision = 'REJECT';
            reason = 'GEOGRAPHIC_CONFLICT';
          } else {
            if (imageIntent.geographicConstraint === false) {
              decision = 'ACCEPT';
              tier = 3;
              reason = 'PARTIAL_ENTITY_MATCH_FALLBACK';
            } else {
              decision = 'REJECT';
              reason = 'NO_ENTITY_SPECIFIC_EVIDENCE';
            }
          }
        } else {
          decision = 'REJECT';
          reason = 'NO_ENTITY_SPECIFIC_EVIDENCE';
        }
        break;
      }

      case 'STRICT_ENTITY': {
        const isGeoPlace = isGeographicPlaceEntity(entity, shape);
        const isPhotographicMedia =
          photographicSuitability === 'HIGH' ||
          candidateMediaType === 'PHOTOGRAPH' ||
          candidateMediaType === 'LOCATION_VIEW' ||
          candidateMediaType === 'PANORAMA_PHOTOGRAPH' ||
          candidateMediaType === 'HISTORICAL_PHOTOGRAPH';
        const isGeoConstraintApplied = coordinateStatus === 'VERIFIED' || coordinateStatus === 'PROVISIONAL';

        if (hasStrongEntityMatch) {
          decision = 'ACCEPT';
          tier = 1;
          reason = isProvisionalGeoConflict
            ? 'STRONG_ENTITY_MATCH_PROVISIONAL_GEO_CONFLICT'
            : ((coordinateStatus === 'VERIFIED' && geoEvidence === 'MATCHING')
              ? 'STRONG_ENTITY_MATCH_GEO_VERIFIED'
              : 'STRONG_ENTITY_MATCH');
        } else if (semanticFeatureMatch === 'STRONG') {
          if (isGeoConflicting && isTrustedGeoConflict) {
            decision = 'REJECT';
            reason = 'GEOGRAPHIC_CONFLICT';
          } else {
            decision = 'ACCEPT';
            tier = 2;
            reason = 'STRONG_SEMANTIC_ENTITY_MATCH';
          }
        } else if (
          isGeoPlace &&
          isPhotographicMedia &&
          geoEvidence === 'MATCHING' &&
          coordinateStatus === 'VERIFIED' &&
          !isTrustedGeoConflict &&
          !isGeoConflicting &&
          isGeoConstraintApplied &&
          !isDifferentEntity &&
          !isFlag &&
          !isIncompatibleForExplicitIntent &&
          !isNonPhotographicForPhysicalLocation
        ) {
          decision = 'ACCEPT';
          tier = 2;
          reason = 'VERIFIED_GEOGRAPHIC_PLACE_MATCH';
        } else if (entityMatchLevel === 'PARTIAL') {
          if (geoEvidence === 'MATCHING') {
            if (coordinateStatus === 'VERIFIED') {
              decision = 'ACCEPT';
              tier = 2;
              reason = 'PARTIAL_ENTITY_MATCH_WITH_GEO_CORROBORATION';
            } else if (coordinateStatus === 'PROVISIONAL') {
              decision = 'ACCEPT';
              tier = 3;
              reason = 'PARTIAL_ENTITY_MATCH_WITH_PROVISIONAL_GEO_CORROBORATION';
            } else {
              decision = 'REJECT';
              reason = 'NO_ENTITY_SPECIFIC_EVIDENCE';
            }
          } else if (geoEvidence === 'CONFLICTING') {
            decision = 'REJECT';
            reason = 'GEOGRAPHIC_CONFLICT';
          } else {
            if (imageIntent.geographicConstraint === false) {
              decision = 'ACCEPT';
              tier = 3;
              reason = 'PARTIAL_ENTITY_MATCH_FALLBACK';
            } else {
              decision = 'REJECT';
              reason = 'NO_ENTITY_SPECIFIC_EVIDENCE';
            }
          }
        } else {
          decision = 'REJECT';
          reason = 'NO_ENTITY_SPECIFIC_EVIDENCE';
        }
        break;
      }

      case 'GEOGRAPHIC_FEATURE': {
        // For individual geographic features (e.g. Antelope Canyon), candidate must match the entity itself or verified alias
        if (hasStrongEntityMatch) {
          decision = 'ACCEPT';
          tier = 1;
          reason = isProvisionalGeoConflict
            ? 'STRONG_ENTITY_MATCH_PROVISIONAL_GEO_CONFLICT'
            : 'EXACT_OR_ALIAS_FEATURE_MATCH';
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
          reason = isProvisionalGeoConflict ? 'STRONG_ENTITY_MATCH_PROVISIONAL_GEO_CONFLICT' : 'EXACT_LOCATION_MATCH';
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

    // Media Intent Bonus / Suitability Scoring
    if (imageIntent.explicitMediaIntent && intentCompatibility.isExplicitMatch) {
      score += 60; // Huge boost for explicit media match
      tier = 1;
      reason = 'EXPLICIT_MEDIA_INTENT';
    } else if (imageIntent.explicitMediaIntent && intentCompatibility.compatibility === 'MEDIUM') {
      score += 30;
    } else if (imageIntent.explicitMediaIntent && intentCompatibility.compatibility === 'LOW') {
      score -= 20;
    } else if (imageIntent.category === 'PHYSICAL_LOCATION' || imageIntent.category === 'PHOTOGRAPH') {
      if (candidateMediaType === 'PHOTOGRAPH' || candidateMediaType === 'LOCATION_VIEW' || candidateMediaType === 'PANORAMA_PHOTOGRAPH') {
        score += 20; // Photographic suitability boost for location intent
      }
    } else if (imageIntent.category === 'HISTORICAL_EVENT') {
      if (candidateMediaType === 'PAINTING' || candidateMediaType === 'ILLUSTRATION' || candidateMediaType === 'MAP' || candidateMediaType === 'HISTORICAL_PHOTOGRAPH') {
        score += 20; // Historical media suitability boost
      }
    }

    if (entity.city && (fullText.includes(entity.city.toLowerCase()) || normFullText.includes(stripDiacritics(entity.city).toLowerCase()))) {
      score += 15;
    }
    if (entity.country && (fullText.includes(entity.country.toLowerCase()) || normFullText.includes(stripDiacritics(entity.country).toLowerCase()))) {
      score += 10;
    }
    if (geoEvidence === 'MATCHING') {
      score += 15;
    }
    if (coordinateStatus === 'VERIFIED') {
      score += 10;
    }
    if (isProvisionalGeoConflict) {
      score -= 10;
    }
  }

  // Log detailed media validation
  logImageMediaValidation({
    candidate: title || 'Untitled',
    mediaType: candidateMediaType,
    intentCategory: imageIntent.category,
    compatibility: intentCompatibility.compatibility,
    photographicSuitability,
    accepted: decision === 'ACCEPT',
    rejectionReason: decision === 'REJECT' ? reason : undefined
  });

  // 10. Emitting diagnostic candidate validation logs
  console.log(`[IMAGE GEOGRAPHIC EVIDENCE]
candidateEntityMatch=${entityMatchLevel}
candidateSemanticMatch=${semanticFeatureMatch}
canonicalCoordinateSource=${entity.coordinateSource || 'unknown'}
canonicalCoordinateTrust=${coordinateStatus}
geographicConflict=${isGeoConflicting}
conflictEvidenceTrusted=${conflictEvidenceTrusted}
finalDecision=${decision}`);

  const entityEvidenceStr = evidenceType === 'EXACT_ENTITY'
    ? (entityMatchLevel === 'EXACT' ? 'EXACT_CANONICAL' : 'CANONICAL')
    : (evidenceType === 'KNOWN_ALIAS' ? 'KNOWN_ALIAS' : (evidenceType === 'RELATED_ENTITY' ? 'PARTIAL' : (evidenceType === 'DIRECT_ENTITY_SOURCE' ? 'DIRECT_SOURCE' : 'NONE')));

  const geoEvidenceStr = geoEvidence === 'MATCHING'
    ? (coordinateStatus === 'PROVISIONAL' ? 'PROVISIONAL_MATCH' : 'MATCHING')
    : geoEvidence;

  console.log(`[IMAGE VALIDATION]
entity="${entity.name || ''}"
shape="${shape}"
policy="${policy}"
candidate="${title || 'Untitled'}"
entityEvidence=${entityEvidenceStr}
aliasEvidence=${matchedAlias || 'none'}
semanticEntityEvidence=${semanticFeatureMatch}
geographicEvidence=${geoEvidenceStr}
geographicConflict=${isGeoConflicting}
coordinateTrust=${coordinateStatus}
coordinateSource=${entity.coordinateSource || 'unknown'}
tier=${tier ?? 'NONE'}
finalDecision=${decision}
decision=${decision}
reason=${reason}
rejectionReason=${decision === 'REJECT' ? reason : 'none'}`);

  const geographicConstraintApplied = coordinateStatus === 'VERIFIED' || coordinateStatus === 'PROVISIONAL';

  console.log(`[IMAGE CANDIDATE]
Title=${title ? `"${title}"` : '"Untitled"'}
ImageIntent=${imageIntent.category}
ExplicitMediaIntent=${imageIntent.explicitMediaIntent || false}
MediaType=${candidateMediaType}
MediaEvidence=${mediaClassification.evidence}
PhotographicSuitability=${photographicSuitability}
IntentCompatibility=${intentCompatibility.compatibility}
TopicMatch=${topicMatch}
EntityMatch=${entityMatchLevel}
GeographicEvidence=${geoEvidence}
CoordinateStatus=${coordinateStatus}
GeographicConstraintApplied=${geographicConstraintApplied}
FinalScore=${score}
Decision=${decision}
Reason=${reason}`);

  const matchReasonStr = matchedAlias
    ? (entityMatchLevel === 'COMPONENT' || entityMatchLevel === 'SUBFEATURE' || evidenceType === 'COMPONENT' || evidenceType === 'SUBFEATURE'
      ? `Matched component/subfeature: ${matchedAlias}`
      : `Matched alias: ${matchedAlias}`)
    : (entityMatchLevel === 'EXACT'
      ? 'Exact entity match'
      : (entityMatchLevel === 'CANONICAL'
        ? 'Canonical variant match'
        : (entityMatchLevel === 'ALIAS'
          ? 'Recognized alias match'
          : (entityMatchLevel === 'COMPONENT' || entityMatchLevel === 'SUBFEATURE'
            ? 'Recognized complex component/subfeature'
            : (entityMatchLevel === 'PARTIAL'
              ? 'Partial token overlap'
              : 'No entity name or alias match')))));

  const geoMatchReasonStr = geoMismatchReason || (geoEvidence === 'MATCHING'
    ? 'Geographic metadata matches location'
    : (geoEvidence === 'UNKNOWN'
      ? 'Geographic metadata unknown'
      : 'Geographic mismatch'));

  logImageCandidateValidation({
    candidate: title || 'Untitled',
    entityMatch: entityMatchLevel,
    entityMatchReason: matchReasonStr,
    geographicMatch: geoEvidence,
    geographicMatchReason: geoMatchReasonStr,
    policy,
    accepted: decision === 'ACCEPT',
    rejectionReason: decision === 'REJECT' ? reason : 'none'
  });

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

  // 4. ENTITY_SPECIFIC Query Construction with 7-Stage Escalation Hierarchy
  const queries: string[] = [];
  const rawName = (info.canonicalName || info.name || '').trim();
  const cleanName = rawName.split(/[,–-]/)[0].trim() || rawName;
  const normCleanName = stripDiacritics(cleanName);
  const city = (info.city || '').trim();
  const state = (info.state || '').trim();
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
    return Array.from(new Set(queries.filter(Boolean)));
  }

  // Explicit Media Request Query Generation
  if (imageIntent.explicitMediaIntent) {
    if (imageIntent.category === 'COAT_OF_ARMS') {
      queries.push(`Coat of arms of ${cleanName}`);
      queries.push(`${cleanName} coat of arms`);
      queries.push(`Emblem of ${cleanName}`);
      queries.push(`Arms of ${cleanName}`);
    } else if (imageIntent.category === 'FLAG') {
      queries.push(`Flag of ${cleanName}`);
      queries.push(`${cleanName} flag`);
      queries.push(`National flag of ${cleanName}`);
    } else if (imageIntent.category === 'SEAL') {
      queries.push(`Seal of ${cleanName}`);
      queries.push(`Great seal of ${cleanName}`);
      queries.push(`${cleanName} seal`);
    } else if (imageIntent.category === 'LOGO') {
      queries.push(`${cleanName} logo`);
      queries.push(`Logo of ${cleanName}`);
    } else if (imageIntent.category === 'MAP') {
      queries.push(`Map of ${cleanName}`);
      queries.push(`${cleanName} map`);
      queries.push(`${cleanName} locator map`);
    } else if (imageIntent.category === 'PAINTING') {
      queries.push(`${cleanName} painting`);
      queries.push(`Painting of ${cleanName}`);
      queries.push(`${cleanName} artwork`);
    } else if (imageIntent.category === 'ILLUSTRATION') {
      queries.push(`${cleanName} illustration`);
      queries.push(`${cleanName} historical illustration`);
      queries.push(`${cleanName} engraving`);
    } else if (imageIntent.category === 'HISTORICAL_PHOTOGRAPH') {
      queries.push(`Historical photograph ${cleanName}`);
      queries.push(`Historic photo ${cleanName}`);
      queries.push(`Old photo ${cleanName}`);
      queries.push(`${cleanName} archival photo`);
    } else if (imageIntent.category === 'PHOTOGRAPH') {
      queries.push(`${cleanName} photograph`);
      queries.push(`${cleanName} photo`);
      queries.push(`View of ${cleanName}`);
    }
  }

  // Historical Event Intent Query Generation
  if (imageIntent.category === 'HISTORICAL_EVENT') {
    queries.push(cleanName);
    queries.push(`${cleanName} painting`);
    queries.push(`${cleanName} illustration`);
    queries.push(`${cleanName} battle map`);
    queries.push(`${cleanName} map`);
    queries.push(`${cleanName} historical`);
    queries.push(`${cleanName} battlefield`);
  }

  // Stage 1: Exact unconstrained entity name alone
  if (cleanName) {
    queries.push(cleanName);
  }
  if (rawName && rawName.toLowerCase() !== cleanName.toLowerCase()) {
    queries.push(rawName);
  }

  // Stage 2: Entity + Country
  if (country && country.toLowerCase() !== cleanName.toLowerCase()) {
    queries.push(`${cleanName} ${country}`);
  }

  // Stage 3: Entity + Feature Type / Landscape / Landmark
  const cleanEType = eType.replace(/_/g, ' ').replace(/\b(poi|location|entity)\b/g, '').trim();
  if (cleanEType && !cleanName.toLowerCase().includes(cleanEType)) {
    queries.push(`${cleanName} ${cleanEType}`);
  }
  if (eType.includes('natural') || eType.includes('mountain') || eType.includes('canyon') || eType.includes('feature')) {
    queries.push(`${cleanName} natural feature`);
    queries.push(`${cleanName} landscape`);
  }
  if (eType.includes('historic') || eType.includes('archaeological') || eType.includes('monument') || eType.includes('ruin') || eType.includes('castle') || eType.includes('landmark')) {
    queries.push(`${cleanName} landmark`);
    queries.push(`${cleanName} historic site`);
  }

  // Stage 4: Local language / Contextual photo terms
  const isLusophone = country.toLowerCase().includes('brazil') || country.toLowerCase().includes('brasil') || country.toLowerCase().includes('portugal');
  const isHispanophone = country.toLowerCase().includes('spain') || country.toLowerCase().includes('españa') || country.toLowerCase().includes('mexico') || country.toLowerCase().includes('colombia') || country.toLowerCase().includes('peru') || country.toLowerCase().includes('argentina') || country.toLowerCase().includes('chile');
  if (isLusophone) {
    queries.push(`${cleanName} turismo`);
    queries.push(`${cleanName} fotos`);
    queries.push(`${cleanName} paisagem`);
  } else if (isHispanophone) {
    queries.push(`${cleanName} turismo`);
    queries.push(`${cleanName} fotos`);
    queries.push(`${cleanName} paisaje`);
  } else {
    queries.push(`${cleanName} tourism`);
    queries.push(`${cleanName} photography`);
  }

  // Stage 5: Diacritic-stripped / normalized variants
  if (normCleanName && normCleanName.toLowerCase() !== cleanName.toLowerCase()) {
    queries.push(normCleanName);
    if (country) {
      queries.push(`${normCleanName} ${country}`);
    }
  }

  // Stage 6: Geographic context (City / State / Country)
  if (city && country && city.toLowerCase() !== cleanName.toLowerCase()) {
    queries.push(`${cleanName} ${city} ${country}`);
  }
  if (city && city.toLowerCase() !== cleanName.toLowerCase()) {
    queries.push(`${cleanName} ${city}`);
  }
  if (state && state.toLowerCase() !== cleanName.toLowerCase() && state.toLowerCase() !== city.toLowerCase()) {
    queries.push(`${cleanName} ${state}`);
  }

  // Known landmark-specific expansions
  if (cleanName.toLowerCase() === 'forbidden city') {
    queries.push('Forbidden City Palace Museum Beijing');
  }

  // Stage 7: Regional fallback
  queries.push(`${cleanName} region`);
  queries.push(`${cleanName} surrounding area`);

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

  const isRouteWaypoint = Boolean(effectiveSearchId || info.waypoint || (info as any).routeGroupId || (info as any).routeTitle);
  const maxPhotos = isRouteWaypoint ? 2 : 4;
  const stableId = (info as any).id || (info as any).osmId || info.name;

  const imageIntent = (info as any).imageIntent || resolveImageIntent(info);
  const allRawCandidates: ImageCandidate[] = [];
  const seenRawUrls = new Set<string>();
  const validatedCandidates: Array<{
    candidate: ImageCandidate;
    score: number;
    tier?: ImageRelevanceTier;
    category?: HistoricalImageCategory;
  }> = [];
  const seenUrls = new Set<string>();
  const isHistorical = isHistoricalWaypointEntity(info) && imageIntent.type === 'ENTITY_SPECIFIC';
  const histContext = isHistorical ? extractHistoricalImageContext(info) : null;

  const searchMetrics = {
    queriesAttempted: 0,
    candidatesCollected: 0,
    exactEntityMatches: 0,
    aliasMatches: 0,
    semanticMatches: 0,
    contextualMatches: 0,
    obviousMismatches: 0,
    provisionalGeoConflicts: 0,
    trustedGeoConflicts: 0,
    accepted: 0
  };

  const processCandidate = (candidate: ImageCandidate, intentToUse: ResolvedImageIntent): boolean => {
    if (!candidate.url || typeof candidate.url !== 'string') return false;
    const cleanUrl = candidate.url.trim();
    if (!cleanUrl || seenUrls.has(cleanUrl)) return false;

    const entityAliases = Array.from(new Set([
      ...((info as any).aliases || []),
      ...((info as any).alternateNames || []),
      ...(histContext?.artifacts || []),
      ...(histContext?.people || [])
    ]));

    const validation = validateImageCandidate(candidate, {
      name: info.name,
      canonicalName: (info as any).canonicalName,
      city: info.city,
      state: info.state,
      country: info.country,
      coordinates: info.coordinates,
      coordinateSource: (info as any).coordinateSource,
      coordinateTrust: (info as any).coordinateTrust,
      identityStatus: (info as any).identityStatus,
      entityType: info.entityType || (info as any).type,
      type: (info as any).type,
      intent: (info as any).intent,
      historicalContext: (info as any).historicalContext,
      historicalPeriod: (info as any).historicalPeriod,
      routeTitle: (info as any).routeTitle,
      waypoint: (info as any).waypoint,
      metadataMode: (info as any).metadataMode,
      aliases: entityAliases,
      query: (info as any).rawQuery || (info as any).query,
      rawQuery: (info as any).rawQuery,
      imageIntent: intentToUse
    }, intentToUse);

    if (validation.decision === 'ACCEPT') {
      if (isRouteWaypoint) {
        const mt = validation.mediaType || classifyCandidateMedia(candidate).mediaType;
        if (['MAP', 'FLAG', 'SEAL', 'COAT_OF_ARMS', 'LOGO', 'ORGANIZATION_GRAPHIC', 'DIAGRAM', 'ARCHITECTURAL_DRAWING', 'ICON', 'OTHER_NON_PHOTOGRAPH'].includes(mt)) {
          return false;
        }
      }

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

      searchMetrics.accepted++;
      if (searchMetrics.accepted === 1) {
        logTraceNarration(stableId, info.name, 'first accepted image', `url="${cleanUrl}"`);
      } else if (searchMetrics.accepted === 2) {
        logTraceNarration(stableId, info.name, 'second accepted image', `url="${cleanUrl}"`);
      }

      if (validation.tier === 1) {
        searchMetrics.exactEntityMatches++;
      } else if (validation.tier === 2) {
        if (validation.reason?.includes('ALIAS')) {
          searchMetrics.aliasMatches++;
        } else {
          searchMetrics.semanticMatches++;
        }
      } else if (validation.tier === 3) {
        searchMetrics.contextualMatches++;
      }
      if (validation.reason?.includes('PROVISIONAL_GEO_CONFLICT')) {
        searchMetrics.provisionalGeoConflicts++;
      }
      return true;
    } else {
      searchMetrics.obviousMismatches++;
      if (validation.reason === 'GEOGRAPHIC_CONFLICT') {
        searchMetrics.trustedGeoConflicts++;
      }
      return false;
    }
  };

  const addCandidate = (candidate: ImageCandidate) => {
    if (!candidate.url || typeof candidate.url !== 'string') return;
    const cleanUrl = candidate.url.trim();
    if (!cleanUrl || seenRawUrls.has(cleanUrl)) return;
    seenRawUrls.add(cleanUrl);
    allRawCandidates.push(candidate);
    searchMetrics.candidatesCollected++;
    processCandidate(candidate, imageIntent);
  };

  // 1. Validate primary image or direct image fields on info
  if (info.primaryImage) {
    if (typeof info.primaryImage === 'string') {
      addCandidate({
        url: info.primaryImage,
        caption: info.imageCaption,
        attribution: (info as any).imageAttribution || (info as any).imageCredit || (info as any).imageSource || (info as any).attribution,
        title: info.name
      });
    } else if (typeof info.primaryImage === 'object') {
      const p = info.primaryImage as any;
      addCandidate({
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
      addCandidate({
        url: imgObj,
        caption: info.imageCaption,
        attribution: (info as any).imageAttribution || (info as any).attribution,
        title: info.name
      });
    } else if (typeof imgObj === 'object') {
      addCandidate({
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
        addCandidate({
          url: img,
          caption: info.imageCaption,
          attribution: (info as any).imageAttribution || (info as any).imageCredit || (info as any).imageSource || (info as any).attribution,
          title: info.name
        });
      } else if (typeof img === 'object' && img !== null) {
        const obj = img as any;
        addCandidate({
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
  let queries = buildEntityImageQueries({
    ...info,
    rawQuery: (info as any).rawQuery,
    query: (info as any).query,
    imageIntent
  });

  // For route waypoints, keep queries tightly focused (max 4 queries) to prevent API rate limiting
  if (isRouteWaypoint && queries.length > 4) {
    queries = queries.slice(0, 4);
  }

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

  logTraceNarration(stableId, info.name, 'image search started', `queries=${queries.length} maxPhotos=${maxPhotos}`);
  logTraceNarration(stableId, info.name, 'image validation started');

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    searchMetrics.queriesAttempted++;
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
      if (!res.ok) {
        if (res.status === 429) {
          console.warn(`[IMAGE SEARCH] Wikipedia API rate limited (429 Too Many Requests) for query "${query}". Gracefully skipping.`);
        } else {
          console.warn(`[IMAGE SEARCH] Query "${query}" failed with HTTP status ${res.status}`);
        }
        continue;
      }

      const contentType = res.headers?.get('content-type') || '';
      if (!contentType.includes('json')) {
        console.warn(`[IMAGE SEARCH] Query "${query}" returned non-JSON content-type: ${contentType}. Gracefully skipping.`);
        continue;
      }

      let data: any;
      try {
        data = await res.json();
      } catch (jsonErr) {
        console.warn(`[IMAGE SEARCH] Failed to parse JSON for query "${query}":`, jsonErr);
        continue;
      }

      const pages = data?.query?.pages;

      if (pages) {
        const sortedPageIds = Object.keys(pages).sort((a, b) => ((pages[a] as any).index || 0) - ((pages[b] as any).index || 0));
        for (const pageId of sortedPageIds) {
          if (validatedCandidates.length >= maxPhotos) {
            break;
          }
          const page = pages[pageId];
          if (pageId !== '-1' && page?.thumbnail?.source) {
            const candidateCoords = page.coordinates && page.coordinates.length > 0
              ? { lat: page.coordinates[0].lat, lng: page.coordinates[0].lon }
              : undefined;

            addCandidate({
              url: page.thumbnail.source,
              title: page.title,
              description: page.description,
              caption: page.description || page.title,
              attribution: 'Wikimedia Commons',
              coordinates: candidateCoords
            });

            if (validatedCandidates.length >= maxPhotos) {
              break;
            }
          }
        }
      }
    } catch (e) {
      console.warn(`[IMAGE SEARCH] Failed query "${query}":`, e);
    }

    // If Wikipedia pageimages did not yield enough validated candidates, query Wikimedia Commons
    if (validatedCandidates.length < maxPhotos) {
      try {
        const commonsEndpoint = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&format=json&origin=*`;
        const cRes = await fetch(commonsEndpoint);
        if (cRes.ok) {
          const cContentType = cRes.headers?.get('content-type') || '';
          if (cContentType.includes('json')) {
            const cData = await cRes.json();
            const cPages = cData?.query?.pages;
            if (cPages) {
              const cSortedPageIds = Object.keys(cPages).sort((a, b) => ((cPages[a] as any).index || 0) - ((cPages[b] as any).index || 0));
              for (const pId of cSortedPageIds) {
                if (validatedCandidates.length >= maxPhotos) break;
                const cPage = cPages[pId];
                const imgInfo = cPage?.imageinfo?.[0];
                if (imgInfo?.thumburl || imgInfo?.url) {
                  const rawFileTitle = (cPage.title || '').replace(/^File:/i, '').replace(/\.[a-zA-Z0-9]+$/, '').replace(/_/g, ' ');
                  const rawDesc = imgInfo.extmetadata?.ImageDescription?.value?.replace(/<[^>]*>/g, '').trim();
                  const rawArtist = imgInfo.extmetadata?.Artist?.value?.replace(/<[^>]*>/g, '').trim() || imgInfo.extmetadata?.Credit?.value?.replace(/<[^>]*>/g, '').trim() || 'Wikimedia Commons';
                  addCandidate({
                    url: imgInfo.thumburl || imgInfo.url,
                    title: rawFileTitle,
                    description: rawDesc || rawFileTitle,
                    caption: rawDesc ? (rawDesc.length > 120 ? rawDesc.slice(0, 117) + '...' : rawDesc) : rawFileTitle,
                    attribution: rawArtist
                  });
                }
              }
            }
          }
        }
      } catch (commonsErr) {
        console.warn(`[IMAGE SEARCH] Commons query "${query}" warning:`, commonsErr);
      }
    }

    // Stop searching early if we have reached the max photo target
    if (validatedCandidates.length >= maxPhotos) {
      break;
    }
  }

  // 3. Controlled Fallback Pass when initial validation yields 0 accepted images for ENTITY_SPECIFIC
  const initialCandidateCount = allRawCandidates.length;
  const initialAcceptedCount = validatedCandidates.length;
  let fallbackTriggered = false;
  let fallbackPolicy = 'none';
  let fallbackAcceptedCount = 0;

  if (initialAcceptedCount === 0 && initialCandidateCount > 0 && imageIntent.type === 'ENTITY_SPECIFIC') {
    fallbackTriggered = true;
    if (imageIntent.policy === 'HISTORICAL_WAYPOINT') {
      fallbackPolicy = 'HISTORICAL_WAYPOINT';
    } else {
      fallbackPolicy = 'LANDMARK_ENTITY';
      const fallbackIntent: ResolvedImageIntent = {
        ...imageIntent,
        policy: 'LANDMARK_ENTITY',
        geographicConstraint: false
      };
      for (const candidate of allRawCandidates) {
        if (seenUrls.has(candidate.url.trim())) continue;
        const accepted = processCandidate(candidate, fallbackIntent);
        if (accepted) {
          fallbackAcceptedCount++;
        }
      }
    }
  }

  logImageFallback({
    initialCandidateCount,
    initialAcceptedCount,
    fallbackTriggered,
    fallbackPolicy,
    fallbackAcceptedCount
  });

  console.log(`[IMAGE SEARCH SUMMARY]
entity="${info.name}"
queriesAttempted=${searchMetrics.queriesAttempted}
candidatesCollected=${searchMetrics.candidatesCollected}
exactEntityMatches=${searchMetrics.exactEntityMatches}
aliasMatches=${searchMetrics.aliasMatches}
semanticMatches=${searchMetrics.semanticMatches}
contextualMatches=${searchMetrics.contextualMatches}
obviousMismatches=${searchMetrics.obviousMismatches}
provisionalGeoConflicts=${searchMetrics.provisionalGeoConflicts}
trustedGeoConflicts=${searchMetrics.trustedGeoConflicts}
accepted=${searchMetrics.accepted}`);

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
      : rankedModern.slice(0, maxPhotos);

    const usedCategories = new Set<string>();
    const selectedList: Array<{ candidate: ImageCandidate; score: number; category?: HistoricalImageCategory }> = [];

    // First pass: pick highest scoring candidate from distinct categories
    for (const item of candidatesToUse) {
      const catKey = item.category || 'GENERAL';
      if (!usedCategories.has(catKey)) {
        usedCategories.add(catKey);
        selectedList.push(item);
      }
      if (selectedList.length >= maxPhotos) break;
    }

    // Second pass: fill remaining slots up to maxPhotos if more high-scoring historical candidates exist
    if (selectedList.length < maxPhotos) {
      for (const item of candidatesToUse) {
        if (!selectedList.includes(item)) {
          selectedList.push(item);
        }
        if (selectedList.length >= maxPhotos) break;
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

    for (const { candidate } of prioritizedCandidates.slice(0, maxPhotos)) {
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

  logTraceNarration(stableId, info.name, 'image processing complete', `found=${foundImages.length}`);

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

