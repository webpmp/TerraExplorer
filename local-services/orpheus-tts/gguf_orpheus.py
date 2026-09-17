import os
import sys
import requests
import json
import time
import wave
import numpy as np
import sounddevice as sd
import argparse
import threading
import queue
import asyncio

import io

# LM Studio API settings
LM_STUDIO_URL = os.environ.get("LM_STUDIO_URL", "http://127.0.0.1:1234").rstrip("/")
API_URL = f"{LM_STUDIO_URL}/v1/completions"
ORPHEUS_MODEL = os.environ.get("ORPHEUS_MODEL", "orpheus-3b-0.1-ft")
HEADERS = {
    "Content-Type": "application/json"
}

# Model parameters
MAX_TOKENS = int(os.environ.get("MAX_TOKENS", "8192"))
TEMPERATURE = 0.6
TOP_P = 0.9
REPETITION_PENALTY = 1.1
SAMPLE_RATE = 24000  # SNAC model uses 24kHz

# Available voices based on the Orpheus-TTS repository
AVAILABLE_VOICES = ["tara", "leah", "jess", "leo", "dan", "mia", "zac", "zoe"]
DEFAULT_VOICE = "tara"  # Best voice according to documentation

# Special token IDs for Orpheus model
START_TOKEN_ID = 128259
END_TOKEN_IDS = [128009, 128260, 128261, 128257]
CUSTOM_TOKEN_PREFIX = "<custom_token_"

def format_prompt(prompt, voice=DEFAULT_VOICE):
    """Format prompt for Orpheus model with voice prefix and special tokens."""
    if voice not in AVAILABLE_VOICES:
        print(f"Warning: Voice '{voice}' not recognized. Using '{DEFAULT_VOICE}' instead.")
        voice = DEFAULT_VOICE
        
    # Format similar to how engine_class.py does it with special tokens
    formatted_prompt = f"{voice}: {prompt}"
    
    # Add special token markers for the LM Studio API
    special_start = "<|audio|>"  # Using the additional_special_token from config
    special_end = "<|eot_id|>"   # Using the eos_token from config
    
    return f"{special_start}{formatted_prompt}{special_end}"

def generate_tokens_from_api(prompt, voice=DEFAULT_VOICE, temperature=TEMPERATURE, 
                            top_p=TOP_P, max_tokens=MAX_TOKENS, repetition_penalty=REPETITION_PENALTY,
                            api_url=None, model=None, stop_event=None, stats_callback=None):
    """Generate tokens from text using LM Studio API with cancellation and stats reporting."""
    formatted_prompt = format_prompt(prompt, voice)
    print(f"Generating speech for text length {len(prompt)} (max_tokens={max_tokens}): {formatted_prompt[:80]}...")
    
    target_api_url = api_url or API_URL
    target_model = model or ORPHEUS_MODEL

    # Create the request payload for the LM Studio API
    payload = {
        "model": target_model,
        "prompt": formatted_prompt,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "top_p": top_p,
        "repeat_penalty": repetition_penalty,
        "stream": True
    }
    
    # Make the API request with streaming
    try:
        response = requests.post(target_api_url, headers=HEADERS, json=payload, stream=True, timeout=30)
    except requests.exceptions.RequestException as e:
        print(f"Error connecting to LM Studio API: {e}")
        raise ConnectionError(f"Could not connect to LM Studio at {target_api_url}: {e}") from e
    
    if response.status_code != 200:
        error_msg = f"API request failed with status code {response.status_code}: {response.text}"
        print(f"Error: {error_msg}")
        raise RuntimeError(error_msg)
    
    # Process the streamed response
    token_counter = 0
    finish_reason = None
    first_token_time = None
    t0 = time.perf_counter()
    try:
        for line in response.iter_lines():
            if stop_event and stop_event.is_set():
                print("Token generation cancelled by client disconnect.")
                break
            if line:
                line = line.decode('utf-8')
                if line.startswith('data: '):
                    data_str = line[6:]  # Remove the 'data: ' prefix
                    if data_str.strip() == '[DONE]':
                        break
                        
                    try:
                        data = json.loads(data_str)
                        if 'choices' in data and len(data['choices']) > 0:
                            choice = data['choices'][0]
                            token_text = choice.get('text', '')
                            if choice.get('finish_reason'):
                                finish_reason = choice.get('finish_reason')
                            token_counter += 1
                            if first_token_time is None:
                                first_token_time = time.perf_counter() - t0
                            if token_text:
                                yield token_text
                    except json.JSONDecodeError as e:
                        print(f"Error decoding JSON: {e}")
                        continue
    finally:
        response.close()
    
    print(f"Token generation complete: {token_counter} tokens generated (finish_reason={finish_reason})")
    if stats_callback:
        stats_callback({
            "total_tokens": token_counter,
            "finish_reason": finish_reason,
            "ttft": first_token_time or 0.0
        })

