/**
 * Presentation-agnostic Text-to-Speech Narration Manager supporting:
 * - System Voice Provider (Native Web Speech API)
 * - Orpheus TTS Provider (Local HTTP Bridge)
 */

import { NarrationProviderType } from '../types';
import {
  NarrationSpeakOptions,
  OrpheusVoiceOption,
  ORPHEUS_VOICES,
  INarrationProvider,
  SystemVoiceProvider,
  OrpheusTTSProvider,
  decodeBase64PCMToFloat32,
  cleanNarrationText,
  buildNarrationScript,
  capDescriptionForNarration
} from './narrationProviders';

export type { NarrationSpeakOptions, OrpheusVoiceOption, INarrationProvider };
export {
  ORPHEUS_VOICES,
  SystemVoiceProvider,
  OrpheusTTSProvider,
  decodeBase64PCMToFloat32,
  cleanNarrationText,
  buildNarrationScript,
  capDescriptionForNarration
};

/**
 * Safely extracts textual narration description from a LocationInfo or Waypoint payload.
 * Evaluates candidate string fields in order and guarantees a trimmed string or empty string.
 * Never throws TypeError when fields contain structured objects, arrays, or undefined.
 */
export function getNarrationDescription(info: unknown): string {
  if (!info || typeof info !== 'object') return '';

  const loc = info as Record<string, unknown>;
  const waypoint = loc.waypoint && typeof loc.waypoint === 'object' ? (loc.waypoint as Record<string, unknown>) : null;
  const meta = loc.metadata && typeof loc.metadata === 'object' ? (loc.metadata as Record<string, unknown>) : null;

  const candidates: unknown[] = [
    loc.description,
    meta?.description,
    loc.significance,
    waypoint?.description,
    waypoint?.significance,
    loc.summary
  ];

  function cleanText(text: string): string {
    const rawClean = text
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*\*(.*?)\*\*\*/g, '$1')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/___(.*?)___/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .trim();

    const lines = rawClean.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      const firstLine = lines[0].replace(/^#+\s*/, '').trim();
      const nextLine = lines[1].replace(/^#+\s*/, '').trim();
      const firstLower = firstLine.toLowerCase();
      const nextLower = nextLine.toLowerCase();

      const isShortHeading = firstLine.split(' ').length <= 8 && firstLine.length < 80 && !firstLine.match(/[.!?]$/);
      const isDuplicatedByNext = nextLower.startsWith(firstLower) || 
        nextLower.replace(/^(the|a|an)\s+/, '').startsWith(firstLower.replace(/^(the|a|an)\s+/, '')) ||
        (firstLower.length >= 4 && nextLower.substring(0, Math.min(nextLower.length, firstLower.length + 30)).includes(firstLower));

      if (isShortHeading && isDuplicatedByNext) {
        lines.shift();
      }
    }

    return lines.join(' ').trim();
  }

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const cleaned = cleanText(candidate);
      if (cleaned.length > 0) {
        return cleaned;
      }
    } else if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      const textProp = (candidate as any).text ?? (candidate as any).description;
      if (typeof textProp === 'string') {
        const cleaned = cleanText(textProp);
        if (cleaned.length > 0) {
          return cleaned;
        }
      }
    }
  }

  return '';
}

/**
 * Safely extracts textual narration title from a LocationInfo or Waypoint payload.
 * Never throws TypeError when name is undefined or non-string.
 */
export function getNarrationTitle(info: unknown): string {
  if (!info || typeof info !== 'object') return '';

  const loc = info as Record<string, unknown>;
  if (typeof loc.name === 'string') {
    return loc.name.trim();
  }
  if (typeof loc.title === 'string') {
    return loc.title.trim();
  }
  return '';
}

export class NarrationService {
  private static instance: NarrationService | null = null;
  private currentProvider: NarrationProviderType = 'system';
  private systemProvider: SystemVoiceProvider;
  private orpheusProvider: OrpheusTTSProvider;
  private defaultVolume = 1.0;
  private defaultSpeed = 0.9;

  private constructor() {
    this.systemProvider = new SystemVoiceProvider();
    this.orpheusProvider = new OrpheusTTSProvider();
  }

  public static getInstance(): NarrationService {
    if (!NarrationService.instance) {
      NarrationService.instance = new NarrationService();
    }
    return NarrationService.instance;
  }

