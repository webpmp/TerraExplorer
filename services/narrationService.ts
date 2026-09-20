/**
 * Presentation-agnostic Text-to-Speech Narration Manager supporting:
 * - System Voice Provider (Native Web Speech API)
 * - Kokoro TTS Provider (Local HTTP Bridge)
 * - Orpheus TTS Provider (Local HTTP Bridge)
 */

import { NarrationProviderType } from '../types';
import { logTraceNarration } from './waypointPipelineService';
import {
  NarrationUnit,
  NarrationSpeakOptions,
  KokoroVoiceOption,
  KOKORO_VOICES,
  OrpheusVoiceOption,
  ORPHEUS_VOICES,
  INarrationProvider,
  SystemVoiceProvider,
  KokoroTTSProvider,
  OrpheusTTSProvider,
  decodeBase64PCMToFloat32,
  cleanNarrationText,
  buildNarrationScript,
  buildFullNarrationScript,
  buildFullNarrationUnits,
  removeLeadingTitleFromDescription,
  capDescriptionForNarration,
  splitNarrationIntoSegments
} from './narrationProviders';

import { resolveCanonicalNarrative } from '../utils/narrativeResolver';

export type { NarrationUnit, NarrationSpeakOptions, KokoroVoiceOption, OrpheusVoiceOption, INarrationProvider };
export {
  KOKORO_VOICES,
  ORPHEUS_VOICES,
  SystemVoiceProvider,
  KokoroTTSProvider,
  OrpheusTTSProvider,
  decodeBase64PCMToFloat32,
  cleanNarrationText,
  buildNarrationScript,
  buildFullNarrationScript,
  buildFullNarrationUnits,
  removeLeadingTitleFromDescription,
  capDescriptionForNarration,
  splitNarrationIntoSegments,
  resolveCanonicalNarrative
};

/**
 * Safely extracts canonical textual narrative description from a LocationInfo or Waypoint payload.
 * Consumes the single canonical narrative resolver used by InfoPanel.
 * Applies audio-specific cleanup (markdown, headings) without altering semantic content.
 */
export function getNarrationDescription(info: unknown): string {
  if (!info || typeof info !== 'object') return '';

  const canonicalResult = resolveCanonicalNarrative(info);
  const narrativeText = canonicalResult.narrativeText;

  if (!narrativeText) return '';

  // Clean narration text for spoken audio
  return cleanNarrationText(narrativeText);
}

/**
 * Safely extracts canonical textual narration title from a LocationInfo or Waypoint payload.
 * Never throws TypeError when name is undefined or non-string.
 */
export function getNarrationTitle(info: unknown): string {
  if (!info || typeof info !== 'object') return '';

  const canonicalResult = resolveCanonicalNarrative(info);
  if (canonicalResult.title) {
    return cleanNarrationText(canonicalResult.title);
  }

  const loc = info as Record<string, unknown>;
  if (typeof loc.name === 'string') {
    return cleanNarrationText(loc.name.trim());
  }
  if (typeof loc.title === 'string') {
    return cleanNarrationText(loc.title.trim());
  }
  return '';
}

export class NarrationService {
  private static instance: NarrationService | null = null;
  private currentProvider: NarrationProviderType = 'system';
  private systemProvider: SystemVoiceProvider;
  private kokoroProvider: KokoroTTSProvider;
  private orpheusProvider: OrpheusTTSProvider;
  private defaultVolume = 1.0;
  private defaultSpeed = 0.9;

  private constructor() {
    this.systemProvider = new SystemVoiceProvider();
    this.kokoroProvider = new KokoroTTSProvider();
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
    this.kokoroProvider.setVolume(v);
    this.orpheusProvider.setVolume(v);
  }

  public getVolume(): number {
    return this.defaultVolume;
  }

  public setSpeed(speed: number): void {
    const s = typeof speed === 'number' && !isNaN(speed) ? Math.max(0.5, Math.min(2.0, speed)) : 0.9;
    this.defaultSpeed = s;
    this.systemProvider.setSpeed(s);
    this.kokoroProvider.setSpeed(s);
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

  public setKokoroVoice(voice: string): void {
    this.kokoroProvider.setVoice(voice);
  }

  public getKokoroVoice(): string {
    return this.kokoroProvider.getVoice();
  }

  public getKokoroVoices(): KokoroVoiceOption[] {
    return this.kokoroProvider.getAvailableVoices();
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

  public isTTSAvailable(): boolean {
    if (this.currentProvider === 'kokoro' || this.currentProvider === 'orpheus') {
      return true;
    }
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
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
    if (target === 'kokoro') return this.kokoroProvider;
    if (target === 'orpheus') return this.orpheusProvider;
    return this.systemProvider;
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

    const stableId = options.waypointId || cleanTitle;
    logTraceNarration(stableId, cleanTitle, 'narration request started', `descLength=${cleanDesc.length}`);
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

    const stableId = options.waypointId || options.title;
    logTraceNarration(stableId, options.title, 'narration source ready', `scriptLength=${script.length}`);

    const provider = this.getActiveProvider(options.provider);
    provider.speak(script, options);
  }

  /**
   * Cleanly cancels any ongoing or queued speech across all providers.
   */
  public cancel(): void {
    this.systemProvider.cancel();
    this.kokoroProvider.cancel();
    this.orpheusProvider.cancel();
  }

  /**
   * Preloads/pre-generates narration audio silently in the background without playing it.
   * Does NOT cancel or interrupt any ongoing audio playback.
   */
  public async preloadNarration(
    title: string,
    description: string,
    options?: NarrationSpeakOptions,
    signal?: AbortSignal
  ): Promise<{ pcmData: Float32Array; sampleRate: number; duration: number; script: string; voice: string } | null> {
    const cleanTitle = this.cleanNarrationText(title);
    const cleanDesc = this.cleanNarrationText(description);

    if (!cleanTitle || !cleanDesc || cleanDesc.trim().length < 3) {
      return null;
    }

    const script = this.buildNarrationScript(cleanTitle, cleanDesc);
    if (!script) return null;

    const stableId = options?.waypointId || cleanTitle;
    logTraceNarration(stableId, cleanTitle, 'narration source ready', `scriptLength=${script.length} (preload)`);

    const providerType = options?.provider || this.currentProvider;
    if (providerType === 'kokoro') {
      return this.kokoroProvider.generateAudio(script, {
        ...options,
        waypointId: stableId,
        title: cleanTitle,
        description: cleanDesc
      }, signal);
    }
    if (providerType === 'orpheus') {
      return this.orpheusProvider.generateAudio(script, {
        ...options,
        waypointId: stableId,
        title: cleanTitle,
        description: cleanDesc
      }, signal);
    }

    return null;
  }

  /**
   * Speaks pre-generated cached audio immediately with zero generation delay.
   */
  public speakCached(
    cached: { pcmData: Float32Array; sampleRate: number; duration: number },
    options: NarrationSpeakOptions
  ): void {
    this.cancel();
    const providerType = options.provider || this.currentProvider;
    if (providerType === 'kokoro') {
      this.kokoroProvider.speakCached(cached, options);
    } else {
      this.orpheusProvider.speakCached(cached, options);
    }
  }

  public isSpeaking(): boolean {
    return this.systemProvider.isSpeaking() || this.kokoroProvider.isSpeaking() || this.orpheusProvider.isSpeaking();
  }
}

export const narrationService = NarrationService.getInstance();

