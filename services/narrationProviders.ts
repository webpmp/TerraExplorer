/**
 * Narration Providers for TerraExplorer:
 * - SystemVoiceProvider: Native browser Web Speech API speech synthesis
 * - KokoroTTSProvider: Ultra-fast local neural TTS via HTTP (http://127.0.0.1:8880/tts) + Web Audio API
 * - OrpheusTTSProvider: Progressive streaming TTS via SSE (http://127.0.0.1:8765/tts/stream) + Web Audio API
 */

import { NarrationProviderType } from '../types';
import { logTraceNarration, logProviderStart, logProviderComplete } from './waypointPipelineService';
import { logTraceTiming } from './traceTimingService';

export interface NarrationUnit {
  section: 'SUMMARY' | 'NOTABLE' | 'CLIMATE' | 'EXPLORE' | 'NEWS';
  text: string;
}

export interface NarrationSpeakOptions {
  title: string;
  description: string;
  units?: NarrationUnit[];
  waypointId?: string;
  provider?: NarrationProviderType;
  voiceURI?: string;
  kokoroVoice?: string;
  orpheusVoice?: string;
  limit?: number;
  speed?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: unknown) => void;
}

export interface KokoroVoiceOption {
  id: string;
  name: string;
  accent: string;
}

export const KOKORO_VOICES: KokoroVoiceOption[] = [
  { id: 'am_michael', name: 'Michael', accent: 'American' },
  { id: 'bm_george', name: 'George', accent: 'British' },
  { id: 'af_bella', name: 'Bella', accent: 'American' },
  { id: 'af_sarah', name: 'Sarah', accent: 'American' },
  { id: 'bf_emma', name: 'Emma', accent: 'British' },
  { id: 'bf_isabella', name: 'Isabella', accent: 'British' }
];

export interface OrpheusVoiceOption {
  id: string;
  name: string;
}

export const ORPHEUS_VOICES: OrpheusVoiceOption[] = [
  { id: 'tara', name: 'Tara' },
  { id: 'leah', name: 'Leah' },
  { id: 'jess', name: 'Jess' },
  { id: 'leo', name: 'Leo' },
  { id: 'dan', name: 'Dan' },
  { id: 'mia', name: 'Mia' },
  { id: 'zac', name: 'Zac' },
  { id: 'zoe', name: 'Zoe' }
];

export interface INarrationProvider {
  readonly id: NarrationProviderType;
  speak(script: string, options: NarrationSpeakOptions): Promise<void> | void;
  cancel(): void;
  isSpeaking(): boolean;
  setVolume(volume: number): void;
  setSpeed(speed: number): void;
}

/**
 * Sanitizes text for natural speech synthesis:
 * - Strips Markdown headers, bold/italic asterisks/underscores, bullet points
 * - Strips citations/brackets e.g. [1], [2], [citation needed]
 * - Strips URLs and HTML tags
 * - Strips raw coordinate strings and UI metadata prefixes
 */