  public setProvider(provider: NarrationProviderType): void {
    if (this.currentProvider !== provider) {
      this.cancel();
      this.currentProvider = provider;
    }
  }

  public getProvider(): NarrationProviderType {
    return this.currentProvider;
  }

  public setVolume(volume: number): void {
    const v = typeof volume === 'number' && !isNaN(volume) ? Math.max(0.0, Math.min(1.0, volume)) : 1.0;
    this.defaultVolume = v;
    this.systemProvider.setVolume(v);
    this.orpheusProvider.setVolume(v);
  }

  public getVolume(): number {
    return this.defaultVolume;
  }

  public setSpeed(speed: number): void {
    const s = typeof speed === 'number' && !isNaN(speed) ? Math.max(0.5, Math.min(2.0, speed)) : 0.9;
    this.defaultSpeed = s;
    this.systemProvider.setSpeed(s);
    this.orpheusProvider.setSpeed(s);
  }

  public getSpeed(): number {
    return this.defaultSpeed;
  }

  public setVoiceURI(voiceURI: string): void {
    this.systemProvider.setVoiceURI(voiceURI);
  }

  public getVoiceURI(): string {
    return this.systemProvider.getVoiceURI();
  }

  public setOrpheusVoice(voice: string): void {
    this.orpheusProvider.setVoice(voice);
  }

  public getOrpheusVoice(): string {
    return this.orpheusProvider.getVoice();
  }

  public getOrpheusVoices(): OrpheusVoiceOption[] {
    return this.orpheusProvider.getAvailableVoices();
  }

  public isSupported(): boolean {
    const active = this.getActiveProvider();
    return active.isSupported();
  }

  /**
   * Unlocks and primes Web Speech API synthesizer during user gesture event handlers.
   */
  public prime(): void {
    this.systemProvider.prime();
  }

  public getVoices(): SpeechSynthesisVoice[] {
    return this.systemProvider.getVoices();
  }

  public onVoicesChanged(listener: (voices: SpeechSynthesisVoice[]) => void): () => void {
    return this.systemProvider.onVoicesChanged(listener);
  }

  private getActiveProvider(override?: NarrationProviderType): INarrationProvider {
    const target = override || this.currentProvider;
    return target === 'orpheus' ? this.orpheusProvider : this.systemProvider;
  }

  /**
   * Sanitizes text for natural speech synthesis:
   * - Strips Markdown headers, bold/italic asterisks/underscores, bullet points
   * - Strips citations/brackets e.g. [1], [2], [citation needed]
   * - Strips URLs and HTML tags
   * - Strips raw coordinate strings and UI metadata prefixes
   */
  public cleanNarrationText(text: string): string {
    return cleanNarrationText(text);
  }

  /**
   * Builds the formatted narration text from structured title & description.
   */
  public buildNarrationScript(title: string, description: string): string {
    return buildNarrationScript(title, description);
  }

  /**
   * Speaks structured title and description.
   * Enforces that BOTH title and description are available before speaking.
   */
  public speakStructured(options: NarrationSpeakOptions): void {
    const cleanTitle = this.cleanNarrationText(options.title);
    const cleanDesc = this.cleanNarrationText(options.description);

    if (!cleanTitle || !cleanDesc || cleanDesc.trim().length < 3) {
      console.log(`[SearchNarration] REJECTED: no narration text (cleanTitle="${cleanTitle}", cleanDescLength=${cleanDesc.trim().length})`);
      return;
    }

    console.log(`[SearchNarration] SPEAK_CALLED title="${cleanTitle}" descLength=${cleanDesc.length}`);
    this.speak(options);
  }

  /**
   * Speaks formatted narration script. Cancels any ongoing speech across all providers first.
   */
  public speak(options: NarrationSpeakOptions): void {
    this.cancel();

    const script = this.buildNarrationScript(options.title, options.description);
    if (!script) {
      console.log('[SearchNarration] REJECTED: no narration script');
      return;
    }

    const provider = this.getActiveProvider(options.provider);
    provider.speak(script, options);
  }

  /**
   * Cleanly cancels any ongoing or queued speech across all providers.
   */
  public cancel(): void {
    this.systemProvider.cancel();
    this.orpheusProvider.cancel();
  }

  public isSpeaking(): boolean {
    return this.systemProvider.isSpeaking() || this.orpheusProvider.isSpeaking();
  }
}

export const narrationService = NarrationService.getInstance();
