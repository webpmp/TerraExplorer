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
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private activeUtterances: Set<SpeechSynthesisUtterance> = new Set();
  private voices: SpeechSynthesisVoice[] = [];
  private voiceListeners: Set<(voices: SpeechSynthesisVoice[]) => void> = new Set();
  private isSpeakingInternal = false;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private defaultVolume = 1.0;
  private defaultSpeed = 0.9;
  private defaultVoiceURI = '';

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

  /**
   * Unlocks and primes Web Speech API synthesizer during user gesture event handlers.
   */
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

    // Avoid duplicating title if description already begins with title or alias
    const normTitle = cleanTitle.toLowerCase().replace(/^(the|a|an)\s+/, '');
    const normDesc = cleanDesc.toLowerCase().replace(/^(the|a|an)\s+/, '');

    if (normDesc.startsWith(normTitle) || 
        (normTitle.length >= 4 && normDesc.substring(0, Math.min(normDesc.length, normTitle.length + 30)).includes(normTitle))) {
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
      console.log(`[SearchNarration] REJECTED: no narration text (cleanTitle="${cleanTitle}", cleanDescLength=${cleanDesc.trim().length})`);
      return;
    }

    console.log(`[SearchNarration] SPEAK_CALLED title="${cleanTitle}" descLength=${cleanDesc.length}`);

    this.speak(options);
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
      console.log('[SearchNarration] REJECTED: no narration script');
      return;
    }

    try {
      // Unpause/resume synthesis if stalled
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      const utterance = new SpeechSynthesisUtterance(script);
      console.log(`[SearchNarration] UTTERANCE_CREATED textLength=${script.length}`);
      this.currentUtterance = utterance;
      this.activeUtterances.add(utterance);

      // Configure speed (rate)
      const speed = typeof options.speed === 'number' && !isNaN(options.speed) ? options.speed : this.defaultSpeed;
      utterance.rate = Math.max(0.5, Math.min(2.0, speed));

      // Configure volume
      const volume = typeof options.volume === 'number' && !isNaN(options.volume) ? options.volume : this.defaultVolume;
      utterance.volume = Math.max(0.0, Math.min(1.0, volume));

      // Resolve voice by voiceURI
      const voiceURI = options.voiceURI || this.defaultVoiceURI;
      if (voiceURI) {
        const voices = this.getVoices();
        const matched = voices.find((v) => v.voiceURI === voiceURI || v.name === voiceURI);
        if (matched) {
          utterance.voice = matched;
        }
      }

      utterance.onstart = () => {
        this.isSpeakingInternal = true;
        this.startKeepAlive();
        console.log(`[SearchNarration] SPEECH_ONSTART text="${script.slice(0, 60)}..."`);
        console.log('[narrationService] SPEECH_ONSTART');
        options.onStart?.();
      };

      utterance.onend = () => {
        this.activeUtterances.delete(utterance);
        this.isSpeakingInternal = false;
        this.currentUtterance = null;
        this.stopKeepAlive();
        console.log('[SearchNarration] SPEECH_ONEND');
        options.onEnd?.();
      };

      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        this.activeUtterances.delete(utterance);
        this.isSpeakingInternal = false;
        this.currentUtterance = null;
        this.stopKeepAlive();
        // Ignore "canceled" error which fires normally on cancel()
        if (event.error !== 'canceled' && event.error !== 'interrupted') {
          console.warn(`[SearchNarration] SPEECH_ONERROR error="${event.error}"`);
          options.onError?.(event);
        }
      };

      console.log(`[SearchNarration] SYNTHESIS_SPEAK_CALLED speaking=${window.speechSynthesis.speaking} pending=${window.speechSynthesis.pending} paused=${window.speechSynthesis.paused}`);
      window.speechSynthesis.speak(utterance);
      // Ensure resume is dispatched after speak in Chromium
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
  }

  /**
   * Cleanly cancels any ongoing or queued speech.
   */
  public cancel(): void {
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
  }

  public isSpeaking(): boolean {
    return this.isSpeakingInternal;
  }
}

export const narrationService = NarrationService.getInstance();
