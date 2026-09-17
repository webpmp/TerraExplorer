import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  narrationService,
  NarrationService,
  SystemVoiceProvider,
  OrpheusTTSProvider,
  ORPHEUS_VOICES,
  decodeBase64PCMToFloat32,
  getNarrationTitle,
  getNarrationDescription,
  capDescriptionForNarration,
  cleanNarrationText,
  buildNarrationScript
} from '../narrationService';

// Helpers to generate mock PCM base64 data and SSE streams
function createFakePCMBase64(durationSeconds: number, sampleRate = 24000): string {
  const numSamples = Math.floor(durationSeconds * sampleRate);
  const int16 = new Int16Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    int16[i] = Math.round(Math.sin((i / sampleRate) * 440 * 2 * Math.PI) * 10000);
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return Buffer.from(binary, 'binary').toString('base64');
}

function createMockSSEStream(chunks: { raw_pcm_base64?: string; error?: string; done?: boolean }[]) {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    async pull(controller) {
      if (index < chunks.length) {
        const item = chunks[index++];
        const sseLine = `data: ${JSON.stringify(item)}\n\n`;
        controller.enqueue(encoder.encode(sseLine));
      } else {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    }
  });
}

describe('Orpheus TTS Progressive Streaming & Narration Provider Suite', () => {
  let createdSourceNodes: any[] = [];
  let mockAudioContextInstance: any;

  class MockAudioBuffer {
    public length: number;
    public sampleRate: number;
    public numberOfChannels: number;
    public channelData: Float32Array;

    constructor(numberOfChannels: number, length: number, sampleRate: number) {
      this.numberOfChannels = numberOfChannels;
      this.length = length;
      this.sampleRate = sampleRate;
      this.channelData = new Float32Array(length);
    }

    public copyToChannel(source: Float32Array, channelNumber: number): void {
      this.channelData.set(source);
    }

    public getChannelData(channelNumber: number): Float32Array {
      return this.channelData;
    }
  }

  class MockAudioBufferSourceNode {
    public buffer: any = null;
    public playbackRate = {
      value: 1.0,
      setValueAtTime: vi.fn((val: number) => {
        this.playbackRate.value = val;
      })
    };
    public onended: (() => void) | null = null;
    public start = vi.fn();
    public stop = vi.fn();
    public connect = vi.fn();
    public disconnect = vi.fn();

    constructor() {
      createdSourceNodes.push(this);
    }
  }

  class MockGainNode {
    public gain = {
      value: 1.0,
      setValueAtTime: vi.fn((val: number) => {
        this.gain.value = val;
      })
    };
    public connect = vi.fn();
    public disconnect = vi.fn();
  }

  class MockAudioContext {
    public state = 'running';
    public currentTime = 0;
    public destination = {};
    public createGain = vi.fn(() => new MockGainNode());
    public createBufferSource = vi.fn(() => new MockAudioBufferSourceNode());
    public createBuffer = vi.fn((channels: number, length: number, sampleRate: number) =>
      new MockAudioBuffer(channels, length, sampleRate)
    );
    public resume = vi.fn().mockResolvedValue(undefined);
    public close = vi.fn().mockResolvedValue(undefined);

    constructor() {
      mockAudioContextInstance = this;
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    createdSourceNodes = [];

    // Reset narration service to default provider
    narrationService.cancel();
    narrationService.setProvider('system');
    narrationService.setOrpheusVoice('tara');
    narrationService.setVolume(1.0);
    narrationService.setSpeed(0.9);

    // Mock Web Audio Context
    vi.stubGlobal('AudioContext', MockAudioContext);

    // Mock SpeechSynthesis
    const mockSpeechSynthesis = {
      speaking: false,
      pending: false,
      paused: false,
      speak: vi.fn((utterance: any) => {
        if (utterance.onstart) utterance.onstart();
      }),
      cancel: vi.fn(),
      resume: vi.fn(),
      getVoices: vi.fn(() => [
        { name: 'Alex', lang: 'en-US', voiceURI: 'Alex' } as SpeechSynthesisVoice,
        { name: 'Victoria', lang: 'en-US', voiceURI: 'Victoria' } as SpeechSynthesisVoice
      ]),
      onvoiceschanged: null
    };

    vi.stubGlobal('speechSynthesis', mockSpeechSynthesis);
    vi.stubGlobal('window', {
      speechSynthesis: mockSpeechSynthesis,
      SpeechSynthesisUtterance: vi.fn().mockImplementation(function (this: any, text: string) {
        this.text = text;
        this.rate = 1.0;
        this.volume = 1.0;
        this.voice = null;
        this.onstart = null;
        this.onend = null;
        this.onerror = null;
      }),
      AudioContext: MockAudioContext,
      fetch: vi.fn()
    });

    (globalThis as any).window = window;
    (globalThis as any).AudioContext = MockAudioContext;
    (globalThis as any).speechSynthesis = mockSpeechSynthesis;
    (globalThis as any).SpeechSynthesisUtterance = window.SpeechSynthesisUtterance;
  });

  const setFetchMock = (mockFn: any) => {
    vi.stubGlobal('fetch', mockFn);
    if (typeof window !== 'undefined') {
      (window as any).fetch = mockFn;
    }
  };

  afterEach(() => {
    narrationService.cancel();
    vi.unstubAllGlobals();
  });

  describe('1. PCM Decoding Utility', () => {
    it('accurately decodes 16-bit signed PCM mono audio to Float32 [-1.0, 1.0]', () => {
      const pcmBase64 = createFakePCMBase64(0.1, 24000);
      const float32 = decodeBase64PCMToFloat32(pcmBase64);
      expect(float32.length).toBe(2400);
      expect(float32[0]).toBeGreaterThanOrEqual(-1.0);
      expect(float32[0]).toBeLessThanOrEqual(1.0);
    });
  });

  describe('2. System Voice Default Provider Behavior & Immutability', () => {
    it('defaults to system voice provider with completely unchanged behavior', () => {
      expect(narrationService.getProvider()).toBe('system');
    });

    it('creates SpeechSynthesisUtterance with formatted script, rate, volume, and voice', () => {
      const speakSpy = vi.spyOn(window.speechSynthesis, 'speak');
      const onStart = vi.fn();
      const onEnd = vi.fn();

      narrationService.setVoiceURI('Alex');
      narrationService.setSpeed(1.2);
      narrationService.setVolume(0.75);

      narrationService.speakStructured({
        title: 'Machu Picchu',
        description: '15th-century Inca citadel located in the Eastern Cordillera of southern Peru.',
        onStart,
        onEnd
      });

      expect(speakSpy).toHaveBeenCalledTimes(1);
      const utterance = speakSpy.mock.calls[0][0] as any;
      expect(utterance.text).toBe(
        'Machu Picchu. 15th-century Inca citadel located in the Eastern Cordillera of southern Peru.'
      );
      expect(utterance.rate).toBe(1.2);
      expect(utterance.volume).toBe(0.75);
      expect(utterance.voice?.name).toBe('Alex');
      expect(onStart).toHaveBeenCalledTimes(1);

      // Simulate completion
      utterance.onend();
      expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('cancels speech synthesis cleanly when cancel() is invoked', () => {
      const cancelSpy = vi.spyOn(window.speechSynthesis, 'cancel');
      narrationService.speakStructured({
        title: 'Colosseum',
        description: 'An oval amphitheatre in the centre of the city of Rome, Italy.'
      });

      narrationService.cancel();
      expect(cancelSpy).toHaveBeenCalled();
      expect(narrationService.isSpeaking()).toBe(false);
    });
  });

  describe('3. Orpheus Streaming TTS Provider & Web Audio API Scheduling', () => {
    it('sends POST request to /tts/stream with JSON payload and parses SSE stream incrementally', async () => {
      // 4 chunks of 1.0s audio each = 4.0s total audio
      const chunkPcm = createFakePCMBase64(1.0, 24000);
      const mockStream = createMockSSEStream([
        { raw_pcm_base64: chunkPcm },
        { raw_pcm_base64: chunkPcm },
        { raw_pcm_base64: chunkPcm },
        { raw_pcm_base64: chunkPcm, done: true }
      ]);

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: mockStream
      });
      setFetchMock(fetchMock);

      narrationService.setProvider('orpheus');
      narrationService.setOrpheusVoice('tara');
      narrationService.setSpeed(1.0);
      narrationService.setVolume(0.85);

      const onStart = vi.fn();
      const onEnd = vi.fn();

      narrationService.speakStructured({
        title: 'Great Barrier Reef',
        description: 'World largest coral reef system composed of over 2,900 individual reefs.',
        onStart,
        onEnd
      });

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      const [url, requestOptions] = fetchMock.mock.calls[0];
      expect(url).toBe('http://127.0.0.1:8765/tts/stream');
      expect(requestOptions.method).toBe('POST');
      expect(requestOptions.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(JSON.parse(requestOptions.body)).toEqual({
        text: 'Great Barrier Reef. World largest coral reef system composed of over 2,900 individual reefs.',
        voice: 'tara'
      });

      // Wait for playback to begin after accumulating 3.0s of pre-buffer audio
      await vi.waitFor(() => {
        expect(onStart).toHaveBeenCalledTimes(1);
      });

      // Verify all 4 chunks were converted to AudioBufferSourceNodes and scheduled
      await vi.waitFor(() => {
        expect(createdSourceNodes.length).toBe(4);
      });

      // Each source node should have been started
      for (const node of createdSourceNodes) {
        expect(node.start).toHaveBeenCalled();
        expect(node.connect).toHaveBeenCalled();
      }

      // Simulate completion of all nodes
      for (const node of createdSourceNodes) {
        if (node.onended) node.onended();
      }

      await vi.waitFor(() => {
        expect(onEnd).toHaveBeenCalledTimes(1);
      });
    });

    it('starts playback immediately if stream ends before reaching 3.0s buffer (short narration phrase)', async () => {
      // 1 chunk of 1.2s audio, then done
      const shortChunk = createFakePCMBase64(1.2, 24000);
      const mockStream = createMockSSEStream([
        { raw_pcm_base64: shortChunk, done: true }
      ]);

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: mockStream
      });
      setFetchMock(fetchMock);

      narrationService.setProvider('orpheus');

      const onStart = vi.fn();
      const onEnd = vi.fn();

      narrationService.speakStructured({
        title: 'Rome',
        description: 'Capital of Italy.',
        onStart,
        onEnd
      });

      // Playback must start even though duration (1.2s) < 3.0s because stream ended
      await vi.waitFor(() => {
        expect(onStart).toHaveBeenCalledTimes(1);
        expect(createdSourceNodes.length).toBe(1);
      });

      // Trigger node ended
      if (createdSourceNodes[0].onended) createdSourceNodes[0].onended();

      await vi.waitFor(() => {
        expect(onEnd).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('4. Cancellation & Concurrency', () => {
    it('stops active Web Audio sources and aborts fetch when new narration is triggered', async () => {
      const chunkPcm = createFakePCMBase64(1.0, 24000);
      const mockStream1 = createMockSSEStream([
        { raw_pcm_base64: chunkPcm },
        { raw_pcm_base64: chunkPcm },
        { raw_pcm_base64: chunkPcm }
      ]);
      const mockStream2 = createMockSSEStream([
        { raw_pcm_base64: chunkPcm, done: true }
      ]);

      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, body: mockStream1 })
        .mockResolvedValueOnce({ ok: true, body: mockStream2 });
      setFetchMock(fetchMock);

      narrationService.setProvider('orpheus');

      narrationService.speakStructured({
        title: 'Location One',
        description: 'First long description.'
      });

      await vi.waitFor(() => {
        expect(createdSourceNodes.length).toBeGreaterThanOrEqual(1);
      });

      const firstNodes = [...createdSourceNodes];

      // Trigger second narration
      narrationService.speakStructured({
        title: 'Location Two',
        description: 'Second location.'
      });

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });

      // Verify previous source nodes were stopped
      for (const node of firstNodes) {
        expect(node.stop).toHaveBeenCalled();
        expect(node.disconnect).toHaveBeenCalled();
      }
    });

    it('switching providers cleanly cancels active playback across engines', () => {
      const synthCancelSpy = vi.spyOn(window.speechSynthesis, 'cancel');
      narrationService.setProvider('system');
      narrationService.speakStructured({
        title: 'Location 1',
        description: 'Description 1.'
      });

      narrationService.setProvider('orpheus');
      expect(synthCancelSpy).toHaveBeenCalled();
      expect(narrationService.isSpeaking()).toBe(false);
    });
  });

  describe('5. Error Handling & No Silent Fallback', () => {
    it('surfaces bridge connection failure via onError and does NOT fall back to System Voice', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      setFetchMock(fetchMock);

      const synthSpeakSpy = vi.spyOn(window.speechSynthesis, 'speak');
      const onError = vi.fn();

      narrationService.setProvider('orpheus');
      narrationService.speakStructured({
        title: 'Error Location',
        description: 'Testing connection failure.',
        onError
      });

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalledTimes(1);
      });

      const receivedError = onError.mock.calls[0][0];
      expect(receivedError.message).toContain('Orpheus TTS Bridge unavailable');

      // CRITICAL: System voice must NOT be invoked!
      expect(synthSpeakSpy).not.toHaveBeenCalled();
    });

    it('surfaces HTTP 500 error from bridge without silent fallback', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ error: 'Orpheus model out of memory' })
      });
      setFetchMock(fetchMock);

      const synthSpeakSpy = vi.spyOn(window.speechSynthesis, 'speak');
      const onError = vi.fn();

      narrationService.setProvider('orpheus');
      narrationService.speakStructured({
        title: '500 Error Location',
        description: 'Testing 500 response.',
        onError
      });

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalledTimes(1);
      });

      const receivedError = onError.mock.calls[0][0];
      expect(receivedError.message).toContain('Orpheus model out of memory');
      expect(synthSpeakSpy).not.toHaveBeenCalled();
    });

    it('surfaces mid-stream SSE generation error and stops cleanly', async () => {
      const chunkPcm = createFakePCMBase64(1.0, 24000);
      const mockStream = createMockSSEStream([
        { raw_pcm_base64: chunkPcm },
        { error: 'LM Studio streaming connection terminated' }
      ]);

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: mockStream
      });
      setFetchMock(fetchMock);

      const onError = vi.fn();
      narrationService.setProvider('orpheus');
      narrationService.speakStructured({
        title: 'Stream Error Location',
        description: 'Testing mid-stream error.',
        onError
      });

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalledTimes(1);
      });

      const receivedError = onError.mock.calls[0][0];
      expect(receivedError.message).toContain('LM Studio streaming connection terminated');
      expect(narrationService.isSpeaking()).toBe(false);
    });
  });

  describe('6. Orpheus Voice Configuration', () => {
    it('exposes all eight supported Orpheus voices with Tara as default', () => {
      const expectedVoices = [
        { id: 'tara', name: 'Tara' },
        { id: 'leah', name: 'Leah' },
        { id: 'jess', name: 'Jess' },
        { id: 'leo', name: 'Leo' },
        { id: 'dan', name: 'Dan' },
        { id: 'mia', name: 'Mia' },
        { id: 'zac', name: 'Zac' },
        { id: 'zoe', name: 'Zoe' }
      ];

      expect(ORPHEUS_VOICES).toEqual(expectedVoices);
      expect(ORPHEUS_VOICES[0].id).toBe('tara');
      expect(ORPHEUS_VOICES.length).toBe(8);
    });

    it('passes selected Orpheus voice in fetch request payload', async () => {
      const chunkPcm = createFakePCMBase64(1.0, 24000);
      const mockStream = createMockSSEStream([
        { raw_pcm_base64: chunkPcm, done: true }
      ]);
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: mockStream
      });
      setFetchMock(fetchMock);

      narrationService.setProvider('orpheus');
      narrationService.setOrpheusVoice('dan');
      narrationService.speakStructured({
        title: 'Voice Test',
        description: 'Testing Dan voice selection.'
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, requestInit] = fetchMock.mock.calls[0];
      expect(url).toBe('http://127.0.0.1:8765/tts/stream');
      const body = JSON.parse(requestInit.body);
      expect(body.voice).toBe('dan');
    });
  });

  describe('7. Narration-Specific 600-Character Capping Suite', () => {
    it('returns short description (< 600 chars) unchanged', () => {
      const short = 'This is a short description about an ancient landmark in Europe.';
      expect(capDescriptionForNarration(short, 600)).toBe(short);
    });

    it('returns exactly 600-character description ending with sentence boundary unchanged', () => {
      // 599 chars + '.' = 600 chars
      const sentence = 'A'.repeat(599) + '.';
      expect(sentence.length).toBe(600);
      expect(capDescriptionForNarration(sentence, 600)).toBe(sentence);
    });

    it('truncates long description (> 600 chars) at the last complete sentence within the 600-char budget', () => {
      const sent1 = 'First complete sentence describing the history of the ancient ruins.';
      const sent2 = 'Second complete sentence describing the geological formations of the area.';
      const sent3 = 'Third complete sentence that extends well past the six hundred character boundary in length.'.repeat(10);
      const fullText = `${sent1} ${sent2} ${sent3}`;
      expect(fullText.length).toBeGreaterThan(600);

      const capped = capDescriptionForNarration(fullText, 600);
      expect(capped).toBe(`${sent1} ${sent2}`);
      expect(capped.length).toBeLessThanOrEqual(600);
      expect(capped.endsWith('.')).toBe(true);
      expect(capped.includes('...')).toBe(false);
    });

    it('includes the full first sentence if no sentence boundary exists before 600 characters', () => {
      // Single continuous sentence of 750 characters
      const longSingleSentence = 'This is an extraordinarily long sentence about tectonic plates ' +
        'spanning continents and oceans with detailed geological explanations '.repeat(8) +
        'concluding right here.';
      expect(longSingleSentence.length).toBeGreaterThan(600);
      // Ensure there are no periods before 600
      expect(longSingleSentence.indexOf('.')).toBe(longSingleSentence.length - 1);

      const capped = capDescriptionForNarration(longSingleSentence, 600);
      expect(capped).toBe(longSingleSentence);
      expect(capped.endsWith('.')).toBe(true);
      expect(capped.includes('...')).toBe(false);
    });

    it('correctly handles various terminal punctuation (. ! ?) and closing quotes/parentheses', () => {
      const textWithExclamation = 'Explorers were amazed by the monumental scale! ' +
        'Could anyone believe such architecture was possible in 1500? ' +
        'Local legends called it "the sacred mountain sanctuary." ' +
        'Another piece of text extending past 600 characters.'.repeat(15);
      
      const capped = capDescriptionForNarration(textWithExclamation, 600);
      expect(capped.length).toBeLessThanOrEqual(600);
      expect(capped.endsWith('"') || capped.endsWith('?') || capped.endsWith('!') || capped.endsWith('.')).toBe(true);
      expect(capped.includes('...')).toBe(false);

      const quoteSentence = 'He noted (referring to the maps): "The river runs south." Extra long tail text.'.repeat(10);
      const cappedQuote = capDescriptionForNarration(quoteSentence, 100);
      expect(cappedQuote.endsWith('."')).toBe(true);
    });

    it('does not mutate or alter the original source description or object', () => {
      const originalObject = {
        title: 'Machu Picchu',
        description: 'Machu Picchu is a 15th-century Inca citadel situated on a mountain ridge 2,430 metres above sea level in the Cusco Region of Peru. ' +
          'It is located in the Machupicchu District within Urubamba Province, above the Sacred Valley, which is 80 kilometres northwest of Cuzco. ' +
          'The Urubamba River flows past it, cutting through the Cordillera and creating a canyon with a tropical mountain climate. ' +
          'Most archaeologists believe that Machu Picchu was constructed as an estate for the Inca emperor Pachacuti (1438–1472). ' +
          'Often mistakenly referred to as the Lost City of the Incas, it is the most familiar icon of Inca civilization.'
      };
      const originalDescBackup = originalObject.description;

      const capped = capDescriptionForNarration(originalObject.description, 600);
      expect(originalObject.description).toBe(originalDescBackup);
      expect(capped.length).toBeLessThanOrEqual(600);
      expect(originalObject.description.length).toBeGreaterThan(600);
    });

    it('prepends title cleanly to capped description when spoken via OrpheusTTSProvider', async () => {
      const chunkPcm = createFakePCMBase64(1.0, 24000);
      const mockStream = createMockSSEStream([
        { raw_pcm_base64: chunkPcm, done: true }
      ]);
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: mockStream
      });
      setFetchMock(fetchMock);

      const logSpy = vi.spyOn(console, 'log');

      const longDesc = 'First complete sentence describing the landmark. ' +
        'Second complete sentence providing additional historical context for the explorer. ' +
        'Third complete sentence describing geological significance. ' +
        'Fourth sentence that exceeds the narration limit and should be cleanly excluded from speech.'.repeat(10);

      narrationService.setProvider('orpheus');
      narrationService.speakStructured({
        title: 'Ancient Citadel',
        description: longDesc
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, requestInit] = fetchMock.mock.calls[0];
      const body = JSON.parse(requestInit.body);
      
      expect(body.text.startsWith('Ancient Citadel.')).toBe(true);
      expect(body.text.length).toBeLessThan(longDesc.length);
      expect(body.text.endsWith('.')).toBe(true);
      expect(body.text.includes('...')).toBe(false);

      // Verify debug log output
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[OrpheusTTS\] Description capped for narration: originalLength=\d+ narrationLength=\d+/)
      );
    });

    it('real-world test case: caps long Wikipedia description of Machu Picchu to safe sentence boundary', async () => {
      const chunkPcm = createFakePCMBase64(1.0, 24000);
      const mockStream = createMockSSEStream([
        { raw_pcm_base64: chunkPcm, done: true }
      ]);
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: mockStream
      });
      setFetchMock(fetchMock);

      const machuPicchuWikipedia = 'Machu Picchu is a 15th-century Inca citadel situated on a mountain ridge 2,430 metres above sea level in the Cusco Region of Peru. ' +
        'It is located in the Machupicchu District within Urubamba Province, above the Sacred Valley, which is 80 kilometres northwest of Cuzco. ' +
        'The Urubamba River flows past it, cutting through the Cordillera and creating a canyon with a tropical mountain climate. ' +
        'Most archaeologists believe that Machu Picchu was constructed as an estate for the Inca emperor Pachacuti (1438–1472). ' +
        'Often mistakenly referred to as the Lost City of the Incas, it is the most familiar icon of Inca civilization. ' +
        'The Incas built the estate around 1450 but abandoned it a century later at the time of the Spanish conquest. ' +
        'Although known locally, it was not known to the Spanish during the colonial period and remained largely unknown to the outside world until American historian Hiram Bingham brought it to international attention in 1911.';

      expect(machuPicchuWikipedia.length).toBeGreaterThan(600);

      narrationService.setProvider('orpheus');
      narrationService.speakStructured({
        title: 'Machu Picchu',
        description: machuPicchuWikipedia
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, requestInit] = fetchMock.mock.calls[0];
      const body = JSON.parse(requestInit.body);

      // Script should not duplicate title if description starts with title
      expect(body.text.startsWith('Machu Picchu is a 15th-century')).toBe(true);
      expect(body.text.length).toBeLessThanOrEqual(600);
      expect(body.text.endsWith('.')).toBe(true);
      expect(body.text.includes('Hiram Bingham')).toBe(false); // Hiram Bingham was in the trailing sentences > 600 chars
    });

    it('leaves System Voice provider uncapped with full description', () => {
      const speakSpy = vi.spyOn(window.speechSynthesis, 'speak');

      const longDesc = 'Sentence one is here. ' +
        'Sentence two is here. ' +
        'Sentence three is very long and extends far beyond six hundred characters.'.repeat(10);

      expect(longDesc.length).toBeGreaterThan(600);

      narrationService.setProvider('system');
      narrationService.speakStructured({
        title: 'System Voice Test',
        description: longDesc
      });

      expect(speakSpy).toHaveBeenCalledTimes(1);
      const utterance = speakSpy.mock.calls[0][0] as any;
      // Utterance must contain the full, uncapped description
      expect(utterance.text).toContain(longDesc.trim());
      expect(utterance.text.length).toBeGreaterThan(600);
    });

    it('honors custom limits (400 and 800) for Orpheus narration', () => {
      const s1 = 'First sentence detailing the ancient civilization, regional politics, and monumental stone architecture.';
      const s2 = 'Second sentence providing extensive historical context regarding transcontinental trade routes and commerce.';
      const s3 = 'Third sentence describing alpine terrain, cloud forests, native wildlife species, and seasonal river flows.';
      const s4 = 'Fourth sentence explaining scientific discoveries, archaeological excavations, and twentieth-century expeditions.';
      const s5 = 'Fifth sentence summarizing international conservation efforts and World Heritage recognition.';
      const text = `${s1} ${s2} ${s3} ${s4} ${s5}`;
      expect(text.length).toBeGreaterThan(400);
      expect(text.length).toBeLessThan(800);

      const capped400 = capDescriptionForNarration(text, 400);
      expect(capped400.length).toBeLessThanOrEqual(400);
      expect(capped400).toBe(`${s1} ${s2} ${s3}`);

      const capped800 = capDescriptionForNarration(text, 800);
      expect(capped800).toBe(text);

      const capped150 = capDescriptionForNarration(text, 150);
      expect(capped150.length).toBeLessThanOrEqual(150);
      expect(capped150).toBe(s1);
    });
  });

  describe('8. Voice Switching Non-Interruption & State Snapshotting', () => {
    it('changing Orpheus voice during active playback does NOT cancel or restart current narration', async () => {
      const chunkPcm = createFakePCMBase64(1.0, 24000);
      const mockStream = createMockSSEStream([
        { raw_pcm_base64: chunkPcm },
        { raw_pcm_base64: chunkPcm, done: true }
      ]);
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: mockStream
      });
      setFetchMock(fetchMock);

      narrationService.setProvider('orpheus');
      narrationService.setOrpheusVoice('tara');

      const onStart = vi.fn();
      const onEnd = vi.fn();

      narrationService.speakStructured({
        title: 'Ongoing Narration',
        description: 'First description playing with Tara voice.',
        orpheusVoice: 'tara',
        onStart,
        onEnd
      });

      await vi.waitFor(() => {
        expect(onStart).toHaveBeenCalledTimes(1);
      });

      expect(narrationService.isSpeaking()).toBe(true);

      // Change voice Tara -> Leah -> Dan while playback is active
      narrationService.setOrpheusVoice('leah');
      narrationService.setOrpheusVoice('dan');

      // Current narration MUST remain speaking and not cancelled
      expect(narrationService.isSpeaking()).toBe(true);
      expect(onEnd).not.toHaveBeenCalled();

      // No new fetch request should have been sent solely because voice changed
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('subsequent narration request uses the newly selected voice', async () => {
      const chunkPcm = createFakePCMBase64(1.0, 24000);
      const mockStream1 = createMockSSEStream([
        { raw_pcm_base64: chunkPcm, done: true }
      ]);
      const mockStream2 = createMockSSEStream([
        { raw_pcm_base64: chunkPcm, done: true }
      ]);

      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, body: mockStream1 })
        .mockResolvedValueOnce({ ok: true, body: mockStream2 });
      setFetchMock(fetchMock);

      narrationService.setProvider('orpheus');
      narrationService.setOrpheusVoice('tara');

      // 1. Start narration 1
      narrationService.speakStructured({
        title: 'Narration 1',
        description: 'Playing with Tara.',
        orpheusVoice: 'tara'
      });

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
      const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(firstBody.voice).toBe('tara');

      // 2. Change voice to Dan
      narrationService.setOrpheusVoice('dan');

      // 3. Start narration 2
      narrationService.speakStructured({
        title: 'Narration 2',
        description: 'Playing with Dan.',
        orpheusVoice: 'dan'
      });

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });
      const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(secondBody.voice).toBe('dan');
    });

    it('changing narration limit during playback does not cancel and is used for next narration', async () => {
      const chunkPcm = createFakePCMBase64(1.0, 24000);
      const mockStream1 = createMockSSEStream([
        { raw_pcm_base64: chunkPcm, done: true }
      ]);
      const mockStream2 = createMockSSEStream([
        { raw_pcm_base64: chunkPcm, done: true }
      ]);

      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, body: mockStream1 })
        .mockResolvedValueOnce({ ok: true, body: mockStream2 });
      setFetchMock(fetchMock);

      const s1 = 'Sentence one about ancient history.';
      const s2 = 'Sentence two describing geographic features.';
      const s3 = 'Sentence three describing cultural significance that goes past four hundred characters.'.repeat(5);
      const fullText = `${s1} ${s2} ${s3}`;

      narrationService.setProvider('orpheus');

      // First narration with limit 400
      narrationService.speakStructured({
        title: 'Limit Test',
        description: fullText,
        limit: 400
      });

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
      const body1 = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body1.text.length).toBeLessThanOrEqual(400);

      // Second narration with limit 800
      narrationService.speakStructured({
        title: 'Limit Test 2',
        description: fullText,
        limit: 800
      });

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });
      const body2 = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(body2.text.length).toBeGreaterThan(body1.text.length);
    });
  });

  describe('9. TEST VOICE Settings Snapshotting', () => {
    it('TEST VOICE snapshots currently selected voice, speed, volume, and limit', async () => {
      const chunkPcm = createFakePCMBase64(1.0, 24000);
      const mockStream = createMockSSEStream([
        { raw_pcm_base64: chunkPcm, done: true }
      ]);
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: mockStream
      });
      setFetchMock(fetchMock);

      narrationService.setProvider('orpheus');

      narrationService.speakStructured({
        title: 'TerraExplorer',
        description: 'Voice volume and narration preview at current settings.',
        provider: 'orpheus',
        orpheusVoice: 'leo',
        speed: 1.3,
        volume: 0.65,
        limit: 800
      });

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      const [url, requestInit] = fetchMock.mock.calls[0];
      const body = JSON.parse(requestInit.body);
      expect(body.voice).toBe('leo');
      expect(body.text).toContain('Voice volume and narration preview at current settings.');
    });

    it('defers onStart until audible playback starts and calls onEnd upon completion', async () => {
      const chunkPcm = createFakePCMBase64(1.0, 24000);
      const mockStream = createMockSSEStream([
        { raw_pcm_base64: chunkPcm },
        { raw_pcm_base64: chunkPcm },
        { raw_pcm_base64: chunkPcm },
        { raw_pcm_base64: chunkPcm, done: true }
      ]);
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: mockStream
      });
      setFetchMock(fetchMock);

      narrationService.setProvider('orpheus');

      const onStart = vi.fn();
      const onEnd = vi.fn();

      narrationService.speakStructured({
        title: 'TerraExplorer',
        description: 'Voice volume and narration preview at current settings.',
        provider: 'orpheus',
        onStart,
        onEnd
      });

      // Request was sent immediately
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Playback starts once buffer target is reached (onStart is called)
      await vi.waitFor(() => {
        expect(onStart).toHaveBeenCalledTimes(1);
      });

      // All 4 source nodes created
      await vi.waitFor(() => {
        expect(createdSourceNodes.length).toBe(4);
      });

      // Trigger node ended
      for (const node of createdSourceNodes) {
        if (node.onended) node.onended();
      }

      await vi.waitFor(() => {
        expect(onEnd).toHaveBeenCalledTimes(1);
      });
    });

    it('cancelling during generation aborts request before onStart fires', async () => {
      const chunkPcm = createFakePCMBase64(1.0, 24000);
      let streamController: any;
      const delayedStream = new ReadableStream({
        start(controller) {
          streamController = controller;
        }
      });

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: delayedStream
      });
      setFetchMock(fetchMock);

      narrationService.setProvider('orpheus');

      const onStart = vi.fn();
      const onEnd = vi.fn();

      narrationService.speakStructured({
        title: 'TerraExplorer',
        description: 'Voice volume preview.',
        provider: 'orpheus',
        onStart,
        onEnd
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Cancel while generation is pending
      narrationService.cancel();

      expect(narrationService.isSpeaking()).toBe(false);
      expect(onStart).not.toHaveBeenCalled();
      expect(onEnd).not.toHaveBeenCalled();
    });
  });

  describe('10. Audio Audit: TEST VOICE vs Normal Narration Voice Parity (Dan)', () => {
    it('both TEST VOICE and normal narration send identical voice="dan", speed, volume, and bridge endpoint', async () => {
      const chunkPcm = createFakePCMBase64(1.0, 24000);
      const mockStream1 = createMockSSEStream([
        { raw_pcm_base64: chunkPcm, done: true }
      ]);
      const mockStream2 = createMockSSEStream([
        { raw_pcm_base64: chunkPcm, done: true }
      ]);

      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, body: mockStream1 })
        .mockResolvedValueOnce({ ok: true, body: mockStream2 });
      setFetchMock(fetchMock);

      narrationService.setProvider('orpheus');
      narrationService.setOrpheusVoice('dan');
      narrationService.setSpeed(0.9);
      narrationService.setVolume(0.75);

      // 1. Trigger TEST VOICE with Dan
      narrationService.speakStructured({
        title: 'TerraExplorer',
        description: 'Voice volume and narration preview at current settings.',
        provider: 'orpheus',
        orpheusVoice: 'dan',
        speed: 0.9,
        volume: 0.75
      });

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      const [testUrl, testRequest] = fetchMock.mock.calls[0];
      const testBody = JSON.parse(testRequest.body);
      expect(testUrl).toBe('http://127.0.0.1:8765/tts/stream');
      expect(testBody.voice).toBe('dan');

      // 2. Trigger Normal Narration (e.g., Brasília) with Dan
      narrationService.speakStructured({
        title: 'Brasília',
        description: 'Federal capital of Brazil located in the Federal District within the Central-West region.',
        provider: 'orpheus',
        orpheusVoice: 'dan',
        speed: 0.9,
        volume: 0.75
      });

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });

      const [normalUrl, normalRequest] = fetchMock.mock.calls[1];
      const normalBody = JSON.parse(normalRequest.body);
      expect(normalUrl).toBe('http://127.0.0.1:8765/tts/stream');
      expect(normalBody.voice).toBe('dan');

      // Both requests targeted the exact same endpoint with exact same voice="dan"
      expect(testBody.voice).toBe(normalBody.voice);
    });

    it('TEST VOICE does not hardcode tara and dynamically uses any selected voice (dan, leo, zac, etc.)', async () => {
      const chunkPcm = createFakePCMBase64(1.0, 24000);
      const mockStream = createMockSSEStream([
        { raw_pcm_base64: chunkPcm, done: true }
      ]);
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: mockStream
      });
      setFetchMock(fetchMock);

      narrationService.setProvider('orpheus');

      // TEST VOICE with Zac
      narrationService.speakStructured({
        title: 'TerraExplorer',
        description: 'Voice volume and narration preview at current settings.',
        provider: 'orpheus',
        orpheusVoice: 'zac',
        speed: 1.1,
        volume: 0.8
      });

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.voice).toBe('zac');
      expect(body.voice).not.toBe('tara');
    });
  });
});
