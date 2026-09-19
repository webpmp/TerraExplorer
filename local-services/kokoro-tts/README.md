# Kokoro TTS Local Service

This directory contains the local **Kokoro TTS** service used by **TerraExplorer** for ultra-fast, high-quality neural narration for TRACE ROUTE.

The service runs a lightweight HTTP server on port `8880` backed by Apple Silicon MLX (`mlx-community/Kokoro-82M-bf16`), generating full route narrations in ~1.2–1.4 seconds.

---

## 1. Prerequisites

* **Operating System**: macOS (Apple Silicon M-series recommended for MLX acceleration).
* **Python**: Python 3.11+.

---

## 2. One-Time Setup

From the root of the TerraExplorer repository, run:

```bash
./scripts/setup-kokoro.sh
```

This creates an isolated virtual environment at `local-services/kokoro-tts/.venv/` (or reuses `~/Projects/kokoro/venv` if available) and installs the required dependencies without touching TerraExplorer's node or global environment.

---

## 3. Starting the Kokoro Service

From the root of the TerraExplorer repository, run:

```bash
./scripts/start-kokoro.sh
```

By default, the service listens on:
```text
http://127.0.0.1:8880
```

To override the port, set `KOKORO_PORT`:
```bash
KOKORO_PORT=8885 ./scripts/start-kokoro.sh
```

---

## 4. Health Check

```bash
curl http://127.0.0.1:8880/health
```

### Response
```json
{
  "status": "ok",
  "service": "kokoro-tts-service",
  "model": "mlx-community/Kokoro-82M-bf16",
  "model_loaded": true,
  "supported_voices": [
    "am_michael",
    "bm_george",
    "af_bella",
    "af_sarah",
    "bf_emma",
    "bf_isabella"
  ],
  "default_voice": "am_michael",
  "endpoints": ["/health", "/tts"]
}
```

---

## 5. Supported Voices

* `am_michael` — Michael (American, Default)
* `bm_george` — George (British)
* `af_bella` — Bella (American)
* `af_sarah` — Sarah (American)
* `bf_emma` — Emma (British)
* `bf_isabella` — Isabella (British)

---

## 6. Model Download & Cache

On first launch, the `mlx-community/Kokoro-82M-bf16` model weights (~82M parameters) are downloaded automatically via Hugging Face and cached locally. Subsequent startups reuse the local cache immediately.
