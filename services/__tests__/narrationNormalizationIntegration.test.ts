import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { narrationService } from '../narrationService';
import { resolveCanonicalNarrative } from '../../utils/narrativeResolver';

describe('TTS Boundary Narration Normalization Integration Suite', () => {
  let createdUtteranceTexts: string[] = [];
  let fetchCalls: { url: string; body: any }[] = [];

  class MockAudioContext {
    currentTime = 0;
    state = 'running';
    destination = {};
    createGain() {
      return {
        gain: { value: 1, setValueAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn()
      };
    }
    createBufferSource() {
      return {
        buffer: null,
        playbackRate: { value: 1, setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
        onended: null
      };
    }
    createBuffer() {
      return {
        sampleRate: 24000,
        duration: 1.0,
        length: 24000,
        getChannelData: () => new Float32Array(24000),
        copyToChannel: vi.fn()
      };
    }
    decodeAudioData() {
      return Promise.resolve({
        sampleRate: 24000,
        duration: 1.0,
        length: 24000,
        getChannelData: () => new Float32Array(24000)
      });
    }
    resume() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
  }

  beforeEach(() => {
    createdUtteranceTexts = [];
    fetchCalls = [];

    const mockSpeechSynthesis = {
      speaking: false,
      pending: false,
      paused: false,
      speak: vi.fn((utterance: any) => {
        utterance.onstart?.();
        setTimeout(() => utterance.onend?.(), 10);
      }),
      cancel: vi.fn(),
      resume: vi.fn(),
      getVoices: vi.fn(() => [{ name: 'Alex', voiceURI: 'alex', lang: 'en-US' }]),
      onvoiceschanged: null
    };

    const mockUtterance = vi.fn().mockImplementation(function (this: any, text: string) {
      this.text = text;
      createdUtteranceTexts.push(text);
      this.rate = 1;
      this.volume = 1;
      this.voice = null;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
    });

    const mockFetch = vi.fn(async (url: string, options: any) => {
      const parsedBody = options?.body ? JSON.parse(options.body) : null;
      fetchCalls.push({ url, body: parsedBody });

      if (url.includes(':8765/tts/stream')) {
        // Mock SSE stream for Orpheus
        const stream = new ReadableStream({
          start(controller) {
            const chunk = new TextEncoder().encode('data: {"raw_pcm_base64":"AAAA"}\n\ndata: [DONE]\n\n');
            controller.enqueue(chunk);
            controller.close();
          }
        });
        return new Response(stream, { status: 200 });
      }

      if (url.includes(':8880/tts')) {
        // Mock WAV response for Kokoro (44-byte dummy WAV header + PCM)
        const buffer = new ArrayBuffer(100);
        return new Response(buffer, { status: 200 });
      }

      return new Response(null, { status: 200 });
    });

    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('speechSynthesis', mockSpeechSynthesis);
    vi.stubGlobal('SpeechSynthesisUtterance', mockUtterance);
    vi.stubGlobal('fetch', mockFetch);
    vi.stubGlobal('window', {
      speechSynthesis: mockSpeechSynthesis,
      SpeechSynthesisUtterance: mockUtterance,
      AudioContext: MockAudioContext,
      fetch: mockFetch
    });

    (globalThis as any).window = window;
    (globalThis as any).AudioContext = MockAudioContext;
  });

  afterEach(() => {
    narrationService.cancel();
    vi.restoreAllMocks();
  });

  it('proves that System Voice provider receives normalized text at the TTS boundary while source UI data remains unchanged', () => {
    const sourceNarrativeData = {
      name: 'Falkland Islands Expedition',
      description: 'During World War I, on December 5, 1914, the naval squadron assembled near the archipelago.'
    };

    // Verify canonical UI narrative resolution retains original text unmodified
    const canonicalUI = resolveCanonicalNarrative(sourceNarrativeData);
    expect(canonicalUI.narrativeText).toBe(
      'During World War I, on December 5, 1914, the naval squadron assembled near the archipelago.'
    );

    narrationService.setProvider('system');
    narrationService.speakStructured({
      title: sourceNarrativeData.name,
      description: sourceNarrativeData.description
    });

    // TTS receives normalized pronunciation text
    expect(createdUtteranceTexts.length).toBeGreaterThan(0);
    const spokenUtterance = createdUtteranceTexts[0];
    expect(spokenUtterance).toContain('During World War One, on December fifth, nineteen fourteen');

    // UI and source object remain completely untouched
    expect(sourceNarrativeData.description).toBe(
      'During World War I, on December 5, 1914, the naval squadron assembled near the archipelago.'
    );
    expect(sourceNarrativeData.name).toBe('Falkland Islands Expedition');
  });

  it('proves that Kokoro TTS provider receives normalized text in HTTP payload while source UI data remains unchanged', async () => {
    const sourceNarrativeData = {
      name: 'Pacific Fortress',
      description: 'The site was heavily defended during World War II, notably on June 28, 1942.'
    };

    narrationService.setProvider('kokoro');
    await narrationService.preloadNarration(
      sourceNarrativeData.name,
      sourceNarrativeData.description,
      { provider: 'kokoro' }
    );

    expect(fetchCalls.length).toBeGreaterThan(0);
    const kokoroCall = fetchCalls.find((c) => c.url.includes(':8880/tts'));
    expect(kokoroCall).toBeDefined();
    expect(kokoroCall?.body.text).toContain('The site was heavily defended during World War Two, notably on June twenty-eighth, nineteen forty-two.');

    // Source data remains strictly unchanged
    expect(sourceNarrativeData.description).toBe(
      'The site was heavily defended during World War II, notably on June 28, 1942.'
    );
  });

  it('proves that Orpheus TTS provider receives normalized text in HTTP payload while source UI data remains unchanged', async () => {
    const sourceNarrativeData = {
      name: 'Historic Treaty',
      description: 'Signed during World War I on December 5, 1914, establishing peace.'
    };

    narrationService.setProvider('orpheus');
    await narrationService.preloadNarration(
      sourceNarrativeData.name,
      sourceNarrativeData.description,
      { provider: 'orpheus' }
    );

    expect(fetchCalls.length).toBeGreaterThan(0);
    const orpheusCall = fetchCalls.find((c) => c.url.includes(':8765/tts/stream'));
    expect(orpheusCall).toBeDefined();
    expect(orpheusCall?.body.text).toContain('Signed during World War One on December fifth, nineteen fourteen, establishing peace.');

    // Source data remains strictly unchanged
    expect(sourceNarrativeData.description).toBe(
      'Signed during World War I on December 5, 1914, establishing peace.'
    );
  });
});