export function cleanNarrationText(text: string): string {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text
    // Strip HTML tags
    .replace(/<[^>]*>/g, '')
    // Strip URLs
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/www\.\S+/gi, '')
    // Strip markdown links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Strip citation brackets [1], [2], [citation needed]
    .replace(/\[\s*\d+\s*\]/g, '')
    .replace(/\[\s*citation needed\s*\]/gi, '')
    .replace(/\[\s*edit\s*\]/gi, '')
    // Strip Markdown headers (### Header)
    .replace(/^#{1,6}\s+/gm, '')
    // Strip Markdown list markers (*, -, +, 1.)
    .replace(/^[\s*+-]+(?=\S)/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    // Strip bold / italic / strike markdown
    .replace(/[*_~`]/g, '')
    // Strip coordinate patterns e.g. 50°22'N 4°08'W or 50.3755, -4.1427
    .replace(/\b-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}\b/g, '')
    // Strip common raw metadata prefixes e.g. "Overview:", "Climate:", "Population:", "Coordinates:"
    .replace(/^(overview|climate|population|coordinates|significance|highlights|notable facts|notable fact|explore|recent news|news)\s*[:\-]\s*/gi, '')
    // Collapse multiple whitespace
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

/**
 * Deterministically removes a redundant leading occurrence of the title from the description.
 * Case-insensitive and tolerant of normal punctuation and whitespace variations.
 * Preserves occurrences of the title that appear later in the description.
 */
export function removeLeadingTitleFromDescription(title: string, description: string): string {
  if (!title || !description) return description || '';

  const cleanTitle = cleanNarrationText(title).trim();
  const cleanDesc = cleanNarrationText(description).trim();
  if (!cleanTitle || !cleanDesc) return cleanDesc;

  // Escape special regex characters in title
  const escapedTitle = cleanTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const strippedTitle = cleanTitle.replace(/^(the|a|an)\s+/i, '').trim();
  const escapedStripped = strippedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const titlePattern = strippedTitle && strippedTitle !== cleanTitle
    ? `(?:(?:hms|rms|ss|uss)\\s+)?(?:${escapedTitle}|${escapedStripped})`
    : `(?:(?:hms|rms|ss|uss)\\s+)?${escapedTitle}`;

  // Pattern A: Title followed by copula (is/was/are/were) and optional article (a/an/the)
  // Example: "Teresio Olivelli park is a beloved..." -> "A beloved..."
  // Example: "Como Cathedral is the Roman Catholic..." -> "The Roman Catholic..."
  const copulaRegex = new RegExp(`^(?:the\\s+)?${titlePattern}\\s*(?:[.,;:—–-]+\\s*)?(?:is|was|are|were)\\s+(?:(a|an|the)\\s+)?`, 'i');
  const copulaMatch = cleanDesc.match(copulaRegex);
  if (copulaMatch) {
    const article = copulaMatch[1];
    const remainder = cleanDesc.slice(copulaMatch[0].length).trim();
    if (remainder.length > 0) {
      if (article) {
        const capitalizedArticle = article.charAt(0).toUpperCase() + article.slice(1).toLowerCase();
        return `${capitalizedArticle} ${remainder}`;
      }
      return remainder.charAt(0).toUpperCase() + remainder.slice(1);
    }
  }

  // Pattern B: Title followed by punctuation (., -, :, —, ,, ;) and whitespace
  // Example: "Teresio Olivelli park, located in..." -> "Located in..."
  // Example: "Teresio Olivelli park. It is..." -> "It is..."
  // Example: "Teresio Olivelli park - a popular..." -> "A popular..."
  const punctRegex = new RegExp(`^(?:the\\s+)?${titlePattern}\\s*[.,;:—–-]+\\s*`, 'i');
  const punctMatch = cleanDesc.match(punctRegex);
  if (punctMatch) {
    const remainder = cleanDesc.slice(punctMatch[0].length).trim();
    if (remainder.length > 0) {
      return remainder.charAt(0).toUpperCase() + remainder.slice(1);
    }
  }

  // Pattern C: Title directly followed by a verb or phrase
  // Example: "Teresio Olivelli park features a serene..." -> "Features a serene..."
  const directRegex = new RegExp(`^(?:the\\s+)?${titlePattern}\\s+`, 'i');
  const directMatch = cleanDesc.match(directRegex);
  if (directMatch) {
    const remainder = cleanDesc.slice(directMatch[0].length).trim();
    if (remainder.length > 0) {
      return remainder.charAt(0).toUpperCase() + remainder.slice(1);
    }
  }

  return cleanDesc;
}

/**
 * Builds the formatted narration text from structured title & description.
 */
export function buildNarrationScript(title: string, description: string): string {
  const cleanTitle = cleanNarrationText(title).trim();
  const cleanDesc = cleanNarrationText(description).trim();

  if (!cleanTitle && !cleanDesc) return '';
  if (!cleanTitle) return cleanDesc;
  if (!cleanDesc) return cleanTitle;

  const normalizedDesc = removeLeadingTitleFromDescription(cleanTitle, cleanDesc);

  // Ensure title ends with punctuation before appending description
  const titlePunct = /[.!?]$/.test(cleanTitle) ? cleanTitle : `${cleanTitle}.`;
  return `${titlePunct} ${normalizedDesc}`;
}

/**
 * Caps description text for narration at a sentence-safe maximum character budget (default 600 chars).
 * - If description <= maxChars, returns unchanged.
 * - Truncates at the end of the last complete sentence within maxChars (. ! ? followed by optional quotes/brackets).
 * - Never ends mid-sentence or appends ellipses.
 * - If no sentence boundary exists <= maxChars, extends to the end of the first complete sentence.
 */
export function capDescriptionForNarration(description: string, maxChars: number = 600): string {
  const limit = typeof maxChars === 'number' && !isNaN(maxChars) && maxChars > 0 ? maxChars : 600;
  if (!description || description.length <= limit) {
    return description || '';
  }

  const boundarySubstr = description.substring(0, limit);
  // Match sentence endings: [.!?] followed by optional closing punctuation (' " ” ’ ) ]), followed by whitespace or end of string
  const sentenceRegex = /[.!?]['"”’)}\]]*(?=\s|$)/g;

  let lastIndex = -1;
  let match: RegExpExecArray | null;
  while ((match = sentenceRegex.exec(boundarySubstr)) !== null) {
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex > 0) {
    return description.substring(0, lastIndex).trim();
  }

  // Fallback: No complete sentence ended within limit. Find the first complete sentence after limit.
  sentenceRegex.lastIndex = limit;
  const nextMatch = sentenceRegex.exec(description);
  if (nextMatch) {
    return description.substring(0, nextMatch.index + nextMatch[0].length).trim();
  }

  return description.trim();
}

/**
/**
 * Splits a content unit string into sentence-bounded chunks if it exceeds maxChars.
 */
export function chunkContentUnit(text: string, maxChars: number = 600): string[] {
  if (!text || typeof text !== 'string') return [];
  const limit = typeof maxChars === 'number' && !isNaN(maxChars) && maxChars > 0 ? maxChars : 600;
  const clean = cleanNarrationText(text).trim();
  if (!clean) return [];
  if (clean.length <= limit) return [clean];

  const chunks: string[] = [];
  let remaining = clean;

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }
    const chunk = capDescriptionForNarration(remaining, limit);
    if (!chunk || chunk.length === 0) {
      chunks.push(remaining);
      break;
    }
    chunks.push(chunk);
    remaining = remaining.slice(chunk.length).trim();
  }

  return chunks;
}

/**
 * Splits enriched waypoint narration into two clean, self-contained segments:
 * 1. Opening segment: A concise, natural spoken introduction (target ~25-40 words, 1-2 complete sentences).
 * 2. Remainder segment: The remaining complete sentences of the description.
 *
 * If the description is already short (<= 35 words or 1 sentence), only 1 segment is returned.
 */
export function splitNarrationIntoSegments(
  title: string,
  description: string,
  maxChars: number = 600
): { opening: string; remainder: string } {
  const cleanTitle = cleanNarrationText(title).trim();
  const rawDesc = cleanNarrationText(description).trim();

  if (!cleanTitle && !rawDesc) {
    return { opening: '', remainder: '' };
  }
  if (!rawDesc) {
    return { opening: cleanTitle, remainder: '' };
  }

  const cappedDesc = capDescriptionForNarration(rawDesc, maxChars);
  if (cappedDesc.length < rawDesc.length) {
    console.log(`[OrpheusTTS] Description capped for narration: originalLength=${rawDesc.length} narrationLength=${cappedDesc.length}`);
    console.log(`[KokoroTTS] Description capped for narration: originalLength=${rawDesc.length} narrationLength=${cappedDesc.length}`);
  }

  const normalizedDesc = removeLeadingTitleFromDescription(cleanTitle, cappedDesc);

  // Extract individual sentences with terminal punctuation
  const sentenceMatches: string[] = [];
  const sentenceRegex = /[^.!?]+[.!?]['"”’)}\]]*(?=\s|$)/g;
  let match: RegExpExecArray | null;
  let lastEnd = 0;

  while ((match = sentenceRegex.exec(normalizedDesc)) !== null) {
    const s = match[0].trim();
    if (s) {
      sentenceMatches.push(s);
    }
    lastEnd = match.index + match[0].length;
  }

  // If trailing text exists without standard terminal punctuation
  if (lastEnd < normalizedDesc.length) {
    const remaining = normalizedDesc.slice(lastEnd).trim();
    if (remaining) {
      sentenceMatches.push(remaining);
    }
  }

  if (sentenceMatches.length <= 1) {
    return {
      opening: buildNarrationScript(cleanTitle, normalizedDesc),
      remainder: ''
    };
  }

  const titleWords = cleanTitle ? cleanTitle.split(/\s+/).filter(Boolean).length : 0;
  const sentenceWordCounts = sentenceMatches.map((s) => s.split(/\s+/).filter(Boolean).length);
  const totalWords = titleWords + sentenceWordCounts.reduce((acc, c) => acc + c, 0);

  // If total narration is short, keep as single segment
  if (totalWords <= 35) {
    return {
      opening: buildNarrationScript(cleanTitle, normalizedDesc),
      remainder: ''
    };
  }

  // Determine how many sentences to allocate to the opening segment (aim for 25-40 words)
  let openingSentenceCount = 1;
  const wordsFirstSentence = titleWords + sentenceWordCounts[0];

  if (wordsFirstSentence < 22 && sentenceMatches.length > 2) {
    const wordsTwoSentences = wordsFirstSentence + sentenceWordCounts[1];
    if (wordsTwoSentences <= 45) {
      openingSentenceCount = 2;
    }
  }

  const openingSentences = sentenceMatches.slice(0, openingSentenceCount).join(' ');
  const remainderSentences = sentenceMatches.slice(openingSentenceCount).join(' ');

  const openingScript = buildNarrationScript(cleanTitle, openingSentences);

  return {
    opening: openingScript,
    remainder: remainderSentences.trim()
  };
}

export interface FullNarrationScriptOptions {
  contentSettings?: {
    summary?: boolean;
    notable?: boolean;
    climate?: boolean;
    explore?: boolean;
    news?: boolean;
  };
  showNews?: boolean;
  maxChars?: number;
}

/**
 * Assembles individual narration units in InfoPanel order:
 * 1. Summary
 * 2. Notable Facts (each item independently chunked/capped if needed)
 * 3. Climate (independently chunked/capped if needed)
 * 4. Explore (each follow-up answer independently chunked/capped if needed)
 * 5. News (each news item independently chunked/capped if needed)
 */
export function buildFullNarrationUnits(
  info: any,
  options?: FullNarrationScriptOptions
): NarrationUnit[] {
  if (!info) return [];

  const content = options?.contentSettings || {
    summary: true,
    notable: true,
    climate: true,
    explore: true,
    news: true
  };
  const isNewsEnabled = options?.showNews !== false;
  const unitLimit = typeof options?.maxChars === 'number' && !isNaN(options.maxChars) && options.maxChars > 0 ? options.maxChars : 600;

  const units: NarrationUnit[] = [];

  // 1. Summary
  if (content.summary !== false) {
    const rawDesc = info.description || info.context || '';
    const cleanDesc = cleanNarrationText(rawDesc).trim();
    if (cleanDesc && cleanDesc.length > 3) {
      const chunks = chunkContentUnit(cleanDesc, unitLimit);
      for (const chunk of chunks) {
        units.push({ section: 'SUMMARY', text: chunk });
      }
    }
  }

  // 2. Notable Facts (read descriptive content, do NOT narrate "Notable facts:" or subsection titles)
  if (content.notable !== false && Array.isArray(info.notable) && info.notable.length > 0) {
    for (const item of info.notable) {
      let itemText = '';
      if (typeof item === 'string' && item.trim()) {
        itemText = cleanNarrationText(item).trim();
      } else if (item && typeof item === 'object') {
        const desc = (item.description || item.summary || item.text || item.fact || item.content || '').trim();
        const title = (item.title || item.name || '').trim();
        if (desc) {
          itemText = cleanNarrationText(desc).trim();
        } else if (title) {
          itemText = cleanNarrationText(title).trim();
        }
      }
      if (itemText) {
        const chunks = chunkContentUnit(itemText, unitLimit);
        for (const chunk of chunks) {
          units.push({ section: 'NOTABLE', text: chunk });
        }
      }
    }
  }

  // 3. Climate (read descriptive content, do NOT narrate "Climate:" or classification heading if description is present)
  if (content.climate !== false && info.climate) {
    let cleanClim = '';
    if (typeof info.climate === 'string') {
      cleanClim = cleanNarrationText(info.climate).trim();
    } else if (typeof info.climate === 'object') {
      const climDesc = (info.climate.description || info.climate.summary || info.climate.text || '').trim();
      const climName = (info.climate.name || info.climate.title || '').trim();
      if (climDesc) {
        cleanClim = cleanNarrationText(climDesc).trim();
      } else if (climName) {
        cleanClim = cleanNarrationText(climName).trim();
      }
    }
    if (cleanClim && cleanClim.length > 3) {
      const chunks = chunkContentUnit(cleanClim, unitLimit);
      for (const chunk of chunks) {
        units.push({ section: 'CLIMATE', text: chunk });
      }
    }
  }

  // 4. Explore (read answer content only, do NOT narrate "EXPLORE:" or question labels)
  if (content.explore !== false && Array.isArray(info.followUps) && info.followUps.length > 0) {
    for (const fu of info.followUps) {
      if (fu && fu.answer) {
        const a = cleanNarrationText(fu.answer).trim();
        if (a) {
          const chunks = chunkContentUnit(a, unitLimit);
          for (const chunk of chunks) {
            units.push({ section: 'EXPLORE', text: chunk });
          }
        }
      }
    }
  }

  // 5. News (read headlines/descriptions, do NOT narrate "Recent news:" or "NEWS:")
  if (isNewsEnabled && content.news !== false && Array.isArray(info.news) && info.news.length > 0) {
    for (const n of info.news) {
      const headline = cleanNarrationText(n.headline || n.title || n.summary || n.description || '').trim();
      if (headline) {
        const chunks = chunkContentUnit(headline, unitLimit);
        for (const chunk of chunks) {
          units.push({ section: 'NEWS', text: chunk });
        }
      }
    }
  }

  return units;
}

/**
 * Assembles a comprehensive, multi-section narration script in InfoPanel order:
 * 1. Summary
 * 2. Notable Facts (content only, no section labels or item headings)
 * 3. Climate (descriptive content only, no section label or classification heading)
 * 4. Explore (Follow-up answers only, no question headings)
 * 5. News (Headlines/descriptions only, no section label)
 * Only enabled sections with actual content are included.
 * Applies character limit per content unit, preserving full combined multi-section narration.
 */
export function buildFullNarrationScript(
  info: any,
  options?: FullNarrationScriptOptions
): string {
  const units = buildFullNarrationUnits(info, options);
  if (units.length === 0) return '';

  const contributingSections = Array.from(new Set(units.map((u) => u.section)));
  const combinedScript = units.map((u) => u.text).join(' ');

  console.log(
    `[NarrationScript] ASSEMBLED sections=${contributingSections.join(',')} units=${units.length} totalLength=${combinedScript.length}`
  );

  return combinedScript;
}

/**
 * Decodes base64-encoded 16-bit signed integer PCM mono audio into a Float32Array (-1.0 to 1.0).
 */
export function decodeBase64PCMToFloat32(base64Data: string): Float32Array {
  const binaryString = typeof atob === 'function' 
    ? atob(base64Data) 
    : Buffer.from(base64Data, 'base64').toString('binary');
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const int16Array = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 32768.0;
  }
  return float32Array;
}

function getAudioContextClass(): typeof AudioContext | undefined {
  if (typeof window !== 'undefined') {
    return (window as any).AudioContext || (window as any).webkitAudioContext;
  }
  if (typeof AudioContext !== 'undefined') {
    return AudioContext;
  }
  return undefined;
}

/**
 * System Voice Provider wrapping the native browser Web Speech API.
 * Preserves existing voice resolution, keep-alive interval, event dispatching, and lifecycle.
 */
export class SystemVoiceProvider implements INarrationProvider {
  public readonly id: NarrationProviderType = 'system';
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private activeUtterances: Set<SpeechSynthesisUtterance> = new Set();
  private voices: SpeechSynthesisVoice[] = [];
  private voiceListeners: Set<(voices: SpeechSynthesisVoice[]) => void> = new Set();
  private isSpeakingInternal = false;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private defaultVolume = 1.0;
  private defaultSpeed = 0.9;
  private defaultVoiceURI = '';

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.refreshVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => {
          this.refreshVoices();
        };
      }
    }
  }

  public setVolume(volume: number): void {
    const v = typeof volume === 'number' && !isNaN(volume) ? Math.max(0.0, Math.min(1.0, volume)) : 1.0;
    this.defaultVolume = v;
    if (this.currentUtterance) {
      this.currentUtterance.volume = v;
    }
  }

  public getVolume(): number {
    return this.defaultVolume;
  }

  public setSpeed(speed: number): void {
    const s = typeof speed === 'number' && !isNaN(speed) ? Math.max(0.5, Math.min(2.0, speed)) : 0.9;
    this.defaultSpeed = s;
    if (this.currentUtterance) {
      this.currentUtterance.rate = s;
    }
  }

  public getSpeed(): number {
    return this.defaultSpeed;
  }

  public setVoiceURI(voiceURI: string): void {
    this.defaultVoiceURI = voiceURI || '';
    if (this.currentUtterance && voiceURI) {
      const voices = this.getVoices();
      const matched = voices.find((v) => v.voiceURI === voiceURI || v.name === voiceURI);
      if (matched) {
        this.currentUtterance.voice = matched;
      }
    }
  }

  public getVoiceURI(): string {
    return this.defaultVoiceURI;
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  }

  public prime(): void {
    if (!this.isSupported() || typeof window === 'undefined') return;
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      this.refreshVoices();
    } catch (err) {
      // Ignore
    }
  }

  public refreshVoices(): void {
    if (this.isSupported()) {
      try {
        const available = window.speechSynthesis.getVoices();
        if (available && available.length > 0) {
          this.voices = available;
          this.notifyVoiceListeners();
        }
      } catch (err) {
        console.warn('[Narration] Failed to retrieve speech synthesis voices:', err);
      }
    }
  }

  public getVoices(): SpeechSynthesisVoice[] {
    if (this.voices.length === 0 && this.isSupported()) {
      this.refreshVoices();
    }
    return this.voices;
  }

  public onVoicesChanged(listener: (voices: SpeechSynthesisVoice[]) => void): () => void {
    this.voiceListeners.add(listener);
    if (this.voices.length > 0) {
      listener(this.voices);
    } else {
      this.refreshVoices();
    }
    return () => {
      this.voiceListeners.delete(listener);
    };
  }

  private notifyVoiceListeners(): void {
    const list = [...this.voices];
    this.voiceListeners.forEach((fn) => {
      try {
        fn(list);
      } catch (e) {
        console.error('[Narration] Error in voice listener:', e);
      }
    });
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    this.keepAliveTimer = setInterval(() => {
      if (this.isSpeakingInternal && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } else {
        this.stopKeepAlive();
      }
    }, 5000);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  public speak(script: string, options: NarrationSpeakOptions): void {
    this.cancel();

    const stableId = options.waypointId || options.title || 'system-voice';
    const waypointName = options.title || stableId;

    if (!this.isSupported()) {
      console.log('[Narration] Web Speech API is not supported in this environment');
      options.onError?.(new Error('Web Speech API is not supported in this environment'));
      return;
    }

    const units: NarrationUnit[] = options.units && options.units.length > 0
      ? options.units
      : [{ section: 'SUMMARY', text: script }];

    const sections = Array.from(new Set(units.map((u) => u.section))).join(',');
    console.log(`[NarrationPlayback] START sections=${sections} units=${units.length}`);

    let currentIndex = 0;

    const playNext = () => {
      if (currentIndex >= units.length) {
        console.log('[NarrationPlayback] COMPLETE');
        this.activeUtterances.clear();
        this.isSpeakingInternal = false;
        this.currentUtterance = null;
        this.stopKeepAlive();
        console.log('[SearchNarration] SPEECH_ONEND');
        logTraceNarration(stableId, waypointName, 'playback ended');
        options.onEnd?.();
        return;
      }

      const unit = units[currentIndex];
      const chunkText = currentIndex === 0 && options.title
        ? buildNarrationScript(options.title, unit.text)
        : unit.text;

      console.log(`[NarrationPlayback] CHUNK_START index=${currentIndex} total=${units.length} section=${unit.section}`);

      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }

        const utterance = new SpeechSynthesisUtterance(chunkText);
        console.log(`[SearchNarration] UTTERANCE_CREATED textLength=${chunkText.length}`);
        this.currentUtterance = utterance;
        this.activeUtterances.add(utterance);

        const speed = typeof options.speed === 'number' && !isNaN(options.speed) ? options.speed : this.defaultSpeed;
        utterance.rate = Math.max(0.5, Math.min(2.0, speed));

        const volume = typeof options.volume === 'number' && !isNaN(options.volume) ? options.volume : this.defaultVolume;
        utterance.volume = Math.max(0.0, Math.min(1.0, volume));

        const voiceURI = options.voiceURI || this.defaultVoiceURI;
        if (voiceURI) {
          const voices = this.getVoices();
          const matched = voices.find((v) => v.voiceURI === voiceURI || v.name === voiceURI);
          if (matched) {
            utterance.voice = matched;
          }
        }

        if (currentIndex === 0) {
          logTraceNarration(stableId, waypointName, 'TTS request started', `provider="system" voice="${voiceURI || 'default'}"`);
        }

        utterance.onstart = () => {
          if (currentIndex === 0) {
            this.isSpeakingInternal = true;
            this.startKeepAlive();
            console.log(`[SearchNarration] SPEECH_ONSTART text="${chunkText.slice(0, 60)}..."`);
            console.log('[narrationService] SPEECH_ONSTART');
            logTraceNarration(stableId, waypointName, 'TTS generation started');
            logTraceNarration(stableId, waypointName, 'playback started');
            options.onStart?.();
          }
        };

        utterance.onend = () => {
          this.activeUtterances.delete(utterance);
          console.log(`[NarrationPlayback] CHUNK_END index=${currentIndex} total=${units.length}`);
          currentIndex++;
          if (currentIndex < units.length) {
            console.log(`[NarrationPlayback] ADVANCE nextIndex=${currentIndex}`);
          }
          playNext();
        };

        utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
          this.activeUtterances.delete(utterance);
          this.isSpeakingInternal = false;
          this.currentUtterance = null;
          this.stopKeepAlive();
          if (event.error !== 'canceled' && event.error !== 'interrupted') {
            console.warn(`[SearchNarration] SPEECH_ONERROR error="${event.error}"`);
            options.onError?.(event);
          }
        };

        console.log(`[SearchNarration] SYNTHESIS_SPEAK_CALLED speaking=${window.speechSynthesis.speaking} pending=${window.speechSynthesis.pending} paused=${window.speechSynthesis.paused}`);
        window.speechSynthesis.speak(utterance);
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch (err: unknown) {
        this.isSpeakingInternal = false;
        this.currentUtterance = null;
        this.stopKeepAlive();
        console.warn('[Narration] Failed to execute speak:', err);
        options.onError?.(err);
      }
    };

    playNext();
  }

  public cancel(reason?: string, caller?: string): void {
    const hadUtterances = this.activeUtterances.size > 0 || this.currentUtterance !== null;
    const wasSpeaking = this.isSpeakingInternal;
    this.stopKeepAlive();
    if (this.isSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {
        // Ignore
      }
    }
    this.activeUtterances.clear();
    this.currentUtterance = null;
    this.isSpeakingInternal = false;

    if (wasSpeaking || hadUtterances) {
      console.log(`[NarrationCancel] provider="system" reason="${reason || 'unspecified'}" caller="${caller || 'unknown'}" activeUtterancesCleared=${hadUtterances} activeSpeechStopped=${wasSpeaking}`);
    }
  }

  public isSpeaking(): boolean {
    return this.isSpeakingInternal;
  }
}

/**
 * Orpheus TTS Streaming Provider connecting to the local HTTP bridge (http://127.0.0.1:8765/tts/stream).
 * Reads SSE events progressively, decodes raw 24kHz 16-bit PCM chunks, pre-buffers ~3.0s (or until stream ends),
 * and sequentially schedules continuous audio playback using the Web Audio API.
 */
export class OrpheusTTSProvider implements INarrationProvider {
  public readonly id: NarrationProviderType = 'orpheus';
  private bridgeUrl = 'http://127.0.0.1:8765/tts/stream';
  private activeAbortController: AbortController | null = null;
  private activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private activeSourceNodes: Set<AudioBufferSourceNode> = new Set();
  private nextStartTime = 0;
  private isSpeakingInternal = false;
  private streamDone = false;
  private defaultVolume = 1.0;
  private defaultSpeed = 0.9;
  private defaultVoice = 'tara';

  constructor(bridgeUrl = 'http://127.0.0.1:8765/tts/stream') {
    this.bridgeUrl = bridgeUrl;
  }

  public setVolume(volume: number): void {
    const v = typeof volume === 'number' && !isNaN(volume) ? Math.max(0.0, Math.min(1.0, volume)) : 1.0;
    this.defaultVolume = v;
    if (this.gainNode && this.audioContext) {
      try {
        this.gainNode.gain.setValueAtTime(v, this.audioContext.currentTime);
      } catch (e) {
        this.gainNode.gain.value = v;
      }
    }
  }

  public getVolume(): number {
    return this.defaultVolume;
  }

  public setSpeed(speed: number): void {
    const s = typeof speed === 'number' && !isNaN(speed) ? Math.max(0.5, Math.min(2.0, speed)) : 0.9;
    this.defaultSpeed = s;
    if (this.audioContext) {
      for (const source of this.activeSourceNodes) {
        try {
          source.playbackRate.setValueAtTime(s, this.audioContext.currentTime);
        } catch (e) {
          source.playbackRate.value = s;
        }
      }
    }
  }

  public getSpeed(): number {
    return this.defaultSpeed;
  }

  public setVoice(voice: string): void {
    if (voice) {
      this.defaultVoice = voice;
    }
  }

  public getVoice(): string {
    return this.defaultVoice;
  }

  public getAvailableVoices(): OrpheusVoiceOption[] {
    return ORPHEUS_VOICES;
  }

  public isSupported(): boolean {
    const hasFetch = (typeof window !== 'undefined' && typeof window.fetch === 'function') || typeof fetch === 'function';
    const hasAudioContext = !!getAudioContextClass();
    return hasFetch && hasAudioContext;
  }

  private cleanupAudioNodes(): void {
    for (const source of this.activeSourceNodes) {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch (e) {
        // Ignore
      }
    }
    this.activeSourceNodes.clear();

    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch (e) {
        // Ignore
      }
      this.gainNode = null;
    }

    if (this.audioContext) {
      try {
        if (this.audioContext.state !== 'closed') {
          this.audioContext.close();
        }
      } catch (e) {
        // Ignore
      }
      this.audioContext = null;
    }

    this.nextStartTime = 0;
  }

  private async synthesizeSegment(
    text: string,
    voice: string,
    signal: AbortSignal,
    onFirstChunk?: () => void
  ): Promise<Float32Array> {
    const fetchFn = (typeof window !== 'undefined' && typeof window.fetch === 'function') ? window.fetch : fetch;
    const response = await fetchFn(this.bridgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
      signal
    });

    if (!response.ok || !response.body) {
      let errDetail = '';
      try {
        if (typeof response.json === 'function') {
          const errJson = await response.json();
          errDetail = errJson?.error || '';
        }
      } catch {}
      throw new Error(errDetail ? `Orpheus TTS generation failed: ${errDetail}` : `Orpheus TTS generation failed (${response.status})`);
    }

    const reader = response.body.getReader();
    this.activeReader = reader;
    const decoder = new TextDecoder();
    let sseBuffer = '';
    const pcmChunks: Float32Array[] = [];
    let totalSamples = 0;
    let receivedAny = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done || signal.aborted) break;

      sseBuffer += decoder.decode(value, { stream: true });
      const events = sseBuffer.split('\n\n');
      sseBuffer = events.pop() || '';

      for (const rawEvent of events) {
        if (!rawEvent.trim()) continue;
        for (const line of rawEvent.split('\n')) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const eventJson = JSON.parse(dataStr);
              if (eventJson.error) {
                throw new Error(eventJson.error);
              }
              if (eventJson.raw_pcm_base64) {
                const pcm = decodeBase64PCMToFloat32(eventJson.raw_pcm_base64);
                if (pcm.length > 0) {
                  if (!receivedAny) {
                    receivedAny = true;
                    onFirstChunk?.();
                  }
                  pcmChunks.push(pcm);
                  totalSamples += pcm.length;
                }
              }
            } catch (err: any) {
              if (err instanceof Error && (err.message.startsWith('Orpheus') || err.message.includes('LM Studio') || !dataStr.startsWith('{'))) {
                throw err;
              }
            }
          }
        }
      }
    }

    if (this.activeReader === reader) {
      this.activeReader = null;
    }

    if (signal.aborted) {
      return new Float32Array(0);
    }

    if (totalSamples === 0) {
      throw new Error('Orpheus TTS generation produced no audio data');
    }

    const combined = new Float32Array(totalSamples);
    let offset = 0;
    for (const chunk of pcmChunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return combined;
  }

  public async speak(script: string, options: NarrationSpeakOptions): Promise<void> {
    this.cancel();

    if (!this.isSupported()) {
      const err = new Error('Web Audio API is not supported in this environment');
      console.warn('[OrpheusTTS]', err);
      options.onError?.(err);
      return;
    }

    const stableId = options?.waypointId || options?.title || 'orpheus-voice';
    const waypointName = options?.title || stableId;
    const voice = options?.orpheusVoice || this.defaultVoice || 'tara';
    const limit = typeof options?.limit === 'number' && !isNaN(options.limit) && options.limit > 0 ? options.limit : 600;

    const { opening, remainder } = options?.description
      ? splitNarrationIntoSegments(options.title || '', options.description, limit)
      : { opening: script, remainder: '' };

    if (!opening || opening.trim().length === 0) return;

    const units = options?.units && options.units.length > 0 ? options.units : [{ section: 'SUMMARY', text: script }];
    const sections = Array.from(new Set(units.map((u) => u.section))).join(',');
    console.log(`[NarrationPlayback] START sections=${sections} units=${units.length}`);
    console.log(`[NarrationPlayback] CHUNK_START index=0 total=${units.length} section=${units[0]?.section || 'SUMMARY'}`);

    const openingWords = opening.split(/\s+/).filter(Boolean).length;
    const remainderWords = remainder ? remainder.split(/\s+/).filter(Boolean).length : 0;
    console.log(`[OrpheusTTS Lifecycle] SEGMENTS_CREATED id="${stableId}" openingWords=${openingWords} remainderWords=${remainderWords} openingLen=${opening.length} remainderLen=${remainder.length}`);

    const controller = new AbortController();
    this.activeAbortController = controller;
    const { signal } = controller;

    const ttsStartTime = Date.now();
    logProviderStart('OrpheusTTS', waypointName, stableId, `openingLength=${opening.length} remainderLength=${remainder.length}`);
    logTraceNarration(stableId, waypointName, 'TTS request started', `provider="orpheus" voice="${voice}" openingLength=${opening.length} remainderLength=${remainder.length}`);
    logTraceTiming('ORPHEUS_HTTP_REQUEST_STARTED', stableId, waypointName, `openingLength=${opening.length} voice="${voice}"`);
    logTraceTiming('ORPHEUS_OPENING_REQUEST_STARTED', stableId, waypointName, `openingLength=${opening.length} voice="${voice}" words=${openingWords}`);

    const AudioContextClass = getAudioContextClass();
    if (!AudioContextClass) {
      options.onError?.(new Error('AudioContext not available'));
      return;
    }

    const audioContext = new AudioContextClass();
    this.audioContext = audioContext;

    const volume = typeof options.volume === 'number' && !isNaN(options.volume) ? options.volume : this.defaultVolume;
    const speed = typeof options.speed === 'number' && !isNaN(options.speed) ? options.speed : this.defaultSpeed;

    const gainNode = audioContext.createGain();
    this.gainNode = gainNode;
    try {
      gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    } catch {
      gainNode.gain.value = volume;
    }
    gainNode.connect(audioContext.destination);

    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch {}
    }

    if (signal.aborted) {
      this.cleanupAudioNodes();
      return;
    }

    try {
      logTraceNarration(stableId, waypointName, 'TTS generation started');
      logTraceTiming('ORPHEUS_GENERATION_STARTED', stableId, waypointName);

      // 1. Synthesize complete Opening Segment independently
      const openingPcm = await this.synthesizeSegment(opening, voice, signal, () => {
        logTraceNarration(stableId, waypointName, 'first audio data received');
        logTraceTiming('ORPHEUS_FIRST_AUDIO', stableId, waypointName);
      });

      if (signal.aborted) {
        this.cleanupAudioNodes();
        return;
      }

      const openingDuration = openingPcm.length / 24000;
      const openingElapsedMs = Date.now() - ttsStartTime;
      logProviderComplete('OrpheusTTS', waypointName, stableId, openingElapsedMs, `openingDuration=${openingDuration.toFixed(2)}s`);
      logTraceNarration(stableId, waypointName, 'opening audio received', `duration=${openingDuration.toFixed(2)}s`);
      logTraceTiming('ORPHEUS_OPENING_AUDIO_COMPLETE', stableId, waypointName, `duration=${openingDuration.toFixed(2)}s elapsedMs=${openingElapsedMs}ms samples=${openingPcm.length}`);
      logTraceTiming('ORPHEUS_AUDIO_COMPLETE', stableId, waypointName, `duration=${openingDuration.toFixed(2)}s elapsedMs=${openingElapsedMs}ms`);

      // 2. Start Whole-Buffer Playback of Opening Segment immediately
      const openingBuffer = audioContext.createBuffer(1, openingPcm.length, 24000);
      if (typeof openingBuffer.copyToChannel === 'function') {
        openingBuffer.copyToChannel(openingPcm, 0);
      } else {
        openingBuffer.getChannelData(0).set(openingPcm);
      }

      const openingSourceNode = audioContext.createBufferSource();
      openingSourceNode.buffer = openingBuffer;
      try {
        openingSourceNode.playbackRate.setValueAtTime(speed, audioContext.currentTime);
      } catch {
        openingSourceNode.playbackRate.value = speed;
      }
      openingSourceNode.connect(gainNode);

      this.isSpeakingInternal = true;
      const openingPlayStartTime = audioContext.currentTime + 0.02;
      const openingPlayDuration = openingDuration / speed;
      const openingExpectedEndTime = openingPlayStartTime + openingPlayDuration;

      logTraceNarration(stableId, waypointName, 'playback started', `audioDuration=${openingDuration.toFixed(2)}s scheduledStart=${openingPlayStartTime.toFixed(3)}s expectedEnd=${openingExpectedEndTime.toFixed(3)}s`);
      logTraceTiming('WP1_PLAYBACK_STARTED', stableId, waypointName, `audioDuration=${openingDuration.toFixed(2)}s`);
      logTraceTiming('ORPHEUS_OPENING_PLAYBACK_STARTED', stableId, waypointName, `audioDuration=${openingDuration.toFixed(2)}s`);
      options.onStart?.();

      this.activeSourceNodes.add(openingSourceNode);
      openingSourceNode.start(openingPlayStartTime);

      let openingEndedWallTime: number | null = null;
      let remainderReadyWallTime: number | null = null;
      let isOpeningPlaying = true;

      // 3. Initiate background synthesis of Remainder Segment while Opening is playing
      let remainderPromise: Promise<Float32Array | null> | null = null;
      const remainderRequestStartTime = Date.now();

      if (remainder && remainder.trim().length > 0 && !signal.aborted) {
        logTraceTiming('ORPHEUS_REMAINDER_REQUEST_STARTED', stableId, waypointName, `remainderLength=${remainder.length} words=${remainderWords}`);
        remainderPromise = this.synthesizeSegment(remainder, voice, signal)
          .then((pcm) => {
            remainderReadyWallTime = Date.now();
            const remDuration = pcm.length / 24000;
            const remElapsedMs = remainderReadyWallTime - remainderRequestStartTime;
            logTraceTiming('ORPHEUS_REMAINDER_AUDIO_COMPLETE', stableId, waypointName, `duration=${remDuration.toFixed(2)}s synthElapsedMs=${remElapsedMs}ms openingStillPlaying=${isOpeningPlaying}`);
            console.log(`[OrpheusTTS Lifecycle] REMAINDER_SYNTHESIS_COMPLETE duration=${remDuration.toFixed(2)}s elapsedMs=${remElapsedMs}ms openingStillPlaying=${isOpeningPlaying}`);
            return pcm;
          })
          .catch((err) => {
            console.warn('[OrpheusTTS] Remainder synthesis error:', err);
            return null;
          });
      }

      // 4. Handle seamless continuation when Opening finishes
      openingSourceNode.onended = async () => {
        isOpeningPlaying = false;
        openingEndedWallTime = Date.now();
        this.activeSourceNodes.delete(openingSourceNode);
        logTraceTiming('ORPHEUS_OPENING_PLAYBACK_ENDED', stableId, waypointName, `currentTime=${this.audioContext?.currentTime.toFixed(3)}s`);
        console.log(`[NarrationPlayback] CHUNK_END index=0 total=${units.length}`);

        if (signal.aborted) {
          this.isSpeakingInternal = false;
          this.cleanupAudioNodes();
          return;
        }

        if (remainderPromise) {
          if (!remainderReadyWallTime) {
            logTraceTiming('ORPHEUS_TRANSITION_GAP_DETECTED', stableId, waypointName, `openingEndedBeforeRemainderReady=true currentTime=${this.audioContext?.currentTime.toFixed(3)}s`);
            console.warn(`[OrpheusTTS Lifecycle] GAP_DETECTED: Opening ended before remainder was ready! Remainder still synthesizing...`);
          }

          console.log(`[NarrationPlayback] ADVANCE nextIndex=1`);
          console.log(`[NarrationPlayback] CHUNK_START index=1 total=${units.length} section=${units[1]?.section || 'NOTABLE'}`);

          const remainderPcm = await remainderPromise;
          if (remainderPcm && remainderPcm.length > 0 && !signal.aborted && this.audioContext && this.gainNode) {
            const actualGapMs = openingEndedWallTime ? Date.now() - openingEndedWallTime : 0;
            const remBuffer = this.audioContext.createBuffer(1, remainderPcm.length, 24000);
            if (typeof remBuffer.copyToChannel === 'function') {
              remBuffer.copyToChannel(remainderPcm, 0);
            } else {
              remBuffer.getChannelData(0).set(remainderPcm);
            }

            const remSourceNode = this.audioContext.createBufferSource();
            remSourceNode.buffer = remBuffer;
            try {
              remSourceNode.playbackRate.setValueAtTime(speed, this.audioContext.currentTime);
            } catch {
              remSourceNode.playbackRate.value = speed;
            }
            remSourceNode.connect(this.gainNode);

            const remDuration = remainderPcm.length / 24000;
            logTraceTiming('ORPHEUS_REMAINDER_PLAYBACK_STARTED', stableId, waypointName, `duration=${remDuration.toFixed(2)}s actualAudibleGap=${(actualGapMs / 1000).toFixed(3)}s`);
            console.log(`[OrpheusTTS Lifecycle] REMAINDER_PLAYBACK_STARTED duration=${remDuration.toFixed(2)}s actualAudibleGap=${(actualGapMs / 1000).toFixed(3)}s`);

            remSourceNode.onended = () => {
              this.activeSourceNodes.delete(remSourceNode);
              this.isSpeakingInternal = false;
              this.cleanupAudioNodes();
              console.log(`[NarrationPlayback] CHUNK_END index=1 total=${units.length}`);
              console.log('[NarrationPlayback] COMPLETE');
              logTraceTiming('NARRATION_PLAYBACK_ENDED', stableId, waypointName);
              logTraceNarration(stableId, waypointName, 'playback ended');
              options.onEnd?.();
            };

            this.activeSourceNodes.add(remSourceNode);
            remSourceNode.start(this.audioContext.currentTime);
            return;
          }
        }

        this.isSpeakingInternal = false;
        this.cleanupAudioNodes();
        console.log('[NarrationPlayback] COMPLETE');
        logTraceTiming('NARRATION_PLAYBACK_ENDED', stableId, waypointName);
        logTraceNarration(stableId, waypointName, 'playback ended');
        options.onEnd?.();
      };
    } catch (err: any) {
      if (signal.aborted || err?.name === 'AbortError') {
        return;
      }

      this.isSpeakingInternal = false;
      this.cleanupAudioNodes();

      let friendlyError: Error;
      if (err instanceof Error && err.message.startsWith('Orpheus')) {
        friendlyError = err;
      } else if (err?.message?.includes('Failed to fetch') || err?.name === 'TypeError') {
        friendlyError = new Error('Orpheus TTS Bridge unavailable. Ensure local bridge is running on port 8765.');
      } else {
        friendlyError = err instanceof Error ? err : new Error(String(err));
      }

      console.warn('[OrpheusTTS] Generation/playback error:', friendlyError);
      options.onError?.(friendlyError);
    } finally {
      if (this.activeAbortController === controller) {
        this.activeAbortController = null;
      }
    }
  }

  public cancel(reason?: string, caller?: string): void {
    const wasAborting = !!this.activeAbortController;
    const wasReading = !!this.activeReader;
    const hadSources = this.activeSourceNodes.size > 0;
    const wasSpeaking = this.isSpeakingInternal;

    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort();
      } catch (e) {
        // Ignore
      }
      this.activeAbortController = null;
    }

    if (this.activeReader) {
      try {
        this.activeReader.cancel();
      } catch (e) {
        // Ignore
      }
      this.activeReader = null;
    }

    this.cleanupAudioNodes();
    this.isSpeakingInternal = false;
    this.streamDone = false;

    if (wasAborting || wasReading || hadSources || wasSpeaking) {
      console.log(`[NarrationCancel] provider="orpheus" reason="${reason || 'unspecified'}" caller="${caller || 'unknown'}" activeStreamsCancelled=${wasAborting || wasReading} activePlaybackStopped=${wasSpeaking || hadSources}`);
    }
  }

  public isSpeaking(): boolean {
    return this.isSpeakingInternal;
  }

  /**
   * Generates audio for the given script silently in the background without playback.
   * Does NOT interrupt or cancel currently active audio playback.
   */
  public async generateAudio(
    script: string,
    options?: NarrationSpeakOptions,
    signal?: AbortSignal
  ): Promise<{ pcmData: Float32Array; sampleRate: number; duration: number; script: string; voice: string } | null> {
    const stableId = options?.waypointId || options?.title || 'orpheus-voice';
    const waypointName = options?.title || stableId;

    const voice = options?.orpheusVoice || this.defaultVoice || 'tara';

    let textToSend = script;
    if (!textToSend && options?.description) {
      textToSend = buildNarrationScript(options.title || '', options.description);
    }

    if (!textToSend || textToSend.trim().length === 0) return null;

    const ttsStartTime = Date.now();
    logProviderStart('OrpheusTTS', waypointName, stableId, `scriptLength=${textToSend.length}`);
    logTraceNarration(stableId, waypointName, 'TTS request started', `provider="orpheus" voice="${voice}" scriptLength=${textToSend.length}`);
    logTraceTiming('ORPHEUS_HTTP_REQUEST_STARTED', stableId, waypointName, `scriptLength=${textToSend.length} voice="${voice}"`);

    const fetchFn = (typeof window !== 'undefined' && typeof window.fetch === 'function') ? window.fetch : fetch;
    const response = await fetchFn(this.bridgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: textToSend, voice }),
      signal
    });

    if (!response.ok || !response.body) {
      throw new Error(`Orpheus TTS generation failed (${response.status})`);
    }

    logTraceNarration(stableId, waypointName, 'TTS generation started', `status=${response.status}`);
    logTraceTiming('ORPHEUS_GENERATION_STARTED', stableId, waypointName, `status=${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';
    const pcmChunks: Float32Array[] = [];
    let totalSamples = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done || signal?.aborted) break;

      sseBuffer += decoder.decode(value, { stream: true });
      const events = sseBuffer.split('\n\n');
      sseBuffer = events.pop() || '';

      for (const rawEvent of events) {
        if (!rawEvent.trim()) continue;
        for (const line of rawEvent.split('\n')) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const eventJson = JSON.parse(dataStr);
              if (eventJson.error) throw new Error(eventJson.error);
              if (eventJson.raw_pcm_base64) {
                const pcm = decodeBase64PCMToFloat32(eventJson.raw_pcm_base64);
                if (pcm.length > 0) {
                  if (pcmChunks.length === 0) {
                    logTraceNarration(stableId, waypointName, 'first audio data received', `chunkSamples=${pcm.length}`);
                    logTraceTiming('ORPHEUS_FIRST_AUDIO', stableId, waypointName, `chunkSamples=${pcm.length}`);
                  }
                  pcmChunks.push(pcm);
                  totalSamples += pcm.length;
                }
              }
            } catch (err: any) {
              if (err instanceof Error && err.message.startsWith('Orpheus')) throw err;
            }
          }
        }
      }
    }

    if (totalSamples === 0) return null;

    const fullPcm = new Float32Array(totalSamples);
    let offset = 0;
    for (const chunk of pcmChunks) {
      fullPcm.set(chunk, offset);
      offset += chunk.length;
    }

    const duration = totalSamples / 24000;
    const ttsElapsedMs = Date.now() - ttsStartTime;
    logProviderComplete('OrpheusTTS', waypointName, stableId, ttsElapsedMs, `duration=${duration.toFixed(2)}s`);
    logTraceNarration(stableId, waypointName, 'full audio received', `totalChunks=${pcmChunks.length} duration=${duration.toFixed(2)}s`);
    logTraceTiming('ORPHEUS_AUDIO_COMPLETE', stableId, waypointName, `duration=${duration.toFixed(2)}s totalChunks=${pcmChunks.length}`);
    logTraceNarration(stableId, waypointName, 'audio decoded', `totalSamples=${totalSamples} sampleRate=24000`);

    return {
      pcmData: fullPcm,
      sampleRate: 24000,
      duration,
      script: textToSend,
      voice
    };
  }

  /**
   * Plays pre-generated PCM audio immediately with zero generation delay.
   */
  public async speakCached(
    cached: { pcmData: Float32Array; sampleRate: number; duration: number },
    options: NarrationSpeakOptions
  ): Promise<void> {
    this.cancel();

    const stableId = options.waypointId || options.title || 'orpheus-voice';
    const waypointName = options.title || stableId;

    if (!this.isSupported()) {
      options.onError?.(new Error('Web Audio API not supported'));
      return;
    }

    const AudioContextClass = getAudioContextClass();
    if (!AudioContextClass) {
      options.onError?.(new Error('AudioContext not available'));
      return;
    }

    const audioContext = new AudioContextClass();
    this.audioContext = audioContext;

    const volume = typeof options.volume === 'number' && !isNaN(options.volume) ? options.volume : this.defaultVolume;
    const speed = typeof options.speed === 'number' && !isNaN(options.speed) ? options.speed : this.defaultSpeed;

    const gainNode = audioContext.createGain();
    this.gainNode = gainNode;
    try {
      gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    } catch {
      gainNode.gain.value = volume;
    }
    gainNode.connect(audioContext.destination);

    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch {}
    }

    const audioBuffer = audioContext.createBuffer(1, cached.pcmData.length, cached.sampleRate || 24000);
    if (typeof audioBuffer.copyToChannel === 'function') {
      audioBuffer.copyToChannel(cached.pcmData, 0);
    } else {
      audioBuffer.getChannelData(0).set(cached.pcmData);
    }

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    try {
      source.playbackRate.setValueAtTime(speed, audioContext.currentTime);
    } catch {
      source.playbackRate.value = speed;
    }
    source.connect(gainNode);

    this.isSpeakingInternal = true;
    logTraceNarration(stableId, waypointName, 'playback started', `audioDuration=${cached.duration.toFixed(2)}s`);
    logTraceTiming('WP1_PLAYBACK_STARTED', stableId, waypointName, `audioDuration=${cached.duration.toFixed(2)}s`);
    options.onStart?.();

    source.onended = () => {
      this.activeSourceNodes.delete(source);
      this.isSpeakingInternal = false;
      this.cleanupAudioNodes();
      logTraceNarration(stableId, waypointName, 'playback ended');
      options.onEnd?.();
    };

    this.activeSourceNodes.add(source);
    source.start(audioContext.currentTime + 0.02);
  }
}

