import { parseAndExtract } from '../utils/jsonParser';
import { estimateTokens } from './tokenEstimator';

export interface ExtractedChunkLocation {
  name: string;
  canonicalName?: string;
  role?: string;
  date?: string;
  historicalPeriod?: string;
  description?: string;
  sourceEvidence?: string;
  lat?: number;
  lng?: number;
}

export interface ChunkExtractionResult {
  chunkIndex: number;
  totalChunks: number;
  locations: ExtractedChunkLocation[];
  rawText?: string;
}

export interface LargeSourceExtractionPlan {
  chunks: string[];
  totalEstimatedTokens: number;
  averageChunkTokens: number;
}

export interface CompactSourceRepresentation {
  title: string;
  reducedContent: string;
  reducedCharacterCount: number;
  reducedEstimatedTokens: number;
  mergedLocations: ExtractedChunkLocation[];
}

export const TARGET_CHUNK_TOKENS = 2500; // Comfortable single-chunk context budget
export const OVERLAP_SENTENCE_COUNT = 1;

/**
 * Splits cleaned source text into coherent chunks targeting ~2,000–3,500 tokens each.
 * Boundaries prioritize sections (##, ===), then paragraphs (\n\n), then sentences.
 */
export function chunkSourceText(text: string, targetTokens: number = TARGET_CHUNK_TOKENS): string[] {
  if (!text || typeof text !== 'string') return [];
  const clean = text.trim();
  if (!clean) return [];

  const totalEst = estimateTokens(clean);
  if (totalEst <= targetTokens) {
    return [clean];
  }

  // Split into structural blocks by double newline (paragraphs / section blocks)
  const rawParagraphs = clean.split(/\n{2,}/);
  const paragraphs: string[] = [];
  
  for (const p of rawParagraphs) {
    const trimmedP = p.trim();
    if (!trimmedP) continue;
    // If an individual paragraph is enormous, split by sentences
    if (estimateTokens(trimmedP) > targetTokens) {
      const sentences = trimmedP.split(/(?<=[.?!])\s+/);
      let subP = '';
      for (const s of sentences) {
        if (estimateTokens(subP + ' ' + s) > targetTokens && subP) {
          paragraphs.push(subP.trim());
          subP = s;
        } else {
          subP = subP ? subP + ' ' + s : s;
        }
      }
      if (subP.trim()) {
        paragraphs.push(subP.trim());
      }
    } else {
      paragraphs.push(trimmedP);
    }
  }

  const chunks: string[] = [];
  let currentChunkParagraphs: string[] = [];
  let currentChunkTokens = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const pTokens = estimateTokens(p);

    if (currentChunkTokens + pTokens > targetTokens && currentChunkParagraphs.length > 0) {
      chunks.push(currentChunkParagraphs.join('\n\n'));
      
      // Overlap: retain the last sentence or last small paragraph for context
      const lastP = currentChunkParagraphs[currentChunkParagraphs.length - 1];
      const overlapSentences = lastP.split(/(?<=[.?!])\s+/);
      const overlapText = overlapSentences.slice(-OVERLAP_SENTENCE_COUNT).join(' ');

      currentChunkParagraphs = overlapText ? [overlapText, p] : [p];
      currentChunkTokens = estimateTokens(overlapText) + pTokens;
    } else {
      currentChunkParagraphs.push(p);
      currentChunkTokens += pTokens;
    }
  }

  if (currentChunkParagraphs.length > 0) {
    chunks.push(currentChunkParagraphs.join('\n\n'));
  }

  return chunks;
}

/**
 * Builds the compact extraction prompt for a single source chunk.
 */
