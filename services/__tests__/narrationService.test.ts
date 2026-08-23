import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NarrationService, narrationService } from '../narrationService';

describe('NarrationService Suite', () => {
  let mockSpeak: ReturnType<typeof vi.fn>;
  let mockCancel: ReturnType<typeof vi.fn>;
  let mockGetVoices: ReturnType<typeof vi.fn>;

  const originalWindow = global.window;

  beforeEach(() => {
    mockSpeak = vi.fn();
    mockCancel = vi.fn();
    mockGetVoices = vi.fn().mockReturnValue([
      { name: 'Alex', lang: 'en-US', voiceURI: 'com.apple.speech.synthesis.voice.Alex', default: true },
      { name: 'Samantha', lang: 'en-US', voiceURI: 'com.apple.speech.synthesis.voice.Samantha', default: false }
    ]);

    // Mock window.speechSynthesis
    (global as any).window = {
      speechSynthesis: {
        speak: mockSpeak,
        cancel: mockCancel,
        getVoices: mockGetVoices,
        onvoiceschanged: null
      }
    };

    (global as any).SpeechSynthesisUtterance = vi.fn().mockImplementation(function (this: any, text: string) {
      this.text = text;
      this.rate = 1;
      this.volume = 1;
      this.voice = null;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. isSupported returns true when speechSynthesis is available', () => {
    const service = NarrationService.getInstance();
    expect(service.isSupported()).toBe(true);
  });

  it('2. cleanNarrationText removes markdown formatting, brackets, URLs, and coordinates', () => {
    const service = NarrationService.getInstance();

    const raw = `### Overview: Grytviken [1]
Grytviken is a historic settlement located at 54.2811, -36.5092 on the island of South Georgia.
* Founded in 1904 by C.A. Larsen [citation needed].
* For more info, visit https://en.wikipedia.org/wiki/Grytviken.
It was a major **whaling station** in the *Southern Ocean* <p>era</p>.`;

    const cleaned = service.cleanNarrationText(raw);

    expect(cleaned).not.toContain('###');
    expect(cleaned).not.toContain('[1]');
    expect(cleaned).not.toContain('[citation needed]');
    expect(cleaned).not.toContain('https://');
    expect(cleaned).not.toContain('54.2811');
    expect(cleaned).not.toContain('**');
    expect(cleaned).not.toContain('*');
    expect(cleaned).not.toContain('<p>');
    expect(cleaned).not.toContain('Overview:');
    expect(cleaned).toContain('Grytviken is a historic settlement');
    expect(cleaned).toContain('whaling station in the Southern Ocean era');
  });

  it('3. buildNarrationScript combines title and description nicely', () => {
    const service = NarrationService.getInstance();

    // Normal combination
    const script1 = service.buildNarrationScript(
      'Grytviken',
      'Grytviken was the first whaling station established in Antarctica.'
    );
    expect(script1).toBe('Grytviken was the first whaling station established in Antarctica.');

    // Separate title and distinct description
    const script2 = service.buildNarrationScript(
      'Mount Fuji',
      'An active stratovolcano and the highest peak in Japan.'
    );
    expect(script2).toBe('Mount Fuji. An active stratovolcano and the highest peak in Japan.');
  });

  it('4. speak configures speed, volume, voiceURI and cancels previous speech', () => {
    const service = NarrationService.getInstance();
    const onStart = vi.fn();

    service.speak({
      title: 'Serengeti',
      description: 'A vast ecosystem in east-central Africa.',
      voiceURI: 'com.apple.speech.synthesis.voice.Samantha',
      speed: 0.9,
      volume: 0.8,
      onStart
    });

    expect(mockCancel).toHaveBeenCalled();
    expect(mockSpeak).toHaveBeenCalled();

    const utterance = mockSpeak.mock.calls[0][0];
    expect(utterance.text).toBe('Serengeti. A vast ecosystem in east-central Africa.');
    expect(utterance.rate).toBe(0.9);
    expect(utterance.volume).toBe(0.8);
    expect(utterance.voice?.voiceURI).toBe('com.apple.speech.synthesis.voice.Samantha');

    utterance.onstart();
    expect(onStart).toHaveBeenCalled();
  });

  it('5. cancel stops active speech and resets state', () => {
    const service = NarrationService.getInstance();
    service.cancel();
    expect(mockCancel).toHaveBeenCalled();
  });

  it('6. onVoicesChanged subscribes to voice list updates', () => {
    const service = NarrationService.getInstance();
    const listener = vi.fn();
    const unsubscribe = service.onVoicesChanged(listener);

    expect(listener).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Alex' }),
        expect.objectContaining({ name: 'Samantha' })
      ])
    );

    unsubscribe();
  });

  it('7. speakStructured includes both title and description in utterance and refuses to speak title alone', () => {
    const service = NarrationService.getInstance();

    // Attempt to speak with empty description -> Must NOT speak
    service.speakStructured({
      title: 'Grand Canyon',
      description: ''
    });
    expect(mockSpeak).not.toHaveBeenCalled();

    // Provide both title and description -> Speaks combined text
    service.speakStructured({
      title: 'Grand Canyon',
      description: 'A vast canyon carved by the Colorado River in Arizona.'
    });

    expect(mockSpeak).toHaveBeenCalledTimes(1);
    const spokenText = mockSpeak.mock.calls[0][0].text;
    expect(spokenText).toContain('Grand Canyon');
    expect(spokenText).toContain('A vast canyon carved by the Colorado River');
  });
});
