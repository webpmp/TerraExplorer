/**
 * Narration Providers for TerraExplorer:
 * - SystemVoiceProvider: Native browser Web Speech API speech synthesis
 * - OrpheusTTSProvider: Progressive streaming TTS via SSE (http://127.0.0.1:8765/tts/stream) + Web Audio API
 */

import { NarrationProviderType } from '../types';

export interface NarrationSpeakOptions {
  title: string;
  description: string;
  provider?: NarrationProviderType;
  voiceURI?: string;
  orpheusVoice?: string;
  limit?: number;
  speed?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: unknown) => void;
}

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
    .replace(/^(overview|climate|population|coordinates|significance|highlights)\s*[:\-]\s*/gi, '')
    // Collapse multiple whitespace
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

/**
 * Builds the formatted narration text from structured title & description.
 */
export function buildNarrationScript(title: string, description: string): string {
  const cleanTitle = cleanNarrationText(title);
  const cleanDesc = cleanNarrationText(description);

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

    if (!this.isSupported()) {
      console.log('[Narration] Web Speech API is not supported in this environment');
      options.onError?.(new Error('Web Speech API is not supported in this environment'));
      return;
    }

    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      const utterance = new SpeechSynthesisUtterance(script);
      console.log(`[SearchNarration] UTTERANCE_CREATED textLength=${script.length}`);
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
  }

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

  public async speak(script: string, options: NarrationSpeakOptions): Promise<void> {
    this.cancel();

    if (!this.isSupported()) {
      const err = new Error('Web Audio API is not supported in this environment');
      console.warn('[OrpheusTTS]', err);
      options.onError?.(err);
      return;
    }

    const controller = new AbortController();
    this.activeAbortController = controller;

    const voice = options.orpheusVoice || this.defaultVoice || 'tara';
    const volume = typeof options.volume === 'number' && !isNaN(options.volume) ? options.volume : this.defaultVolume;
    const speed = typeof options.speed === 'number' && !isNaN(options.speed) ? options.speed : this.defaultSpeed;
    const limit = typeof options.limit === 'number' && !isNaN(options.limit) && options.limit > 0 ? options.limit : 600;

    let textToSend = script;
    if (options?.description) {
      const originalDesc = cleanNarrationText(options.description);
      const cappedDesc = capDescriptionForNarration(originalDesc, limit);
      if (cappedDesc.length < originalDesc.length) {
        console.log(`[OrpheusTTS] Description capped for narration: originalLength=${originalDesc.length} narrationLength=${cappedDesc.length} limit=${limit}`);
      }
      textToSend = buildNarrationScript(options.title || '', cappedDesc);
    }

    const requestStartTime = performance.now();
    console.log(`[OrpheusTTS] Requesting streaming TTS generation (voice="${voice}", scriptLength=${textToSend.length})`);

    const AudioContextClass = getAudioContextClass();
    if (!AudioContextClass) {
      const err = new Error('Web Audio API AudioContext not available');
      options.onError?.(err);
      return;
    }

    const audioContext = new AudioContextClass();
    this.audioContext = audioContext;

    const gainNode = audioContext.createGain();
    this.gainNode = gainNode;
    try {
      gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    } catch (e) {
      gainNode.gain.value = volume;
    }
    gainNode.connect(audioContext.destination);

    const PRE_BUFFER_TARGET_SECONDS = 3.0;
    const bufferedChunks: { buffer: AudioBuffer; duration: number }[] = [];
    let bufferedDuration = 0;
    let isAudiblePlaybackStarted = false;
    let totalReceivedAudioDuration = 0;
    let chunkCount = 0;
    this.streamDone = false;
    this.nextStartTime = 0;

    const scheduleChunk = (audioBuffer: AudioBuffer, duration: number) => {
      if (!this.audioContext || !this.gainNode || controller.signal.aborted) return;

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      try {
        source.playbackRate.setValueAtTime(speed, this.audioContext.currentTime);
      } catch (e) {
        source.playbackRate.value = speed;
      }
      source.connect(this.gainNode);

      const currentTime = this.audioContext.currentTime;
      const playAt = Math.max(currentTime + 0.02, this.nextStartTime);
      source.start(playAt);
      this.activeSourceNodes.add(source);
      this.nextStartTime = playAt + (duration / speed);

      source.onended = () => {
        this.activeSourceNodes.delete(source);
        checkStreamComplete();
      };
    };

    const startAudiblePlayback = async () => {
      if (isAudiblePlaybackStarted || controller.signal.aborted) return;
      isAudiblePlaybackStarted = true;
      this.isSpeakingInternal = true;

      if (this.audioContext && this.audioContext.state === 'suspended') {
        try {
          await this.audioContext.resume();
        } catch (e) {
          // Ignore
        }
      }

      if (controller.signal.aborted || !this.audioContext) return;

      const playbackStartDelayMs = (performance.now() - requestStartTime).toFixed(0);
      console.log(`[OrpheusTTS] Audible playback started (delay=${playbackStartDelayMs}ms, bufferedAudio=${bufferedDuration.toFixed(2)}s, chunks=${bufferedChunks.length})`);
      options.onStart?.();

      this.nextStartTime = this.audioContext.currentTime + 0.05;
      for (const chunk of bufferedChunks) {
        scheduleChunk(chunk.buffer, chunk.duration);
      }
      bufferedChunks.length = 0;
    };

    const checkStreamComplete = () => {
      if (this.streamDone && this.activeSourceNodes.size === 0 && !controller.signal.aborted) {
        this.isSpeakingInternal = false;
        const totalElapsedMs = (performance.now() - requestStartTime).toFixed(0);
        console.log(`[OrpheusTTS] Narration stream completed (totalTime=${totalElapsedMs}ms, totalChunks=${chunkCount}, audioDuration=${totalReceivedAudioDuration.toFixed(2)}s)`);
        options.onEnd?.();
      }
    };

    const fetchFn = (typeof window !== 'undefined' && typeof window.fetch === 'function') ? window.fetch : fetch;

    try {
      const response = await fetchFn(this.bridgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: textToSend,
          voice
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        let errorDetail = '';
        try {
          const errJson = await response.json();
          errorDetail = errJson.error || errJson.message || '';
        } catch {
          // If response isn't JSON
        }
        const msg = errorDetail
          ? `Orpheus TTS Bridge error (${response.status}): ${errorDetail}`
          : `Orpheus TTS Bridge error (HTTP ${response.status}: ${response.statusText || 'Streaming request failed'})`;
        throw new Error(msg);
      }

      if (!response.body) {
        throw new Error('ReadableStream not supported by response');
      }

      const reader = response.body.getReader();
      this.activeReader = reader;

      const decoder = new TextDecoder();
      let sseBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done || controller.signal.aborted) {
          break;
        }

        sseBuffer += decoder.decode(value, { stream: true });
        const events = sseBuffer.split('\n\n');
        sseBuffer = events.pop() || '';

        for (const rawEvent of events) {
          if (!rawEvent.trim()) continue;

          for (const line of rawEvent.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data:')) {
              const dataStr = trimmed.slice(5).trim();
              if (dataStr === '[DONE]') {
                this.streamDone = true;
                continue;
              }

              try {
                const eventJson = JSON.parse(dataStr);
                if (eventJson.error) {
                  throw new Error(`Orpheus TTS generation error: ${eventJson.error}`);
                }

                if (eventJson.raw_pcm_base64) {
                  chunkCount++;
                  if (chunkCount === 1) {
                    const firstChunkArrivalMs = (performance.now() - requestStartTime).toFixed(0);
                    console.log(`[OrpheusTTS] First audio chunk received in ${firstChunkArrivalMs}ms`);
                  }

                  const pcmData = decodeBase64PCMToFloat32(eventJson.raw_pcm_base64);
                  if (pcmData.length > 0 && this.audioContext) {
                    const audioBuffer = this.audioContext.createBuffer(1, pcmData.length, 24000);
                    if (typeof audioBuffer.copyToChannel === 'function') {
                      audioBuffer.copyToChannel(pcmData, 0);
                    } else {
                      const channelData = audioBuffer.getChannelData(0);
                      channelData.set(pcmData);
                    }

                    const chunkDuration = pcmData.length / 24000;
                    totalReceivedAudioDuration += chunkDuration;

                    if (!isAudiblePlaybackStarted) {
                      bufferedChunks.push({ buffer: audioBuffer, duration: chunkDuration });
                      bufferedDuration += chunkDuration;
                      if (bufferedDuration >= PRE_BUFFER_TARGET_SECONDS) {
                        await startAudiblePlayback();
                      }
                    } else {
                      scheduleChunk(audioBuffer, chunkDuration);
                    }
                  }
                }

                if (eventJson.done) {
                  this.streamDone = true;
                }
              } catch (parseErr: any) {
                if (parseErr instanceof Error && parseErr.message.startsWith('Orpheus')) {
                  throw parseErr;
                }
                // Non-fatal parse warning for malformed intermediate text
              }
            }
          }
        }
      }

      this.streamDone = true;

      // If stream ended before reaching 3.0s pre-buffer target (e.g. short narration phrase)
      if (!isAudiblePlaybackStarted && bufferedChunks.length > 0 && !controller.signal.aborted) {
        await startAudiblePlayback();
      }

      checkStreamComplete();
    } catch (err: any) {
      if (controller.signal.aborted || err?.name === 'AbortError') {
        // Normal cancellation
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

      console.warn('[OrpheusTTS] Streaming generation/playback error:', friendlyError);
      options.onError?.(friendlyError);
    } finally {
      if (this.activeAbortController === controller) {
        this.activeAbortController = null;
      }
      this.activeReader = null;
    }
  }

  public cancel(): void {
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
    console.log('[OrpheusTTS] Narration cancelled');
  }

  public isSpeaking(): boolean {
    return this.isSpeakingInternal;
  }
}