export function buildChunkExtractionPrompt(chunkText: string, chunkIndex: number, totalChunks: number): string {
  return `
Task: Extract physical and historical geographic locations from this excerpt (Part ${chunkIndex + 1} of ${totalChunks}).
Source Excerpt:
--- BEGIN SOURCE EXCERPT ---
${chunkText.trim()}
--- END SOURCE EXCERPT ---

EXTRACTION INSTRUCTIONS:
1. Identify named physical geographic locations (cities, towns, islands, ports, archaeological sites, museums, fortifications, mountains, bodies of water, monuments).
2. For each location mentioned:
   - "name": Clean name of the place.
   - "canonicalName": Standard historical or geographical name.
   - "role": Specific historical or contextual role in this excerpt (e.g. "wreck site", "discovery location", "current preservation site", "birthplace", "battle site").
   - "date": Date or date range if explicitly mentioned for this place.
   - "historicalPeriod": Time period if mentioned.
   - "description": 1 concise sentence summarizing what occurred or is located here according to this excerpt.
   - "sourceEvidence": Direct quote or sentence from the excerpt naming and describing this place.
3. DO NOT fabricate coordinates or guess distant locations not in the text.
4. DO NOT extract editorial section headings or generic non-geographic phrases.

JSON Schema:
{
  "locations": [
    {
      "name": "Location Name",
      "canonicalName": "Canonical Name",
      "role": "Role in event/article",
      "date": "Year or date",
      "historicalPeriod": "Era/Period",
      "description": "1 concise sentence from source",
      "sourceEvidence": "Exact verbatim sentence from excerpt"
    }
  ]
}
Output strictly compact JSON.
`.trim();
}

/**
 * Merges and deduplicates candidate locations across chunk extractions.
 */