/**
 * Kokoro TTS Provider connecting to the local HTTP server (http://127.0.0.1:8880/tts).
 * Synthesizes the full narration in a single ultra-fast pass (~1.2-1.4s), decodes WAV audio,
 * and schedules continuous playback using the Web Audio API.
 * Supports silent preloading of future waypoints and zero-latency cached playback.
 */
export class KokoroTTSProvider implements INarrationProvider {
  public readonly id: NarrationProviderType = 'kokoro';
  private bridgeUrl = 'http://127.0.0.1:8880/tts';
  private activeAbortController: AbortController | null = null;
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private activeSourceNodes: Set<AudioBufferSourceNode> = new Set();
  private isSpeakingInternal = false;
  private defaultVolume = 1.0;
  private defaultSpeed = 1.0;
  private defaultVoice = 'am_michael';

  constructor(bridgeUrl = 'http://127.0.0.1:8880/tts') {
    this.bridgeUrl = bridgeUrl;
  }

  public setVolume(volume: number): void {
    const v = typeof volume === 'number' && !isNaN(volume) ? Math.max(0.0, Math.min(1.0, volume)) : 1.0;
    this.defaultVolume = v;
    if (this.gainNode && this.audioContext) {
      try {
        this.gainNode.gain.setValueAtTime(v, this.audioContext.currentTime);
      } catch (e) {
        this.gainNode.gain.value = v;
      }
    }
  }

