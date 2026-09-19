import os
import json
import threading
import time
import io
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import mlx.core as mx
from mlx_audio.tts.utils import load_model
from mlx_audio.tts.generate import audio_write

PORT = int(os.environ.get("KOKORO_PORT", os.environ.get("BRIDGE_PORT", "8880")))
HOST = os.environ.get("KOKORO_HOST", os.environ.get("BRIDGE_HOST", "127.0.0.1"))
MODEL_ID = os.environ.get("KOKORO_MODEL", "mlx-community/Kokoro-82M-bf16")

AVAILABLE_VOICES = [
    "am_michael",
    "bm_george",
    "af_bella",
    "af_sarah",
    "bf_emma",
    "bf_isabella",
]
DEFAULT_VOICE = "am_michael"

# Threading lock to enforce serial synthesis across requests
GENERATION_LOCK = threading.Lock()

# Global model instance loaded once at startup
GLOBAL_MODEL = None


def is_allowed_origin(origin: str) -> bool:
    """Check if origin is a local dev origin for TerraExplorer or localhost."""
    if not origin:
        return False
    origin = origin.lower().strip()
    if origin == "null":
        return True
    if origin.startswith("http://localhost:") or origin == "http://localhost":
        return True
    if origin.startswith("http://127.0.0.1:") or origin == "http://127.0.0.1":
        return True
    if origin.startswith("http://[::1]:") or origin == "http://[::1]":
        return True
    return False


def get_model():
    global GLOBAL_MODEL
    if GLOBAL_MODEL is None:
        print(f"[Kokoro TTS] Loading model '{MODEL_ID}'...")
        t0 = time.perf_counter()
        GLOBAL_MODEL = load_model(MODEL_ID)
        t1 = time.perf_counter()
        print(f"[Kokoro TTS] Model loaded in {t1 - t0:.2f}s")

        # Warm up pipeline with a short dummy text
        print("[Kokoro TTS] Warming up pipeline...")
        tw0 = time.perf_counter()
        try:
            _ = list(GLOBAL_MODEL.generate(
                text="Warmup.",
                voice=DEFAULT_VOICE,
                speed=1.0,
                lang_code="en",
                verbose=False
            ))
            tw1 = time.perf_counter()
            print(f"[Kokoro TTS] Pipeline warmed up in {tw1 - tw0:.2f}s")
        except Exception as e:
            print(f"[Kokoro TTS] Warmup note: {e}")
    return GLOBAL_MODEL


class KokoroHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send_cors_headers(self):
        origin = self.headers.get("Origin", "")
        if is_allowed_origin(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        else:
            self.send_header("Access-Control-Allow-Origin", f"http://{HOST}:{PORT}")

        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept")

    def _send_json_response(self, status_code: int, data: dict):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        norm_path = self.path.split("?")[0].rstrip("/")
        if norm_path == "/health" or norm_path == "":
            model_loaded = GLOBAL_MODEL is not None
            response_data = {
                "status": "ok",
                "service": "kokoro-tts-service",
                "model": MODEL_ID,
                "model_loaded": model_loaded,
                "supported_voices": AVAILABLE_VOICES,
                "default_voice": DEFAULT_VOICE,
                "endpoints": ["/health", "/tts"]
            }
            self._send_json_response(200, response_data)
        else:
            self._send_json_response(404, {"error": f"Endpoint not found: {self.path}"})

    def do_POST(self):
        norm_path = self.path.split("?")[0].rstrip("/")
        if norm_path == "/tts":
            self.handle_tts()
        else:
            self._send_json_response(404, {"error": f"Endpoint not found: {self.path}"})

    def handle_tts(self):
        content_length_header = self.headers.get("Content-Length")
        if not content_length_header:
            self._send_json_response(400, {"error": "Missing Content-Length header."})
            return

        try:
            content_length = int(content_length_header)
            raw_body = self.rfile.read(content_length)
            payload = json.loads(raw_body.decode("utf-8"))
        except (ValueError, json.JSONDecodeError) as e:
            self._send_json_response(400, {"error": f"Invalid JSON payload: {e}"})
            return

        if not isinstance(payload, dict):
            self._send_json_response(400, {"error": "Request body must be a JSON object."})
            return

        text = payload.get("text")
        if not text or not isinstance(text, str) or not text.strip():
            self._send_json_response(400, {"error": "Field 'text' must contain non-empty text."})
            return

        text = text.strip()
        voice = payload.get("voice", DEFAULT_VOICE)
        if not voice or not isinstance(voice, str) or not voice.strip():
            voice = DEFAULT_VOICE
        voice = voice.lower().strip()

        if voice not in AVAILABLE_VOICES:
            self._send_json_response(
                400,
                {
                    "error": f"Unsupported voice '{voice}'. Supported voices: {', '.join(AVAILABLE_VOICES)}",
                    "supported_voices": AVAILABLE_VOICES,
                },
            )
            return

        speed = payload.get("speed", 1.0)
        try:
            speed = float(speed)
            speed = max(0.5, min(2.0, speed))
        except (ValueError, TypeError):
            speed = 1.0

        t_req_start = time.perf_counter()
        req_timestamp = self.log_date_time_string()
        print(f"[{req_timestamp}] [Kokoro TTS] Request received: voice={voice}, speed={speed}, chars={len(text)}")

        acquired = GENERATION_LOCK.acquire(blocking=True)
        try:
            model = get_model()
            t_gen_start = time.perf_counter()
            results = list(model.generate(
                text=text,
                voice=voice,
                speed=speed,
                lang_code="en",
                verbose=False
            ))
            if not results:
                self._send_json_response(500, {"error": "Kokoro generation produced no audio."})
                return

            audio = mx.concatenate([r.audio for r in results], axis=0) if len(results) > 1 else results[0].audio
            sample_rate = results[0].sample_rate
            t_gen_end = time.perf_counter()

            # Encode into in-memory WAV buffer
            wav_io = io.BytesIO()
            audio_write(wav_io, audio, sample_rate, format="wav")
            wav_bytes = wav_io.getvalue()

            gen_elapsed = t_gen_end - t_gen_start
            audio_duration = len(audio) / float(sample_rate)
            rtf = gen_elapsed / audio_duration if audio_duration > 0 else 0

            print(
                f"[{self.log_date_time_string()}] [Kokoro TTS] Generated {audio_duration:.2f}s audio "
                f"({len(audio)} samples at {sample_rate}Hz) in {gen_elapsed:.2f}s (RTF: {rtf:.2f})"
            )

            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(wav_bytes)))
            self.send_header("X-Audio-Duration", f"{audio_duration:.2f}")
            self.send_header("X-Generation-Time", f"{gen_elapsed:.3f}")
            self.send_header("X-Sample-Rate", str(sample_rate))
            self.send_header("Content-Disposition", 'inline; filename="kokoro_speech.wav"')
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(wav_bytes)

        except Exception as e:
            print(f"[{self.log_date_time_string()}] [Kokoro TTS] Error during synthesis: {e}")
            self._send_json_response(500, {"error": f"Kokoro synthesis failed: {e}"})
        finally:
            if acquired:
                GENERATION_LOCK.release()

    def log_message(self, format, *args):
        # Clean logging format
        print(f"[{self.log_date_time_string()}] {format % args}")


def run_server():
    # Warm up model prior to accepting connections
    get_model()

    server_address = (HOST, PORT)
    httpd = ThreadingHTTPServer(server_address, KokoroHandler)
    print("=" * 60)
    print(f"Starting Kokoro TTS Service on http://{HOST}:{PORT}")
    print(f"Model: {MODEL_ID}")
    print(f"Supported voices: {', '.join(AVAILABLE_VOICES)}")
    print(f"Default voice: {DEFAULT_VOICE}")
    print("=" * 60)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down Kokoro TTS Service.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    run_server()
