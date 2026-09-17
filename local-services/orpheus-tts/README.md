# Orpheus TTS Local Service

This directory contains the local **Orpheus TTS** service used by **TerraExplorer** for high-quality, fully local neural text-to-speech narration.

The service acts as an HTTP/SSE bridge connecting TerraExplorer with [LM Studio](https://lmstudio.ai/) (running an Orpheus 3B GGUF model) and the [SNAC](https://github.com/hubertsiuzdak/snac) neural audio decoder.

---

## 1. Prerequisites

Before running the Orpheus TTS service, ensure you have:

* **Operating System**: macOS (Apple Silicon / Intel), Linux, or another environment capable of running Python 3 and PyTorch (MPS / CUDA / CPU).
* **Python**: Python 3.9+ (Python 3.10 or 3.11 recommended).
* **LM Studio**: Installed from [lmstudio.ai](https://lmstudio.ai/).
* **Orpheus Model**: An Orpheus 3B GGUF model compatible with LM Studio, such as [orpheus-3b-0.1-ft-Q4_K_M-GGUF](https://huggingface.co/isaiahbjork/orpheus-3b-0.1-ft-Q4_K_M-GGUF) (or base [Orpheus TTS](https://huggingface.co/canopylabs/orpheus-3b-0.1-ft)).
* **TerraExplorer**: The main web application.

---

## 2. Directory Structure

* `server.py`: The HTTP and Server-Sent Events (SSE) bridge server providing `/health`, `/tts`, and `/tts/stream` endpoints for TerraExplorer.
* `gguf_orpheus.py`: Core token generation and streaming orchestration interacting with LM Studio's completions API.
* `decoder.py`: Neural audio decoder using SNAC (24 kHz) and PyTorch to convert discrete acoustic tokens into PCM audio and WAV bytes.
* `requirements.txt`: Python package dependencies (`torch`, `numpy`, `sounddevice`, `requests`, `wave`, `snac`).
* `example.py`: Standalone reference script demonstrating how to generate audio files directly in Python.
* `examples/`: Sample audio files (`example_tara.wav`, `example_leo.wav`) included strictly as reference audio.

---

## 3. Create the Python Environment

From the root directory of the TerraExplorer repository, set up a dedicated virtual environment for the service:

```bash
cd local-services/orpheus-tts
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

> **Note**: The `venv/` directory is local-only and is ignored by Git in the repository's `.gitignore`. Do not commit virtual environments or installed packages.

---

## 4. LM Studio Setup

1. Launch **LM Studio**.
2. Download or load the **Orpheus 3B** model (`orpheus-3b-0.1-ft-q4_k_m.gguf` or equivalent).
3. Open the **Local Server** tab in LM Studio and start the server.
4. By default, LM Studio runs on:
   ```text
   http://127.0.0.1:1234
   ```

### Custom LM Studio Host / Port
If LM Studio is running on a different port or host, you can override the target URL using the `LM_STUDIO_URL` environment variable before starting the bridge:

```bash
export LM_STUDIO_URL="http://<LM-STUDIO-HOST>:1234"
```

*(Replace `<LM-STUDIO-HOST>` with your host address or hostname).*

---

## 5. Start the Orpheus Service

Activate your virtual environment and start the bridge server:

```bash
cd local-services/orpheus-tts
source venv/bin/activate
python server.py
```

By default, the bridge starts and listens on:
```text
http://127.0.0.1:8765
```

You can optionally configure custom bind host and port using environment variables:
```bash
export BRIDGE_HOST="127.0.0.1"
export BRIDGE_PORT="8765"
python server.py
```

---

## 6. Health Check

You can verify the bridge and its connection to LM Studio using `curl`:

```bash
curl http://127.0.0.1:8765/health
```

### Example Successful Response
```json
{
  "status": "ok",
  "service": "lmstudio-audio-bridge",
  "lm_studio": {
    "reachable": true,
    "model_available": true,
    "target_model": "orpheus-3b-0.1-ft",
    "available_models": ["orpheus-3b-0.1-ft"]
  },
  "supported_voices": ["tara", "leah", "jess", "leo", "dan", "mia", "zac", "zoe"],
  "default_voice": "tara",
  "endpoints": ["/", "/health", "/tts", "/tts/stream"]
}
```

* `status: "ok"`: The bridge server is operational.
* `lm_studio.reachable: true`: The bridge successfully communicated with LM Studio.
* `lm_studio.model_available: true`: The required Orpheus model is loaded and ready in LM Studio.

---

## 7. TTS Endpoints

The bridge exposes two primary TTS endpoints:

### 1. `POST /tts/stream` (Progressive SSE Streaming — Used by TerraExplorer)
Streams audio progressively using Server-Sent Events (SSE) and HTTP chunked transfer encoding for low-latency playback:
* **Request Payload**:
  ```json
  {
    "text": "Welcome to TerraExplorer.",
    "voice": "tara"
  }
  ```
* **Response Content-Type**: `text/event-stream; charset=utf-8`
* **SSE Events**:
  * `event: start`: Emits initial audio format metadata (`sample_rate: 24000`, `channels: 1`, `sample_width: 2`, `voice`, `text_length`).
  * `event: audio`: Emits incremental audio chunks with `audio_base64` (standalone WAV chunk) and `raw_pcm_base64` (raw 16-bit 24kHz mono PCM), chunk `duration`, and cumulative `total_duration`.
  * `event: done`: Emits completion metrics (`total_chunks`, `total_duration`, `total_tokens`, `time_to_first_audio`, `finish_reason`).
  * `event: error`: Emitted if token generation or decoding encounters an error.

### 2. `POST /tts` (Standard WAV Response)
Generates the entire speech audio and returns a single WAV file:
* **Request Payload**:
  ```json
  {
    "text": "Welcome to TerraExplorer.",
    "voice": "tara"
  }
  ```
* **Response**: Binary WAV audio data (`Content-Type: audio/wav`, 24 kHz, 16-bit mono).

---

## 8. Supported Voices

Orpheus TTS supports eight distinct voices:

* `tara` *(Default — clear, natural tone)*
* `leah`
* `jess`
* `leo`
* `dan`
* `mia`
* `zac`
* `zoe`

All eight voices can be selected in TerraExplorer's **AUDIO** settings panel.

---

## 9. TerraExplorer Usage

Once the bridge service and LM Studio are running:

1. Launch **TerraExplorer** in your browser.
2. Open **Settings** (gear icon) and navigate to the **AUDIO** tab.
3. Under **Narration Provider**, select **Orpheus**.
4. Choose your preferred voice from the **Orpheus Voice** dropdown (`tara`, `dan`, `leo`, etc.).
5. Adjust **Speed** (0.5× to 2.0×) and **Volume** (0% to 100%) as desired.
6. Click **TEST VOICE** to verify audio playback with the active settings.
7. Perform any search or click on a point of interest to hear real-time AI narration.

---

## 10. Narration Character Limit

In **Settings > AUDIO**, the **Narration Character Limit** (default: `600`, range: `100` to `1000`) controls the maximum text length sent to the Orpheus TTS provider:

* **Narration**: Sentences are trimmed gracefully at sentence boundaries up to the configured limit to keep speech concise and prevent model token degradation on long articles.
* **InfoPanel**: The full, complete description is always displayed in the TerraExplorer UI regardless of the narration character limit.

---

## 11. Troubleshooting

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **Bridge connection fails / Network error in TerraExplorer** | `server.py` is not running. | Run `source venv/bin/activate && python server.py` inside `local-services/orpheus-tts`. Check that the bridge is listening on `http://127.0.0.1:8765`. |
| **HTTP 502: "LM Studio connection error"** | LM Studio local server is offline or unreachable. | Open LM Studio, ensure the server is started on port `1234`, and check `curl http://127.0.0.1:1234/v1/models`. |
| **Model not found / `model_available: false`** | The Orpheus model is not loaded in LM Studio. | Select and load the Orpheus 3B GGUF model in LM Studio. |
| **Wrong LM Studio host or port** | LM Studio is on a non-default port or remote machine. | Set `export LM_STUDIO_URL="http://<LM-STUDIO-HOST>:1234"` before starting `server.py`. |
| **`OSError: [Errno 48] Address already in use`** | Port 8765 is occupied by another process. | Terminate the existing process or start with `export BRIDGE_PORT=8766`. |
| **Missing Python packages / ModuleNotFoundError** | Virtual environment is not activated or dependencies are uninstalled. | Run `source venv/bin/activate` and reinstall with `pip install -r requirements.txt`. |
| **PyTorch device performance** | Running on CPU instead of GPU / Apple Silicon. | On macOS, PyTorch automatically selects `mps` (Metal Performance Shaders). On Linux/Windows with NVIDIA, ensure CUDA is available. |

---

## 12. Local-Only Files & Git Hygiene

The following runtime files and directories should **never** be committed to version control:

* Virtual environments (`venv/`, `.venv/`)
* Python bytecode and caches (`__pycache__/`, `*.pyc`)
* Downloaded model weights (`.gguf`, `.bin`, `.safetensors`)
* Locally generated runtime audio outputs or temporary WAV files

TerraExplorer's root `.gitignore` is pre-configured to automatically exclude `venv/`, `.venv/`, `__pycache__/`, and `*.py[cod]`.

---

## 13. License

The Orpheus TTS integration scripts and bridge are distributed under the **Apache 2.0 License**. See [LICENSE](LICENSE) for full details.