def turn_token_into_id(token_string, index):
    """Convert token string to numeric ID for audio processing."""
    # Strip whitespace
    token_string = token_string.strip()
    
    # Find the last token in the string
    last_token_start = token_string.rfind(CUSTOM_TOKEN_PREFIX)
    
    if last_token_start == -1:
        return None
    
    # Extract the last token
    last_token = token_string[last_token_start:]
    
    # Process the last token
    if last_token.startswith(CUSTOM_TOKEN_PREFIX) and last_token.endswith(">"):
        try:
            number_str = last_token[14:-1]
            token_id = int(number_str) - 10 - ((index % 7) * 4096)
            return token_id
        except ValueError:
            return None
    else:
        return None

def convert_to_audio(multiframe, count):
    """Convert token frames to audio."""
    # Import here to avoid circular imports
    from decoder import convert_to_audio as orpheus_convert_to_audio
    return orpheus_convert_to_audio(multiframe, count)

async def tokens_decoder(token_gen, stop_event=None):
    """Asynchronous token decoder that converts token stream to audio stream."""
    buffer = []
    count = 0
    async for token_text in token_gen:
        if stop_event and stop_event.is_set():
            break
        token = turn_token_into_id(token_text, count)
        if token is not None and token > 0:
            buffer.append(token)
            count += 1
            
            # Convert to audio when we have enough tokens
            if count % 7 == 0 and count > 27:
                buffer_to_proc = buffer[-28:]
                audio_samples = convert_to_audio(buffer_to_proc, count)
                if audio_samples is not None:
                    yield audio_samples