  public getVolume(): number {
    return this.defaultVolume;
  }

  public setSpeed(speed: number): void {
    const s = typeof speed === 'number' && !isNaN(speed) ? Math.max(0.5, Math.min(2.0, speed)) : 1.0;
    this.defaultSpeed = s;
    if (this.audioContext) {
      for (const source of this.activeSourceNodes) {
        try {
          source.playbackRate.setValueAtTime(s, this.audioContext.currentTime);
        } catch (e) {
          source.playbackRate.value = s;
        }
      }
    }
  }

  public getSpeed(): number {
    return this.defaultSpeed;
  }

  public setVoice(voice: string): void {
    if (voice) {
      this.defaultVoice = voice;
    }
  }

  public getVoice(): string {
    return this.defaultVoice;
  }

  public getAvailableVoices(): KokoroVoiceOption[] {
    return KOKORO_VOICES;
  }

  public isSupported(): boolean {
    const hasFetch = (typeof window !== 'undefined' && typeof window.fetch === 'function') || typeof fetch === 'function';
    const hasAudioContext = !!getAudioContextClass();
    return hasFetch && hasAudioContext;
  }

  private cleanupAudioNodes(): void {
    for (const source of this.activeSourceNodes) {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch (e) {
        // Ignore
      }
    }
    this.activeSourceNodes.clear();

    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch (e) {
        // Ignore
      }
      this.gainNode = null;
    }

