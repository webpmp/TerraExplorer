/**
 * Context Classification Utility
 * 
 * Classifies location context and narrative snippets into semantically accurate categories:
 * - Historical Context: real historical events, people, dates, institutions, historical development, heritage
 * - Film & Media: movies, television, books, games, filming locations, fictional representations
 * - Cultural Context: cultural traditions, cultural significance, local identity, notable cultural associations
 * - Scientific/Geographic Context: geological, ecological, scientific, geographic, or environmental significance
 * 
 * Prevents generic geographic labels (e.g. "Northern Ireland", "Central Asia") from being classified as Historical Context.
 */

export type ContextCategory = 'HISTORICAL' | 'FILM_MEDIA' | 'CULTURAL' | 'SCIENTIFIC_GEOGRAPHIC';

export const CONTEXT_CATEGORY_HEADINGS: Record<ContextCategory, string> = {
  HISTORICAL: 'Historical Context',
  FILM_MEDIA: 'Film & Media',
  CULTURAL: 'Cultural Context',
  SCIENTIFIC_GEOGRAPHIC: 'Scientific/Geographic Context'
};

const FILM_MEDIA_PATTERNS = [
  /\b(?:filming|filmed|film\s+location|shooting\s+location|film|films|movie|movies|cinema|cinematography)\b/i,
  /\b(?:television|tv\s+series|tv\s+show|episode|episodes|season|soundtrack|director|actor|actress|hollywood|studio)\b/i,
  /\b(?:game\s+of\s+thrones|westeros|winterfell|king's\s+landing|lord\s+of\s+the\s+rings|middle-earth|hobbit|mordor)\b/i,
  /\b(?:star\s+wars|harry\s+potter|hogwarts|breaking\s+bad|the\s+witcher|marvel|dc\s+comics|peaky\s+blinders|outlander|downton\s+abbey|stranger\s+things|dr\s+who|doctor\s+who)\b/i,
  /\b(?:fictional|fiction|novel|novels|book\s+series|fantasy\s+novel|setting\s+for\s+the\s+novel|adapted\s+into|screen\s+adaptation|video\s+game|cinematic)\b/i
];

const HISTORICAL_PATTERNS = [
  /\b(?:\d{1,2}(?:st|nd|rd|th)\s+century|\b1[0-9]{3}\b|\b20[0-2][0-9]\b|\b[0-9]{1,4}\s*(?:bc|bce|ad|ce)\b)\b/i,
  /\b(?:historical|historically|history|ancient|medieval|antiquity|prehistoric|renaissance|colonial|post-war|iron\s+age|bronze\s+age)\b/i,
  /\b(?:empire|dynasty|kingdom|reign|conquest|invaded|invasion|treaty|battle\s+of|war\s+of|civil\s+war|revolution|world\s+war|rebellion|uprising)\b/i,
  /\b(?:founded\s+in|established\s+in|chartered\s+in|built\s+in|constructed\s+in|discovered\s+in|settlement\s+founded|historic\s+site|historic\s+heritage|historic\s+milestone)\b/i,
  /\b(?:archaeology|archaeological|excavation|artifact|monarch|king|queen|emperor|pharaoh|tsar|sultan|president|prime\s+minister)\b/i,
  /\b(?:sputnik|cosmodrome|space\s+race|apollo|voyage|expedition|shipwreck|salvaged|maiden\s+voyage|shackleton|columbus)\b/i
];

const CULTURAL_PATTERNS = [
  /\b(?:cultural|culturally|culture|tradition|traditions|traditional|folklore|indigenous|ritual|rituals|custom|customs)\b/i,
  /\b(?:spiritual|sacred|pilgrimage|pilgrim|religious|shinto|temple|shrine|mosque|cathedral|monastery|ceremony|ceremonial)\b/i,
  /\b(?:cuisine|culinary|gastronomy|artisan|folktale|mythology|mythological|tribal|tribe|ethnic|local\s+identity|communal)\b/i,
  /\b(?:festival|annual\s+celebration|carnival|folk\s+art|music\s+tradition|heritage\s+site|symbol\s+of\s+the\s+people)\b/i
];

const SCIENTIFIC_GEOGRAPHIC_PATTERNS = [
  /\b(?:geological|geology|tectonic|plate\s+tectonics|volcano|volcanic|crater|caldera|lava|magma|eruption|seismic|fault\s+line)\b/i,
  /\b(?:ecological|ecology|ecosystem|ecosystems|biodiversity|habitat|habitats|flora|fauna|endemic\s+species|wildlife|biosphere)\b/i,
  /\b(?:scientific|geographical|glacier|glacial|moraine|canyon|gorge|karst|formation|topography|biome|geothermal)\b/i,
  /\b(?:nature\s+reserve|national\s+park|protected\s+area|marine\s+sanctuary|conservation|meteorology|climate\s+zone|astronomical|observatory)\b/i
];

/**
 * Detects if a string is purely a geographic/administrative name or label
 * (e.g. "Northern Ireland", "Central Asia", "County Down, UK")
 * rather than substantive narrative context.
 */
export function isPureGeographicLabel(text: string): boolean {
  if (!text) return true;
  const clean = text.replace(/^#+\s*/, '').trim();
  if (clean.length === 0) return true;
  if (/^(?:n\/a|unknown|none|null|undefined|-)$/i.test(clean)) return true;

  // Very short text (<= 4 words) without punctuation or verbs is almost always a place label
  const words = clean.split(/\s+/);
  if (words.length <= 4) {
    const hasNarrativeVerb = /\b(?:is|was|were|are|served|built|filmed|occurred|took\s+place|features|contains|marks|represents|founded|established|became|provides)\b/i.test(clean);
    const hasPunctuationSentence = /[.!?]/.test(clean);
    if (!hasNarrativeVerb && !hasPunctuationSentence) {
      return true;
    }
  }

  // Pure region/country/state names
  const pureRegionRegex = /^(?:Northern Ireland|Central Asia|Western Europe|Eastern Europe|North America|South America|Middle East|Southeast Asia|East Asia|United Kingdom|United States|County [A-Za-z\s]+|[A-Za-z\s]+ Province|[A-Za-z\s]+ Region)$/i;
  if (pureRegionRegex.test(clean)) {
    return true;
  }

  return false;
}

export interface ContextClassificationResult {
  category: ContextCategory | null;
  heading: string | null;
  isGeographicOnly: boolean;
  isMeaningful: boolean;
}

/**
 * Classifies a narrative context snippet into one of the 4 semantic categories,
 * or returns null if it is purely geographic, empty, or lacks meaningful context.
 */
export function classifyContext(text: string): ContextClassificationResult {
  if (!text || text.trim().length === 0) {
    return { category: null, heading: null, isGeographicOnly: false, isMeaningful: false };
  }

  const clean = text.replace(/^#+\s*/, '').trim();
  if (isPureGeographicLabel(clean)) {
    return { category: null, heading: null, isGeographicOnly: true, isMeaningful: false };
  }

  // Calculate pattern match scores
  let filmScore = 0;
  for (const pat of FILM_MEDIA_PATTERNS) {
    if (pat.test(clean)) filmScore += 2;
  }

  let histScore = 0;
  for (const pat of HISTORICAL_PATTERNS) {
    if (pat.test(clean)) histScore += 2;
  }

  let cultScore = 0;
  for (const pat of CULTURAL_PATTERNS) {
    if (pat.test(clean)) cultScore += 2;
  }

  let sciScore = 0;
  for (const pat of SCIENTIFIC_GEOGRAPHIC_PATTERNS) {
    if (pat.test(clean)) sciScore += 2;
  }

  // Strong Film & Media signals take top precedence for film/series queries and locations
  if (filmScore >= 2 && filmScore >= histScore) {
    return {
      category: 'FILM_MEDIA',
      heading: CONTEXT_CATEGORY_HEADINGS.FILM_MEDIA,
      isGeographicOnly: false,
      isMeaningful: true
    };
  }

  // Scientific / Geographic significance
  if (sciScore >= 2 && sciScore > histScore && sciScore > cultScore) {
    return {
      category: 'SCIENTIFIC_GEOGRAPHIC',
      heading: CONTEXT_CATEGORY_HEADINGS.SCIENTIFIC_GEOGRAPHIC,
      isGeographicOnly: false,
      isMeaningful: true
    };
  }

  // Cultural context
  if (cultScore >= 2 && cultScore > histScore) {
    return {
      category: 'CULTURAL',
      heading: CONTEXT_CATEGORY_HEADINGS.CULTURAL,
      isGeographicOnly: false,
      isMeaningful: true
    };
  }

  // Historical context
  if (histScore >= 2) {
    return {
      category: 'HISTORICAL',
      heading: CONTEXT_CATEGORY_HEADINGS.HISTORICAL,
      isGeographicOnly: false,
      isMeaningful: true
    };
  }

  // If text is a descriptive narrative (> 40 chars with verbs) but none of the specific sets fired high:
  const hasNarrativeVerb = /\b(?:was|is|were|are|built|founded|served|became|located|developed|established|named|known)\b/i.test(clean);
  if (clean.length > 40 && hasNarrativeVerb) {
    // Check if it mentions media terms at all
    if (/\b(?:film|filmed|movie|series|game|show|television|character|novel|book)\b/i.test(clean)) {
      return { category: 'FILM_MEDIA', heading: CONTEXT_CATEGORY_HEADINGS.FILM_MEDIA, isGeographicOnly: false, isMeaningful: true };
    }
    if (/\b(?:nature|wildlife|species|geology|mountain|river|lake|park|geothermal|volcano|rock)\b/i.test(clean)) {
      return { category: 'SCIENTIFIC_GEOGRAPHIC', heading: CONTEXT_CATEGORY_HEADINGS.SCIENTIFIC_GEOGRAPHIC, isGeographicOnly: false, isMeaningful: true };
    }
    if (/\b(?:tradition|custom|festival|art|sacred|spiritual|people|community)\b/i.test(clean)) {
      return { category: 'CULTURAL', heading: CONTEXT_CATEGORY_HEADINGS.CULTURAL, isGeographicOnly: false, isMeaningful: true };
    }
    // Default genuine location narrative to Historical Context if historical terms / dates or establishment is described
    if (/\b(?:century|\d{4}|ancient|historic|history|founded|built|war|battle|monarch|empire)\b/i.test(clean)) {
      return { category: 'HISTORICAL', heading: CONTEXT_CATEGORY_HEADINGS.HISTORICAL, isGeographicOnly: false, isMeaningful: true };
    }
  }

  // Not enough domain substance to justify a specialized context section
  return { category: null, heading: null, isGeographicOnly: false, isMeaningful: false };
}

/**
 * Normalizes or re-classifies markdown headings in a description string.
 * - Reclassifies generic "Historical context" or "History" headings if the content below is Film & Media, Cultural, etc.
 * - Drops headings and text when content is purely a geographic label (e.g. "Northern Ireland").
 */
export function sanitizeContextMarkdown(markdown: string): string {
  if (!markdown) return '';

  const paragraphs = markdown.split(/\n\s*\n/);
  const sanitizedParagraphs: string[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i].trim();
    if (!p) continue;

    const headingMatch = p.match(/^#{1,3}\s+(.+)$/m);
    if (headingMatch) {
      const headingTitle = headingMatch[1].trim();
      const headingLower = headingTitle.toLowerCase();

      // Check if this is a context heading
      const isContextHeading = /^(?:historical\s+context|historical\s+background|history|context|background|cultural\s+context|film\s*(?:&|and)\s*media|scientific\s*(?:&|\/|and)\s*geographic\s*context)$/i.test(headingLower);

      if (isContextHeading) {
        // Look at the content inside this paragraph (after the heading) or the next paragraph
        const textInParagraph = p.replace(/^#{1,3}\s+.+$/m, '').trim();
        const contentSnippet = textInParagraph || (paragraphs[i + 1] ? paragraphs[i + 1].trim() : '');

        if (isPureGeographicLabel(contentSnippet)) {
          // Skip this heading paragraph completely, and skip the next paragraph if it was the geographic label
          if (!textInParagraph && paragraphs[i + 1] && isPureGeographicLabel(paragraphs[i + 1].trim())) {
            i++; // skip next paragraph
          }
          continue;
        }

        const classification = classifyContext(contentSnippet);
        if (classification.category) {
          const targetHeading = `## ${classification.heading}`;
          if (textInParagraph) {
            sanitizedParagraphs.push(`${targetHeading}\n\n${textInParagraph}`);
          } else {
            sanitizedParagraphs.push(targetHeading);
          }
        } else if (textInParagraph) {
          // If not specialized context, keep text without fake context header
          sanitizedParagraphs.push(textInParagraph);
        }
        continue;
      }
    }

    // Normal paragraph
    sanitizedParagraphs.push(p);
  }

  return sanitizedParagraphs.join('\n\n');
}