def create_wav_chunk(raw_pcm_bytes: bytes, sample_rate: int = SAMPLE_RATE) -> bytes:
    """Wrap raw 16-bit mono PCM bytes into a standalone playable WAV file chunk in memory."""
    wav_io = io.BytesIO()
    with wave.open(wav_io, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(raw_pcm_bytes)
    return wav_io.getvalue()

def generate_speech_chunks(prompt, voice=DEFAULT_VOICE, temperature=TEMPERATURE,
                           top_p=TOP_P, max_tokens=MAX_TOKENS, repetition_penalty=REPETITION_PENALTY,
                           api_url=None, model=None, stop_event=None,
                           target_chunk_seconds=1.5):
    """
    Generator yielding audio chunks progressively as they are synthesized.
    Yields dicts with:
      {
        'type': 'chunk',
        'index': int,
        'pcm_bytes': bytes,
        'wav_bytes': bytes,
        'duration': float,
        'total_duration': float,
        'is_first': bool
      }
      and finally:
      {
        'type': 'done',
        'total_chunks': int,
        'total_duration': float,
        'total_tokens': int,
        'finish_reason': str,
        'ttft': float
      }
    """
    stats_data = {}
    def on_stats(s):
        stats_data.update(s)

    token_gen = generate_tokens_from_api(
        prompt=prompt,
        voice=voice,
        temperature=temperature,
        top_p=top_p,
        max_tokens=max_tokens,
        repetition_penalty=repetition_penalty,
        api_url=api_url,
        model=model,
        stop_event=stop_event,
        stats_callback=on_stats
    )

    audio_queue = queue.Queue()

    async def async_token_gen():
        for token in token_gen:
            if stop_event and stop_event.is_set():
                break
            yield token

    async def async_producer():
        try:
            async for audio_chunk in tokens_decoder(async_token_gen(), stop_event=stop_event):
                if stop_event and stop_event.is_set():
                    break
                audio_queue.put(audio_chunk)
        finally:
            audio_queue.put(None)  # Sentinel

    def run_async():
        asyncio.run(async_producer())

    thread = threading.Thread(target=run_async)
    thread.daemon = True
    thread.start()

    chunk_index = 0
    accumulated_pcm = bytearray()
    accumulated_samples = 0
    # ~1.5s of 24kHz 16-bit mono = 36000 samples = 72000 bytes
    min_samples_per_chunk = int(SAMPLE_RATE * target_chunk_seconds)
    total_samples = 0

    while True:
        if stop_event and stop_event.is_set():
            break
        try:
            segment = audio_queue.get(timeout=0.1)
        except queue.Empty:
            continue

        if segment is None:
            # End of stream: flush any remaining accumulated audio
            if accumulated_samples > 0:
                pcm_bytes = bytes(accumulated_pcm)
                chunk_duration = accumulated_samples / SAMPLE_RATE
                total_samples += accumulated_samples
                wav_bytes = create_wav_chunk(pcm_bytes, SAMPLE_RATE)
                yield {
                    "type": "chunk",
                    "index": chunk_index,
                    "pcm_bytes": pcm_bytes,
                    "wav_bytes": wav_bytes,
                    "duration": chunk_duration,
                    "total_duration": total_samples / SAMPLE_RATE,
                    "is_first": (chunk_index == 0)
                }
                chunk_index += 1
            break

        accumulated_pcm.extend(segment)
        accumulated_samples += (len(segment) // 2)

        # For the very first chunk, emit earlier (~0.8-1.0s) for rapid TTFB if available, else target_chunk_seconds
        first_chunk_threshold = int(SAMPLE_RATE * 0.8)
        current_threshold = first_chunk_threshold if chunk_index == 0 else min_samples_per_chunk

        if accumulated_samples >= current_threshold:
            pcm_bytes = bytes(accumulated_pcm)
            chunk_duration = accumulated_samples / SAMPLE_RATE
            total_samples += accumulated_samples
            wav_bytes = create_wav_chunk(pcm_bytes, SAMPLE_RATE)
            yield {
                "type": "chunk",
                "index": chunk_index,
                "pcm_bytes": pcm_bytes,
                "wav_bytes": wav_bytes,
                "duration": chunk_duration,
                "total_duration": total_samples / SAMPLE_RATE,
                "is_first": (chunk_index == 0)
            }
            chunk_index += 1
            accumulated_pcm.clear()
            accumulated_samples = 0

    thread.join(timeout=2.0)

    yield {
        "type": "done",
        "total_chunks": chunk_index,
        "total_duration": total_samples / SAMPLE_RATE,
        "total_tokens": stats_data.get("total_tokens", 0),
        "finish_reason": stats_data.get("finish_reason", "stop"),
        "ttft": stats_data.get("ttft", 0.0)
    }

def tokens_decoder_to_bytes(syn_token_gen):
    """Synchronous wrapper that returns generated audio as complete WAV file bytes in memory."""
    audio_queue = queue.Queue()
    audio_segments = []
    
    # Convert the synchronous token generator into an async generator
    async def async_token_gen():
        for token in syn_token_gen:
            yield token

    async def async_producer():
        async for audio_chunk in tokens_decoder(async_token_gen()):
            audio_queue.put(audio_chunk)
        audio_queue.put(None)  # Sentinel to indicate completion

    def run_async():
        asyncio.run(async_producer())

    thread = threading.Thread(target=run_async)
    thread.start()

    while True:
        audio = audio_queue.get()
        if audio is None:
            break
        audio_segments.append(audio)
    
    thread.join()
    
    duration = sum([len(segment) // (2 * 1) for segment in audio_segments]) / SAMPLE_RATE
    print(f"Generated {len(audio_segments)} audio segments ({duration:.2f} seconds of audio)")
    
    # Package into in-memory WAV bytes
    wav_io = io.BytesIO()
    with wave.open(wav_io, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(SAMPLE_RATE)
        for segment in audio_segments:
            wav_file.writeframes(segment)
    
    return wav_io.getvalue()

def generate_speech_bytes(prompt, voice=DEFAULT_VOICE, temperature=TEMPERATURE, 
                          top_p=TOP_P, max_tokens=MAX_TOKENS, repetition_penalty=REPETITION_PENALTY,
                          api_url=None, model=None):
    """Generate speech from text and return WAV bytes in-memory (no playback, no disk persistence)."""
    return tokens_decoder_to_bytes(
        generate_tokens_from_api(
            prompt=prompt, 
            voice=voice,
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
            repetition_penalty=repetition_penalty,
            api_url=api_url,
            model=model
        )
    )

def tokens_decoder_sync(syn_token_gen, output_file=None):
    """Synchronous wrapper for the asynchronous token decoder."""
    audio_queue = queue.Queue()
    audio_segments = []
    
    # If output_file is provided, prepare WAV file
    wav_file = None
    if output_file:
        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)
        wav_file = wave.open(output_file, "wb")
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(SAMPLE_RATE)
    
    # Convert the synchronous token generator into an async generator
    async def async_token_gen():
        for token in syn_token_gen:
            yield token

    async def async_producer():
        async for audio_chunk in tokens_decoder(async_token_gen()):
            audio_queue.put(audio_chunk)
        audio_queue.put(None)  # Sentinel to indicate completion

    def run_async():
        asyncio.run(async_producer())

    # Start the async producer in a separate thread
    thread = threading.Thread(target=run_async)
    thread.start()

    # Process audio as it becomes available
    while True:
        audio = audio_queue.get()
        if audio is None:
            break
        
        audio_segments.append(audio)
        
        # Write to WAV file if provided
        if wav_file:
            wav_file.writeframes(audio)
    
    # Close WAV file if opened
    if wav_file:
        wav_file.close()
    
    thread.join()
    
    # Calculate and print duration
    duration = sum([len(segment) // (2 * 1) for segment in audio_segments]) / SAMPLE_RATE
    print(f"Generated {len(audio_segments)} audio segments")
    print(f"Generated {duration:.2f} seconds of audio")
    
    return audio_segments

def stream_audio(audio_buffer):
    """Stream audio buffer to output device."""
    if audio_buffer is None or len(audio_buffer) == 0:
        return
    
    # Convert bytes to NumPy array (16-bit PCM)
    audio_data = np.frombuffer(audio_buffer, dtype=np.int16)
    
    # Normalize to float in range [-1, 1] for playback
    audio_float = audio_data.astype(np.float32) / 32767.0
    
    # Play the audio
    sd.play(audio_float, SAMPLE_RATE)
    sd.wait()

def generate_speech_from_api(prompt, voice=DEFAULT_VOICE, output_file=None, temperature=TEMPERATURE, 
                     top_p=TOP_P, max_tokens=MAX_TOKENS, repetition_penalty=REPETITION_PENALTY,
                     api_url=None, model=None):
    """Generate speech from text using Orpheus model via LM Studio API."""
    return tokens_decoder_sync(
        generate_tokens_from_api(
            prompt=prompt, 
            voice=voice,
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
            repetition_penalty=repetition_penalty,
            api_url=api_url,
            model=model
        ),
        output_file=output_file
    )

def list_available_voices():
    """List all available voices with the recommended one marked."""
    print("Available voices (in order of conversational realism):")
    for i, voice in enumerate(AVAILABLE_VOICES):
        marker = "★" if voice == DEFAULT_VOICE else " "
        print(f"{marker} {voice}")
    print(f"\nDefault voice: {DEFAULT_VOICE}")
    
    print("\nAvailable emotion tags:")
    print("<laugh>, <chuckle>, <sigh>, <cough>, <sniffle>, <groan>, <yawn>, <gasp>")

def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="Orpheus Text-to-Speech using LM Studio API")
    parser.add_argument("--text", type=str, help="Text to convert to speech")
    parser.add_argument("--voice", type=str, default=DEFAULT_VOICE, help=f"Voice to use (default: {DEFAULT_VOICE})")
    parser.add_argument("--output", type=str, help="Output WAV file path")
    parser.add_argument("--list-voices", action="store_true", help="List available voices")
    parser.add_argument("--temperature", type=float, default=TEMPERATURE, help="Temperature for generation")
    parser.add_argument("--top_p", type=float, default=TOP_P, help="Top-p sampling parameter")
    parser.add_argument("--repetition_penalty", type=float, default=REPETITION_PENALTY, 
                       help="Repetition penalty (>=1.1 required for stable generation)")
    
    args = parser.parse_args()
    
    if args.list_voices:
        list_available_voices()
        return
    
    # Use text from command line or prompt user
    prompt = args.text
    if not prompt:
        if len(sys.argv) > 1 and sys.argv[1] not in ("--voice", "--output", "--temperature", "--top_p", "--repetition_penalty"):
            prompt = " ".join([arg for arg in sys.argv[1:] if not arg.startswith("--")])
        else:
            prompt = input("Enter text to synthesize: ")
            if not prompt:
                prompt = "Hello, I am Orpheus, an AI assistant with emotional speech capabilities."
    
    # Default output file if none provided
    output_file = args.output
    if not output_file:
        # Create outputs directory if it doesn't exist
        os.makedirs("outputs", exist_ok=True)
        # Generate a filename based on the voice and a timestamp
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        output_file = f"outputs/{args.voice}_{timestamp}.wav"
        print(f"No output file specified. Saving to {output_file}")
    
    # Generate speech
    start_time = time.time()
    audio_segments = generate_speech_from_api(
        prompt=prompt,
        voice=args.voice,
        temperature=args.temperature,
        top_p=args.top_p,
        repetition_penalty=args.repetition_penalty,
        output_file=output_file
    )
    end_time = time.time()
    
    print(f"Speech generation completed in {end_time - start_time:.2f} seconds")
    print(f"Audio saved to {output_file}")

if __name__ == "__main__":
    main() 