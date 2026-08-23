/**
 * Presentation-agnostic Text-to-Speech Narration Service using the native Web Speech API.
 */

export interface NarrationSpeakOptions {
  title: string;
  description: string;
  voiceURI?: string;
  speed?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: unknown) => void;
}

export class NarrationService {
  private static instance: NarrationService | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private voiceListeners: Set<(voices: SpeechSynthesisVoice[]) => void> = new Set();
  private isSpeakingInternal = false;

  private constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.refreshVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => {
          this.refreshVoices();
        };
      }
    }
  }

  public static getInstance(): NarrationService {
    if (!NarrationService.instance) {
      NarrationService.instance = new NarrationService();
    }
    return NarrationService.instance;
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  }

  private refreshVoices(): void {
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

  /**
   * Sanitizes text for natural speech synthesis:
   * - Strips Markdown headers, bold/italic asterisks/underscores, bullet points
   * - Strips citations/brackets e.g. [1], [2], [citation needed]
   * - Strips URLs and HTML tags
   * - Strips raw coordinate strings and UI metadata prefixes
   */
  public cleanNarrationText(text: string): string {
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
      .replace(/^(overview|climate|population|coordinates|significance|highlights)\s*[:\-]\s*/gi, '')
      // Collapse multiple whitespace
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned;
  }

  /**
   * Builds the formatted narration text from structured title & description.
   */
  public buildNarrationScript(title: string, description: string): string {
    const cleanTitle = this.cleanNarrationText(title);
    const cleanDesc = this.cleanNarrationText(description);

    if (!cleanTitle && !cleanDesc) return '';
    if (!cleanTitle) return cleanDesc;
    if (!cleanDesc) return cleanTitle;

    // Avoid duplicating title if description already begins with title
    const normTitle = cleanTitle.toLowerCase();
    const normDesc = cleanDesc.toLowerCase();

    if (normDesc.startsWith(normTitle)) {
      return cleanDesc;
    }

    // Ensure title ends with punctuation before appending description
    const titlePunct = /[.!?]$/.test(cleanTitle) ? cleanTitle : `${cleanTitle}.`;
    return `${titlePunct} ${cleanDesc}`;
  }

  /**
   * Speaks structured title and description.
   * Enforces that BOTH title and description are available before speaking.
   */
  public speakStructured(options: NarrationSpeakOptions): void {
    const cleanTitle = this.cleanNarrationText(options.title);
    const cleanDesc = this.cleanNarrationText(options.description);

    if (!cleanTitle || !cleanDesc || cleanDesc.trim().length < 3) {
      console.log('[Narration] Description not ready or insufficient, waiting for enrichment');
      return;
    }

    console.log(`[Narration] title available: "${cleanTitle}"`);
    console.log(`[Narration] description available: "${cleanDesc.slice(0, 40)}..."`);
    console.log('[Narration] speaking combined text');

    this.speak(options);
  }

  /**
   * Speaks structured title and description. Cancels any ongoing speech first.
   */
  public speak(options: NarrationSpeakOptions): void {
    this.cancel();

    if (!this.isSupported()) {
      console.log('[Narration] Web Speech API is not supported in this environment');
      options.onError?.(new Error('Web Speech API is not supported in this environment'));
      return;
    }

    const script = this.buildNarrationScript(options.title, options.description);
    if (!script) {
      console.log('[Narration] No narration script available to speak');
      return;
    }

    try {
      const utterance = new SpeechSynthesisUtterance(script);
      this.currentUtterance = utterance;

      // Configure speed (rate)
      const speed = typeof options.speed === 'number' && !isNaN(options.speed) ? options.speed : 0.9;
      utterance.rate = Math.max(0.5, Math.min(2.0, speed));

      // Configure volume
      const volume = typeof options.volume === 'number' && !isNaN(options.volume) ? options.volume : 1.0;
      utterance.volume = Math.max(0.0, Math.min(1.0, volume));

      // Resolve voice by voiceURI
      if (options.voiceURI) {
        const voices = this.getVoices();
        const matched = voices.find((v) => v.voiceURI === options.voiceURI || v.name === options.voiceURI);
        if (matched) {
          utterance.voice = matched;
        }
      }

      utterance.onstart = () => {
        this.isSpeakingInternal = true;
        console.log(`[Narration] started text="${script.slice(0, 60)}..."`);
        options.onStart?.();
      };

      utterance.onend = () => {
        this.isSpeakingInternal = false;
        this.currentUtterance = null;
        console.log('[Narration] completed');
        options.onEnd?.();
      };

      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        this.isSpeakingInternal = false;
        this.currentUtterance = null;
        // Ignore "canceled" error which fires normally on cancel()
        if (event.error !== 'canceled' && event.error !== 'interrupted') {
          console.warn('[Narration] Speech synthesis error:', event.error);
          options.onError?.(event);
        }
      };

      window.speechSynthesis.speak(utterance);
    } catch (err: unknown) {
      this.isSpeakingInternal = false;
      this.currentUtterance = null;
      console.warn('[Narration] Failed to execute speak:', err);
      options.onError?.(err);
    }
  }

  /**
   * Cleanly cancels any ongoing or queued speech.
   */
  public cancel(): void {
    if (this.isSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {
        // Ignore
      }
    }
    this.currentUtterance = null;
    this.isSpeakingInternal = false;
  }

  public isSpeaking(): boolean {
    return this.isSpeakingInternal;
  }
}

export const narrationService = NarrationService.getInstance();