export function mergeAndDeduplicateChunkLocations(chunkResults: ExtractedChunkLocation[][]): ExtractedChunkLocation[] {
  const map = new Map<string, ExtractedChunkLocation>();

  for (const list of chunkResults) {
    if (!Array.isArray(list)) continue;
    for (const loc of list) {
      if (!loc || typeof loc !== 'object') continue;
      const rawName = (loc.name || loc.canonicalName || '').trim();
      if (!rawName || rawName.length < 2) continue;

      // Normalization keys: check raw name, canonical name, and simplified core name
      const cleanCore = (loc.canonicalName || rawName)
        .toLowerCase()
        .replace(/,\s*.*$/, '') // drop comma-separated city/region
        .replace(/\s+(?:island|islands|museum|ruins|site|port|harbor|fort)\b/gi, '') // generic suffix
        .replace(/[^a-z0-9]/g, '');

      const key = (loc.canonicalName || rawName).toLowerCase().replace(/[^a-z0-9]/g, '');
      
      // Find existing match by key or cleanCore
      let existingKey: string | undefined;
      if (map.has(key)) {
        existingKey = key;
      } else if (cleanCore.length >= 4 && map.has(cleanCore)) {
        existingKey = cleanCore;
      } else {
        // Search across existing values for matching canonical or cleanCore
        for (const [k, v] of map.entries()) {
          const vCore = (v.canonicalName || v.name).toLowerCase().replace(/,\s*.*$/, '').replace(/\s+(?:island|islands|museum|ruins|site|port|harbor|fort)\b/gi, '').replace(/[^a-z0-9]/g, '');
          const vKey = (v.canonicalName || v.name).toLowerCase().replace(/[^a-z0-9]/g, '');
          if (vKey === key || (cleanCore.length >= 4 && vCore === cleanCore)) {
            existingKey = k;
            break;
          }
        }
      }

      if (!existingKey) {
        map.set(key, { ...loc });
      } else {
        const existing = map.get(existingKey)!;
        // Merge richer details
        const longestDesc = (loc.description && loc.description.length > (existing.description || '').length)
          ? loc.description
          : existing.description;

        const combinedEvidence = [existing.sourceEvidence, loc.sourceEvidence]
          .filter((e): e is string => Boolean(e && typeof e === 'string' && e.trim().length > 0))
          .filter((e, idx, arr) => arr.indexOf(e) === idx)
          .join(' | ');

        existing.description = longestDesc;
        existing.sourceEvidence = combinedEvidence || existing.sourceEvidence;
        existing.role = existing.role || loc.role;
        existing.date = existing.date || loc.date;
        existing.historicalPeriod = existing.historicalPeriod || loc.historicalPeriod;
        existing.canonicalName = existing.canonicalName || loc.canonicalName;
        // Prefer more descriptive name
        if (loc.name && loc.name.length > (existing.name || '').length && !loc.name.includes(',')) {
          existing.name = loc.name;
        }
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Formats merged locations and key context into a compact representation for the TRACE ROUTE pipeline.
 */
export function formatCompactSourceRepresentation(
  title: string,
  locations: ExtractedChunkLocation[]
): CompactSourceRepresentation {
  const lines: string[] = [];
  lines.push(`SOURCE TYPE: Extracted Large Article Summary`);
  lines.push(`TITLE: ${title || 'Article Summary'}\n`);
  lines.push(`LOCATIONS EXTRACTED FROM SOURCE:`);

  locations.forEach((loc, idx) => {
    lines.push(`${idx + 1}. ${loc.name || loc.canonicalName}`);
    if (loc.canonicalName && loc.canonicalName !== loc.name) {
      lines.push(`   Canonical Name: ${loc.canonicalName}`);
    }
    if (loc.role) {
      lines.push(`   Role: ${loc.role}`);
    }
    if (loc.date || loc.historicalPeriod) {
      lines.push(`   Period/Date: ${[loc.historicalPeriod, loc.date].filter(Boolean).join(', ')}`);
    }
    if (loc.description) {
      lines.push(`   Summary: ${loc.description}`);
    }
    if (loc.sourceEvidence) {
      lines.push(`   Evidence: "${loc.sourceEvidence}"`);
    }
    lines.push('');
  });

  const reducedContent = lines.join('\n').trim();
  return {
    title: title || 'Article Summary',
    reducedContent,
    reducedCharacterCount: reducedContent.length,
    reducedEstimatedTokens: estimateTokens(reducedContent),
    mergedLocations: locations
  };
}

/**
 * Main orchestrator for chunking, extracting, and reducing large source text.
 */
export async function extractAndReduceLargeSource(params: {
  cleanedText: string;
  title: string;
  generateFn: (callParams: any) => Promise<any>;
  model: string;
  signal?: AbortSignal;
}): Promise<CompactSourceRepresentation> {
  const { cleanedText, title, generateFn, model, signal } = params;

  const chunks = chunkSourceText(cleanedText, TARGET_CHUNK_TOKENS);
  console.log(`[TRACE ROUTE CHUNKING] chunks=${chunks.length}`);

  const chunkResults: ExtractedChunkLocation[][] = [];

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const chunk = chunks[i];
    console.log(`[TRACE ROUTE EXTRACTION] chunk=${i + 1}/${chunks.length}`);

    const prompt = buildChunkExtractionPrompt(chunk, i, chunks.length);
    try {
      const response = await generateFn({
        model,
        contents: prompt,
        config: {
          maxOutputTokens: 2048
        },
        signal
      });

      const parsed = parseAndExtract(response?.text || '');
      let locs: ExtractedChunkLocation[] = [];
      if (parsed.success && parsed.value) {
        if (Array.isArray(parsed.value.locations)) {
          locs = parsed.value.locations;
        } else if (Array.isArray(parsed.value.route)) {
          locs = parsed.value.route;
        } else if (Array.isArray(parsed.value)) {
          locs = parsed.value;
        }
      }

      console.log(`[TRACE ROUTE EXTRACTION] chunk=${i + 1} candidates=${locs.length}`);
      chunkResults.push(locs);
    } catch (err: any) {
      console.warn(`[TRACE ROUTE EXTRACTION] chunk ${i + 1} extraction failed:`, err);
      // Continue with next chunk
    }
  }

  const merged = mergeAndDeduplicateChunkLocations(chunkResults);
  console.log(`[TRACE ROUTE EXTRACTION] merged candidates=${merged.length}`);

  const compact = formatCompactSourceRepresentation(title, merged);
  console.log(`[TRACE ROUTE INPUT] Reduced source length=${compact.reducedCharacterCount}`);
  console.log(`[TRACE ROUTE INPUT] Reduced estimated tokens=${compact.reducedEstimatedTokens}`);

  return compact;
}
