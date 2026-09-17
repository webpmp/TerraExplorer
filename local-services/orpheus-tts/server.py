import os
import json
import threading
import time
import base64
from http.server import HTTPServer, ThreadingHTTPServer, BaseHTTPRequestHandler
import urllib.request
import urllib.error

from gguf_orpheus import (
    AVAILABLE_VOICES,
    DEFAULT_VOICE,
    generate_speech_bytes,
    generate_speech_chunks,
    LM_STUDIO_URL,
    ORPHEUS_MODEL,
    SAMPLE_RATE,
)

PORT = int(os.environ.get("BRIDGE_PORT", "8765"))
HOST = os.environ.get("BRIDGE_HOST", "127.0.0.1")

# Single lock to ensure serial generation and prevent competing requests
# from overloading LM Studio or local MPS/GPU resources.
GENERATION_LOCK = threading.Lock()

def check_lm_studio_health(timeout=3):
    """Check if LM Studio is reachable and models can be queried."""
    models_url = f"{LM_STUDIO_URL}/v1/models"
    try:
        req = urllib.request.Request(models_url, headers={"User-Agent": "lmstudio-audio-bridge"})
        with urllib.request.urlopen(req, timeout=timeout) as response:
            if response.status == 200:
                data = json.loads(response.read().decode("utf-8"))
                available_models = [m.get("id") for m in data.get("data", [])]
                model_loaded = ORPHEUS_MODEL in available_models
                return {
                    "reachable": True,
                    "model_available": model_loaded,
                    "target_model": ORPHEUS_MODEL,
                    "available_models": available_models,
                }
    except Exception as e:
        return {
            "reachable": False,
            "model_available": False,
            "target_model": ORPHEUS_MODEL,
            "error": str(e),
        }
    return {
        "reachable": False,
        "model_available": False,
        "target_model": ORPHEUS_MODEL,
    }


def is_allowed_origin(origin: str) -> bool:
    """Check if origin is a local dev origin for TerraExplorer or localhost."""
    if not origin:
        return False
    origin = origin.lower().strip()
    # Match localhost / 127.0.0.1 / [::1] on any local dev port or null origin (local file)
    if origin == "null":
        return True
    if origin.startswith("http://localhost:") or origin == "http://localhost":
        return True
    if origin.startswith("http://127.0.0.1:") or origin == "http://127.0.0.1":
        return True
    if origin.startswith("http://[::1]:") or origin == "http://[::1]":
        return True
    return False


class TTSBridgeHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send_cors_headers(self):
        origin = self.headers.get("Origin", "")
        if is_allowed_origin(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        else:
            # Fallback to local host origin for local requests
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
        if norm_path == "/health":
            lm_health = check_lm_studio_health()
            status_code = 200
            response_data = {
                "status": "ok",
                "service": "lmstudio-audio-bridge",
                "lm_studio": lm_health,
                "supported_voices": AVAILABLE_VOICES,
                "default_voice": DEFAULT_VOICE,
                "endpoints": ["/", "/health", "/tts", "/tts/stream"]
            }
            self._send_json_response(status_code, response_data)
        elif norm_path == "" or norm_path == "/test":
            # Serve minimal browser test interface
            index_path = os.path.join(os.path.dirname(__file__), "index.html")
            if os.path.exists(index_path):
                with open(index_path, "rb") as f:
                    html_content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(html_content)))
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(html_content)
            else:
                self._send_json_response(404, {"error": "index.html not found"})
        else:
            self._send_json_response(404, {"error": f"Endpoint not found: {self.path}"})

    def _parse_tts_payload(self):
        content_length_header = self.headers.get("Content-Length")
        if not content_length_header:
            self._send_json_response(400, {"error": "Missing Content-Length header."})
            return None

        try:
            content_length = int(content_length_header)
            raw_body = self.rfile.read(content_length)
            payload = json.loads(raw_body.decode("utf-8"))
        except (ValueError, json.JSONDecodeError) as e:
            self._send_json_response(400, {"error": f"Invalid JSON payload: {e}"})
            return None

        if not isinstance(payload, dict):
            self._send_json_response(400, {"error": "Request body must be a JSON object."})
            return None

        text = payload.get("text")
        if text is None:
            self._send_json_response(400, {"error": "Missing required field: 'text'"})
            return None

        if not isinstance(text, str) or not text.strip():
            self._send_json_response(400, {"error": "Field 'text' must contain non-empty text."})
            return None

        voice = payload.get("voice", DEFAULT_VOICE)
        if voice is None or not isinstance(voice, str) or not voice.strip():
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
            return None

        return {
            "text": text.strip(),
            "voice": voice
        }

    def do_POST(self):
        norm_path = self.path.rstrip("/")
        if norm_path == "/tts":
            self.handle_tts()
        elif norm_path == "/tts/stream":
            self.handle_tts_stream()
        else:
            self._send_json_response(404, {"error": f"Endpoint not found: {self.path}"})

    def handle_tts(self):
        payload = self._parse_tts_payload()
        if not payload:
            return

        text = payload["text"]
        voice = payload["voice"]

        # Perform TTS Generation with concurrency lock
        acquired = GENERATION_LOCK.acquire(blocking=True)
        try:
            wav_bytes = generate_speech_bytes(
                prompt=text,
                voice=voice,
            )
        except ConnectionError as e:
            self._send_json_response(502, {"error": f"LM Studio connection error: {e}"})
            return
        except RuntimeError as e:
            self._send_json_response(500, {"error": f"TTS generation runtime error: {e}"})
            return
        except Exception as e:
            self._send_json_response(500, {"error": f"Unexpected error during TTS generation: {e}"})
            return
        finally:
            if acquired:
                GENERATION_LOCK.release()

        if not wav_bytes or len(wav_bytes) <= 44:  # 44 bytes is empty WAV header
            self._send_json_response(500, {"error": "TTS engine produced no audio data."})
            return

        # Return full WAV audio response
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(wav_bytes)))
        self.send_header("Content-Disposition", 'inline; filename="speech.wav"')
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(wav_bytes)

    def handle_tts_stream(self):
        payload = self._parse_tts_payload()
        if not payload:
            return

        text = payload["text"]
        voice = payload["voice"]

        t_request_received = time.perf_counter()
        req_timestamp_str = self.log_date_time_string()

        print(f"[{req_timestamp_str}] [STREAM] Received /tts/stream request for {len(text)} chars (voice: {voice})")

        stop_event = threading.Event()
        acquired = GENERATION_LOCK.acquire(blocking=True)

        try:
            # Check LM Studio availability before opening stream
            try:
                chunk_generator = generate_speech_chunks(
                    prompt=text,
                    voice=voice,
                    stop_event=stop_event,
                    target_chunk_seconds=1.5
                )
            except ConnectionError as e:
                self._send_json_response(502, {"error": f"LM Studio connection error: {e}"})
                return
            except Exception as e:
                self._send_json_response(500, {"error": f"Failed to initialize stream: {e}"})
                return

            # Start Chunked SSE Stream Response
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache, no-transform")
            self.send_header("Connection", "keep-alive")
            self.send_header("Transfer-Encoding", "chunked")
            self.send_header("X-Accel-Buffering", "no")
            self._send_cors_headers()
            self.end_headers()

            def write_chunk(data_bytes: bytes):
                if not data_bytes:
                    return
                # HTTP chunked encoding: <hex_len>\r\n<data>\r\n
                header = f"{len(data_bytes):X}\r\n".encode("ascii")
                self.wfile.write(header + data_bytes + b"\r\n")
                self.wfile.flush()

            # Send initial metadata event
            init_event = {
                "event": "start",
                "sample_rate": SAMPLE_RATE,
                "channels": 1,
                "sample_width": 2,
                "voice": voice,
                "text_length": len(text)
            }
            write_chunk(f"event: start\ndata: {json.dumps(init_event)}\n\n".encode("utf-8"))

            time_to_first_chunk = None
            time_to_first_http_bytes = None
            total_chunks = 0
            total_audio_duration = 0.0
            total_tokens = 0
            finish_reason = "unknown"
            ttft = 0.0

            for item in chunk_generator:
                if stop_event.is_set():
                    break

                if item["type"] == "chunk":
                    now = time.perf_counter()
                    if time_to_first_chunk is None:
                        time_to_first_chunk = now - t_request_received
                        time_to_first_http_bytes = now - t_request_received

                    chunk_data = {
                        "index": item["index"],
                        "duration": round(item["duration"], 3),
                        "total_duration": round(item["total_duration"], 3),
                        "is_first": item["is_first"],
                        "audio_base64": base64.b64encode(item["wav_bytes"]).decode("ascii"),
                        "raw_pcm_base64": base64.b64encode(item["pcm_bytes"]).decode("ascii")
                    }

                    sse_msg = f"event: audio\ndata: {json.dumps(chunk_data)}\n\n"
                    try:
                        write_chunk(sse_msg.encode("utf-8"))
                    except (BrokenPipeError, ConnectionResetError) as e:
                        print(f"[{self.log_date_time_string()}] Client disconnected during stream ({e}). Cancelling generation.")
                        stop_event.set()
                        break

                    total_chunks += 1
                    total_audio_duration = item["total_duration"]

                elif item["type"] == "done":
                    total_tokens = item["total_tokens"]
                    finish_reason = item["finish_reason"]
                    ttft = item["ttft"]

            t_end = time.perf_counter()
            total_request_duration = t_end - t_request_received

            if not stop_event.is_set():
                done_event = {
                    "event": "done",
                    "total_chunks": total_chunks,
                    "total_duration": round(total_audio_duration, 2),
                    "total_tokens": total_tokens,
                    "finish_reason": finish_reason,
                    "time_to_first_audio": round(time_to_first_chunk or 0.0, 3),
                    "total_request_duration": round(total_request_duration, 3)
                }
                try:
                    write_chunk(f"event: done\ndata: {json.dumps(done_event)}\n\n".encode("utf-8"))
                    # End chunked transfer: 0\r\n\r\n
                    self.wfile.write(b"0\r\n\r\n")
                    self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    pass

            print("="*60)
            print(f"[STREAM SUMMARY] Text Length: {len(text)} chars | Voice: {voice}")
            print(f"  Request received: {req_timestamp_str}")
            print(f"  Time to first generated token (TTFT): {ttft:.3f} s")
            print(f"  TIME TO FIRST AUDIO CHUNK: {time_to_first_chunk or 0.0:.3f} s")
            print(f"  Time to first HTTP audio bytes: {time_to_first_http_bytes or 0.0:.3f} s")
            print(f"  Total chunks delivered: {total_chunks}")
            print(f"  Total tokens generated: {total_tokens}")
            print(f"  Total audio duration: {total_audio_duration:.2f} s")
            print(f"  Total request duration: {total_request_duration:.3f} s")
            print(f"  Finish reason: {finish_reason}")
            print("="*60)

        except Exception as e:
            print(f"Stream error: {e}")
            if not stop_event.is_set():
                try:
                    err_event = {"event": "error", "error": str(e)}
                    self.wfile.write(f"event: error\ndata: {json.dumps(err_event)}\n\n".encode("utf-8"))
                    self.wfile.flush()
                except Exception:
                    pass
        finally:
            stop_event.set()
            if acquired:
                GENERATION_LOCK.release()

    def log_message(self, format, *args):
        # Override to provide clean standard logs
        print(f"[{self.log_date_time_string()}] {format % args}")


def run_server():
    server_address = (HOST, PORT)
    httpd = ThreadingHTTPServer(server_address, TTSBridgeHandler)
    print(f"Starting Orpheus TTS HTTP Bridge on http://{HOST}:{PORT}")
    print(f"LM Studio target: {LM_STUDIO_URL} (model: {ORPHEUS_MODEL})")
    print(f"Supported voices: {', '.join(AVAILABLE_VOICES)}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    run_server()
