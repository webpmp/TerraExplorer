import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  narrationService,
  NarrationService,
  KokoroTTSProvider,
  KOKORO_VOICES,
  decodeBase64PCMToFloat32
} from '../narrationService';

function createFakeWavArrayBuffer(durationSeconds: number, sampleRate = 24000): ArrayBuffer {
  const numSamples = Math.floor(durationSeconds * sampleRate);
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF identifier 'RIFF'
  view.setUint32(0, 0x52494646, false);
  // file length minus RIFF identifier & length
  view.setUint32(4, 36 + dataSize, true);
  // 'WAVE'
  view.setUint32(8, 0x57415645, false);
  // 'fmt ' chunk
  view.setUint32(12, 0x666d7420, false);
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw PCM = 1)
  view.setUint16(20, 1, true);
  // channel count (1 = mono)
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // 'data' chunk
  view.setUint32(36, 0x64617461, false);
  // data chunk length
  view.setUint32(40, dataSize, true);

  // Write synthetic sine wave samples
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.round(Math.sin((i / sampleRate) * 440 * 2 * Math.PI) * 10000);
    view.setInt16(44 + i * 2, sample, true);
  }

  return buffer;
}

describe('Kokoro TTS Provider Integration Suite', () => {
  let createdSourceNodes: any[] = [];
  let mockAudioContextInstance: any;

  class MockAudioBuffer {
    public length: number;
    public sampleRate: number;
    public numberOfChannels: number;
    public channelData: Float32Array;
    public duration: number;

    constructor(numberOfChannels: number, length: number, sampleRate: number) {
      this.numberOfChannels = numberOfChannels;
      this.length = length;
      this.sampleRate = sampleRate;
      this.duration = length / sampleRate;
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
    public decodeAudioData = vi.fn(async (arrayBuffer: ArrayBuffer) => {
      const numSamples = Math.max(0, Math.floor((arrayBuffer.byteLength - 44) / 2));
      const buf = new MockAudioBuffer(1, numSamples, 24000);
      const pcmBytes = new Uint8Array(arrayBuffer, 44);
      const int16 = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, numSamples);
      for (let i = 0; i < int16.length; i++) {
        buf.channelData[i] = int16[i] / 32768.0;
      }
      return buf;
    });
    public resume = vi.fn().mockResolvedValue(undefined);
    public close = vi.fn().mockResolvedValue(undefined);

    constructor() {
      mockAudioContextInstance = this;
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    createdSourceNodes = [];

    narrationService.cancel();
    narrationService.setProvider('system');
    narrationService.setKokoroVoice('am_michael');
    narrationService.setVolume(1.0);
    narrationService.setSpeed(1.0);

    vi.stubGlobal('AudioContext', MockAudioContext);

    const mockSpeechSynthesis = {
      speaking: false,
      pending: false,
      paused: false,
      speak: vi.fn(),
      cancel: vi.fn(),
      resume: vi.fn(),
      getVoices: vi.fn(() => []),
      onvoiceschanged: null
    };

    vi.stubGlobal('speechSynthesis', mockSpeechSynthesis);
    vi.stubGlobal('window', {
      speechSynthesis: mockSpeechSynthesis,
      SpeechSynthesisUtterance: vi.fn(),
      AudioContext: MockAudioContext,
      fetch: vi.fn()
    });

    (globalThis as any).window = window;
    (globalThis as any).AudioContext = MockAudioContext;
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

  describe('1. Kokoro Provider & Voice Configuration', () => {
    it('defines KOKORO_VOICES with am_michael and bm_george and 4 fast female voices', () => {
      expect(KOKORO_VOICES).toEqual([
        { id: 'am_michael', name: 'Michael', accent: 'American' },
        { id: 'bm_george', name: 'George', accent: 'British' },
        { id: 'af_bella', name: 'Bella', accent: 'American' },
        { id: 'af_sarah', name: 'Sarah', accent: 'American' },
        { id: 'bf_emma', name: 'Emma', accent: 'British' },
        { id: 'bf_isabella', name: 'Isabella', accent: 'British' }
      ]);
      expect(narrationService.getKokoroVoice()).toBe('am_michael');
    });

    it('allows changing active Kokoro voice to bm_george', () => {
      narrationService.setKokoroVoice('bm_george');
      expect(narrationService.getKokoroVoice()).toBe('bm_george');
    });
  });

  describe('2. Single Complete Buffer Synthesis & Direct Web Audio Playback', () => {
    it('sends single HTTP POST to http://127.0.0.1:8880/tts with full script and plays directly', async () => {
      const fakeWav = createFakeWavArrayBuffer(2.5, 24000);
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(fakeWav)
      });
      setFetchMock(fetchMock);

      narrationService.setProvider('kokoro');
      narrationService.setKokoroVoice('am_michael');
      narrationService.setSpeed(1.0);
      narrationService.setVolume(0.9);

      const onStart = vi.fn();
      const onEnd = vi.fn();

      narrationService.speakStructured({
        title: 'Bodie',
        description: 'Bodie is a historic gold mining ghost town in Mono County, California.',
        onStart,
        onEnd
      });

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      const [url, requestOptions] = fetchMock.mock.calls[0];
      expect(url).toBe('http://127.0.0.1:8880/tts');
      expect(requestOptions.method).toBe('POST');
      expect(JSON.parse(requestOptions.body)).toEqual({
        text: 'Bodie. A historic gold mining ghost town in Mono County, California.',
        voice: 'am_michael',
        speed: 1.0
      });

      await vi.waitFor(() => {
        expect(onStart).toHaveBeenCalledTimes(1);
        expect(createdSourceNodes.length).toBe(1);
      });

      const node = createdSourceNodes[0];
      expect(node.start).toHaveBeenCalled();
      expect(node.connect).toHaveBeenCalled();

      // Simulate playback completion
      if (node.onended) node.onended();

      await vi.waitFor(() => {
        expect(onEnd).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('3. Silent Preloading & Instant Cached Playback', () => {
    it('preloads audio silently in the background without triggering playback or cancelling active audio', async () => {
      const fakeWav = createFakeWavArrayBuffer(3.0, 24000);
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(fakeWav)
      });
      setFetchMock(fetchMock);

      narrationService.setProvider('kokoro');

      const preloaded = await narrationService.preloadNarration(
        'Mono Lake',
        'Mono Lake is a majestic saline soda lake in Mono County.',
        { kokoroVoice: 'bm_george' }
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(preloaded).not.toBeNull();
      expect(preloaded?.duration).toBeCloseTo(3.0, 1);
      expect(preloaded?.sampleRate).toBe(24000);
      expect(preloaded?.voice).toBe('bm_george');

      // No audio source nodes created because it was silent preloading
      expect(createdSourceNodes.length).toBe(0);
      expect(narrationService.isSpeaking()).toBe(false);
    });

    it('plays preloaded cached audio immediately with zero generation delay via speakCached', async () => {
      const pcmData = new Float32Array(24000 * 2); // 2 seconds
      const cached = {
        pcmData,
        sampleRate: 24000,
        duration: 2.0
      };

      narrationService.setProvider('kokoro');
      const onStart = vi.fn();
      const onEnd = vi.fn();

      narrationService.speakCached(cached, {
        title: 'Mono Lake',
        description: 'Preloaded description.',
        onStart,
        onEnd
      });

      expect(createdSourceNodes.length).toBe(1);
      expect(createdSourceNodes[0].start).toHaveBeenCalled();
      expect(onStart).toHaveBeenCalledTimes(1);
      expect(narrationService.isSpeaking()).toBe(true);

      createdSourceNodes[0].onended();
      expect(onEnd).toHaveBeenCalledTimes(1);
      expect(narrationService.isSpeaking()).toBe(false);
    });
  });

  describe('4. Cancellation & Stale Protection', () => {
    it('aborts in-flight request and stops active audio nodes when cancelled', async () => {
      const fakeWav = createFakeWavArrayBuffer(2.0, 24000);
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(fakeWav)
      });
      setFetchMock(fetchMock);

      narrationService.setProvider('kokoro');
      narrationService.speakStructured({
        title: 'First Waypoint',
        description: 'First location narration.'
      });

      await vi.waitFor(() => {
        expect(createdSourceNodes.length).toBe(1);
      });

      const firstNode = createdSourceNodes[0];
      narrationService.cancel();

      expect(firstNode.stop).toHaveBeenCalled();
      expect(firstNode.disconnect).toHaveBeenCalled();
      expect(narrationService.isSpeaking()).toBe(false);
    });
  });

  describe('5. Error Handling & No Silent Fallback', () => {
    it('surfaces service failure cleanly and does NOT fall back to System Voice', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      setFetchMock(fetchMock);

      const synthSpeakSpy = vi.spyOn(window.speechSynthesis, 'speak');
      const onError = vi.fn();

      narrationService.setProvider('kokoro');
      narrationService.speakStructured({
        title: 'Service Error Test',
        description: 'Testing connection failure when Kokoro service is down.',
        onError
      });

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalledTimes(1);
      });

      const err = onError.mock.calls[0][0];
      expect(err.message).toContain('Kokoro TTS Service unavailable');
      expect(synthSpeakSpy).not.toHaveBeenCalled();
    });
  });
});