    if (this.audioContext) {
      try {
        if (this.audioContext.state !== 'closed') {
          this.audioContext.close();
        }
      } catch (e) {
        // Ignore
      }
      this.audioContext = null;
    }
  }

  /**
   * Fetches raw WAV audio array buffer from Kokoro service and converts to AudioBuffer / Float32Array PCM.
   */
  private async synthesize(
    text: string,
    voice: string,
    speed: number,
    signal: AbortSignal
  ): Promise<{ pcmData: Float32Array; sampleRate: number; duration: number }> {
    const fetchFn = (typeof window !== 'undefined' && typeof window.fetch === 'function') ? window.fetch : fetch;
    const response = await fetchFn(this.bridgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, speed }),
      signal
    });

    if (!response.ok) {
      let errDetail = '';
      try {
        if (typeof response.json === 'function') {
          const errJson = await response.json();
          errDetail = errJson?.error || '';
        }
      } catch {}
      throw new Error(errDetail ? `Kokoro TTS generation failed: ${errDetail}` : `Kokoro TTS generation failed (${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (signal.aborted) {
      return { pcmData: new Float32Array(0), sampleRate: 24000, duration: 0 };
    }

    if (!arrayBuffer || arrayBuffer.byteLength <= 44) {
      throw new Error('Kokoro TTS generation produced no audio data');
    }

    // Decode WAV array buffer
    const AudioContextClass = getAudioContextClass();
    let pcmData: Float32Array;
    let sampleRate = 24000;
    let duration = 0;

    if (AudioContextClass) {
      const tempCtx = new AudioContextClass();
      try {
        // decodeAudioData handles WAV container decoding cleanly
        const decodedBuffer = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
        sampleRate = decodedBuffer.sampleRate;
        duration = decodedBuffer.duration;
        pcmData = decodedBuffer.getChannelData(0);
      } catch (decodeErr) {
        // Fallback to manual 16-bit PCM slice if decodeAudioData fails in non-standard test env
        const pcmBytes = new Uint8Array(arrayBuffer, 44);
        const int16 = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, Math.floor(pcmBytes.byteLength / 2));
        pcmData = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
          pcmData[i] = int16[i] / 32768.0;
        }
        duration = pcmData.length / sampleRate;
      } finally {
        if (tempCtx.state !== 'closed') {
          try {
            tempCtx.close();
          } catch {}
        }
      }
    } else {
      const pcmBytes = new Uint8Array(arrayBuffer, 44);
      const int16 = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, Math.floor(pcmBytes.byteLength / 2));
      pcmData = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        pcmData[i] = int16[i] / 32768.0;
      }
      duration = pcmData.length / sampleRate;
    }

    return { pcmData, sampleRate, duration };
  }

  public async speak(script: string, options: NarrationSpeakOptions): Promise<void> {
    this.cancel();

    if (!this.isSupported()) {
      const err = new Error('Web Audio API is not supported in this environment');
      console.warn('[KokoroTTS]', err);
      options.onError?.(err);
      return;
    }

    const stableId = options?.waypointId || options?.title || 'kokoro-voice';
    const waypointName = options?.title || stableId;
    const voice = options?.kokoroVoice || this.defaultVoice || 'am_michael';

    let textToSend = script;
    if (!textToSend && options?.description) {
      textToSend = buildNarrationScript(options.title || '', options.description);
    }

    if (!textToSend || textToSend.trim().length === 0) return;

    const units = options?.units && options.units.length > 0 ? options.units : [{ section: 'SUMMARY', text: textToSend }];
    const sections = Array.from(new Set(units.map((u) => u.section))).join(',');
    console.log(`[NarrationPlayback] START sections=${sections} units=${units.length}`);
    console.log(`[NarrationPlayback] CHUNK_START index=0 total=${units.length} section=${units[0]?.section || 'SUMMARY'}`);

    const controller = new AbortController();
    this.activeAbortController = controller;
    const { signal } = controller;

    const ttsStartTime = Date.now();
    logProviderStart('KokoroTTS', waypointName, stableId, `scriptLength=${textToSend.length} voice="${voice}"`);
    logTraceNarration(stableId, waypointName, 'TTS request started', `provider="kokoro" voice="${voice}" scriptLength=${textToSend.length}`);
    logTraceTiming('KOKORO_HTTP_REQUEST_STARTED', stableId, waypointName, `scriptLength=${textToSend.length} voice="${voice}"`);

    const AudioContextClass = getAudioContextClass();
    if (!AudioContextClass) {
      options.onError?.(new Error('AudioContext not available'));
      return;
    }

    const audioContext = new AudioContextClass();
    this.audioContext = audioContext;

    const volume = typeof options.volume === 'number' && !isNaN(options.volume) ? options.volume : this.defaultVolume;
    const speed = typeof options.speed === 'number' && !isNaN(options.speed) ? options.speed : this.defaultSpeed;

    const gainNode = audioContext.createGain();
    this.gainNode = gainNode;
    try {
      gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    } catch {
      gainNode.gain.value = volume;
    }
    gainNode.connect(audioContext.destination);

    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch {}
    }

    if (signal.aborted) {
      this.cleanupAudioNodes();
      return;
    }

    try {
      logTraceNarration(stableId, waypointName, 'TTS generation started');
      logTraceTiming('KOKORO_GENERATION_STARTED', stableId, waypointName);

      const { pcmData, sampleRate, duration } = await this.synthesize(textToSend, voice, speed, signal);

      if (signal.aborted) {
        this.cleanupAudioNodes();
        return;
      }

      const ttsElapsedMs = Date.now() - ttsStartTime;
      logProviderComplete('KokoroTTS', waypointName, stableId, ttsElapsedMs, `duration=${duration.toFixed(2)}s`);
      logTraceNarration(stableId, waypointName, 'full audio received', `duration=${duration.toFixed(2)}s elapsedMs=${ttsElapsedMs}ms`);
      logTraceTiming('KOKORO_AUDIO_COMPLETE', stableId, waypointName, `duration=${duration.toFixed(2)}s elapsedMs=${ttsElapsedMs}ms`);

      const audioBuffer = audioContext.createBuffer(1, pcmData.length, sampleRate || 24000);
      if (typeof audioBuffer.copyToChannel === 'function') {
        audioBuffer.copyToChannel(pcmData, 0);
      } else {
        audioBuffer.getChannelData(0).set(pcmData);
      }

      const sourceNode = audioContext.createBufferSource();
      sourceNode.buffer = audioBuffer;
      try {
        sourceNode.playbackRate.setValueAtTime(speed, audioContext.currentTime);
      } catch {
        sourceNode.playbackRate.value = speed;
      }
      sourceNode.connect(gainNode);

      this.isSpeakingInternal = true;
      const scheduledStart = audioContext.currentTime + 0.02;
      const expectedEnd = scheduledStart + (duration / speed);

      logTraceNarration(stableId, waypointName, 'playback started', `audioDuration=${duration.toFixed(2)}s scheduledStart=${scheduledStart.toFixed(3)}s expectedEnd=${expectedEnd.toFixed(3)}s`);
      logTraceTiming('WP1_PLAYBACK_STARTED', stableId, waypointName, `audioDuration=${duration.toFixed(2)}s`);
      logTraceTiming('KOKORO_PLAYBACK_STARTED', stableId, waypointName, `audioDuration=${duration.toFixed(2)}s`);
      options.onStart?.();

      sourceNode.onended = () => {
        this.activeSourceNodes.delete(sourceNode);
        this.isSpeakingInternal = false;
        this.cleanupAudioNodes();
        console.log(`[NarrationPlayback] CHUNK_END index=0 total=${units.length}`);
        console.log('[NarrationPlayback] COMPLETE');
        logTraceTiming('KOKORO_PLAYBACK_ENDED', stableId, waypointName);
        logTraceTiming('NARRATION_PLAYBACK_ENDED', stableId, waypointName);
        logTraceNarration(stableId, waypointName, 'playback ended');
        options.onEnd?.();
      };

      this.activeSourceNodes.add(sourceNode);
      sourceNode.start(scheduledStart);

    } catch (err: any) {
      if (signal.aborted || err?.name === 'AbortError') {
        return;
      }

      this.isSpeakingInternal = false;
      this.cleanupAudioNodes();

      let friendlyError: Error;
      if (err instanceof Error && err.message.startsWith('Kokoro')) {
        friendlyError = err;
      } else if (err?.message?.includes('Failed to fetch') || err?.name === 'TypeError') {
        friendlyError = new Error('Kokoro TTS Service unavailable. Ensure local service is running on port 8880.');
      } else {
        friendlyError = err instanceof Error ? err : new Error(String(err));
      }

      console.warn('[KokoroTTS] Generation/playback error:', friendlyError);
      options.onError?.(friendlyError);
    } finally {
      if (this.activeAbortController === controller) {
        this.activeAbortController = null;
      }
    }
  }

  public cancel(reason?: string, caller?: string): void {
    const wasAborting = !!this.activeAbortController;
    const hadSources = this.activeSourceNodes.size > 0;
    const wasSpeaking = this.isSpeakingInternal;

    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort();
      } catch (e) {
        // Ignore
      }
      this.activeAbortController = null;
    }

    this.cleanupAudioNodes();
    this.isSpeakingInternal = false;

    if (wasAborting || hadSources || wasSpeaking) {
      console.log(`[NarrationCancel] provider="kokoro" reason="${reason || 'unspecified'}" caller="${caller || 'unknown'}" activeStreamsCancelled=${wasAborting} activePlaybackStopped=${wasSpeaking || hadSources}`);
    }
  }

  public isSpeaking(): boolean {
    return this.isSpeakingInternal;
  }

  /**
   * Generates audio for the given script silently in the background without playback.
   * Does NOT interrupt or cancel currently active audio playback.
   */
  public async generateAudio(
    script: string,
    options?: NarrationSpeakOptions,
    signal?: AbortSignal
  ): Promise<{ pcmData: Float32Array; sampleRate: number; duration: number; script: string; voice: string } | null> {
    const stableId = options?.waypointId || options?.title || 'kokoro-voice';
    const waypointName = options?.title || stableId;

    const voice = options?.kokoroVoice || this.defaultVoice || 'am_michael';
    const speed = typeof options?.speed === 'number' && !isNaN(options.speed) ? options.speed : this.defaultSpeed;

    let textToSend = script;
    if (!textToSend && options?.description) {
      textToSend = buildNarrationScript(options.title || '', options.description);
    }

    if (!textToSend || textToSend.trim().length === 0) return null;

    const ttsStartTime = Date.now();
    logProviderStart('KokoroTTS', waypointName, stableId, `scriptLength=${textToSend.length} (preload)`);
    logTraceNarration(stableId, waypointName, 'TTS request started', `provider="kokoro" voice="${voice}" scriptLength=${textToSend.length} (preload)`);
    logTraceTiming('KOKORO_HTTP_REQUEST_STARTED', stableId, waypointName, `scriptLength=${textToSend.length} voice="${voice}" preload=true`);

    const abortCtrl = new AbortController();
    const activeSignal = signal || abortCtrl.signal;

    try {
      const { pcmData, sampleRate, duration } = await this.synthesize(textToSend, voice, speed, activeSignal);
      if (activeSignal.aborted || pcmData.length === 0) return null;

      const ttsElapsedMs = Date.now() - ttsStartTime;
      logProviderComplete('KokoroTTS', waypointName, stableId, ttsElapsedMs, `duration=${duration.toFixed(2)}s (preload)`);
      logTraceNarration(stableId, waypointName, 'full audio received', `duration=${duration.toFixed(2)}s (preload)`);
      logTraceTiming('KOKORO_AUDIO_COMPLETE', stableId, waypointName, `duration=${duration.toFixed(2)}s (preload)`);

      return {
        pcmData,
        sampleRate,
        duration,
        script: textToSend,
        voice
      };
    } catch (err) {
      if (activeSignal.aborted) return null;
      console.warn('[KokoroTTS] Preload generation error:', err);
      return null;
    }
  }

  /**
   * Plays pre-generated PCM audio immediately with zero generation delay.
   */
  public async speakCached(
    cached: { pcmData: Float32Array; sampleRate: number; duration: number },
    options: NarrationSpeakOptions
  ): Promise<void> {
    this.cancel();

    const stableId = options.waypointId || options.title || 'kokoro-voice';
    const waypointName = options.title || stableId;

    if (!this.isSupported()) {
      options.onError?.(new Error('Web Audio API not supported'));
      return;
    }

    const AudioContextClass = getAudioContextClass();
    if (!AudioContextClass) {
      options.onError?.(new Error('AudioContext not available'));
      return;
    }

    const audioContext = new AudioContextClass();
    this.audioContext = audioContext;

    const volume = typeof options.volume === 'number' && !isNaN(options.volume) ? options.volume : this.defaultVolume;
    const speed = typeof options.speed === 'number' && !isNaN(options.speed) ? options.speed : this.defaultSpeed;

    const gainNode = audioContext.createGain();
    this.gainNode = gainNode;
    try {
      gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    } catch {
      gainNode.gain.value = volume;
    }
    gainNode.connect(audioContext.destination);

    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch {}
    }

    const audioBuffer = audioContext.createBuffer(1, cached.pcmData.length, cached.sampleRate || 24000);
    if (typeof audioBuffer.copyToChannel === 'function') {
      audioBuffer.copyToChannel(cached.pcmData, 0);
    } else {
      audioBuffer.getChannelData(0).set(cached.pcmData);
    }

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    try {
      source.playbackRate.setValueAtTime(speed, audioContext.currentTime);
    } catch {
      source.playbackRate.value = speed;
    }
    source.connect(gainNode);

    this.isSpeakingInternal = true;
    logTraceNarration(stableId, waypointName, 'playback started', `audioDuration=${cached.duration.toFixed(2)}s`);
    logTraceTiming('WP1_PLAYBACK_STARTED', stableId, waypointName, `audioDuration=${cached.duration.toFixed(2)}s`);
    logTraceTiming('KOKORO_PLAYBACK_STARTED', stableId, waypointName, `audioDuration=${cached.duration.toFixed(2)}s`);
    options.onStart?.();

    source.onended = () => {
      this.activeSourceNodes.delete(source);
      this.isSpeakingInternal = false;
      this.cleanupAudioNodes();
      logTraceTiming('KOKORO_PLAYBACK_ENDED', stableId, waypointName);
      logTraceTiming('NARRATION_PLAYBACK_ENDED', stableId, waypointName);
      logTraceNarration(stableId, waypointName, 'playback ended');
      options.onEnd?.();
    };

    this.activeSourceNodes.add(source);
    source.start(audioContext.currentTime + 0.02);
  }
}
