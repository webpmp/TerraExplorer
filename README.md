<div align="center">
  <img src="assets/multi-waypoint-results.png"
       alt="TerraExplorer Multi-Waypoint Route Results"
       width="900">
</div>

# TerraExplorer

TerraExplorer is an interactive 3D globe application for exploring locations, discovering geographic information, and building journeys across the world.

Search for cities, landmarks, historical sites, and points of interest, explore locations on a 3D globe or street-level map, ask contextual follow-up questions or your own questions to learn more, listen to location narration, and use Trace Route to turn articles, URLs, or text into connected geographic journeys. You can also view current news relevant to the locations you explore.

<table align="center" style="background-color:black; border:0; border-collapse:collapse; padding:20px;">
  <tr>
    <td style="border:0; padding:8px;">
      <a href="assets/machu-picchu-parchment.png">
        <img src="assets/machu-picchu-parchment.png"
             alt="TerraExplorer Parchment Theme"
             width="200"
             style="border:0;">
      </a>
    </td>
    <td style="border:0; padding:8px;">
      <a href="assets/machu-picchu-modern.png">
        <img src="assets/machu-picchu-modern.png"
             alt="TerraExplorer Modern Theme"
             width="200"
             style="border:0;">
      </a>
    </td>
    <td style="border:0; padding:8px;">
      <a href="assets/machu-picchu-crt-green.png">
        <img src="assets/machu-picchu-crt-green.png"
             alt="TerraExplorer CRT Green Theme"
             width="200"
             style="border:0;">
      </a>
    </td>
    <td style="border:0; padding:8px;">
      <a href="assets/machu-picchu-crt-amber.png">
        <img src="assets/machu-picchu-crt-amber.png"
             alt="TerraExplorer CRT Amber Theme"
             width="200"
             style="border:0;">
      </a>
    </td>
  </tr>
</table>

## Features

- **3D Globe:** Rotate, zoom, and explore the Earth from orbit to street level.
- **Smart Search:** Find locations using natural-language queries.
- **AI Location Insights:** Generate summaries, facts, population, climate, and other geographic information using Google Gemini or local LM Studio inference.
- **Contextual Follow-Up Questions:** Continue exploring a location with contextually relevant suggested questions or ask your own follow-up question. Answers are displayed directly in the location information panel.
- **Street Maps:** Switch from the 3D globe to a detailed street map to explore locations, roads, landmarks, and surrounding areas more closely.
- **Documentary Mode:** Experience cinematic camera transitions and a guided visual presentation as you explore locations. Documentary Mode works independently, but is especially immersive when combined with Narration.
- **Location Narration:** Listen to location descriptions and other exploration content as TerraExplorer reads it aloud using System Voice, Kokoro TTS, or Orpheus TTS.
- **Real-Time News:** View current news relevant to selected locations.
- **Trace Route:** Extract locations from articles, URLs, or text and build connected journeys.
- **Favorites & Notes:** Save locations and attach personal notes.
- **Visual Themes:** Parchment, Modern, CRT Green, and CRT Amber.

## Kokoro TTS

Kokoro is an optional local neural TTS provider for TRACE ROUTE narration, powered by Apple Silicon MLX (`mlx-community/Kokoro-82M-bf16`).

* **Separate Local Service:** Runs as an isolated Python service on `http://127.0.0.1:8880`.
* **Model & Caching:** The Kokoro model weights (~82M parameters) are downloaded from Hugging Face on first run and cached locally. The model weights and Python virtual environment are **not** committed to Git.
* **Service Availability:** The Kokoro service must be running locally before selecting or using Kokoro narration in TerraExplorer.

### Setup

1. **One-Time Environment Setup:**
   ```bash
   ./scripts/setup-kokoro.sh
   ```
   This creates an isolated virtual environment at `local-services/kokoro-tts/.venv/` (Python 3.11+) and installs the necessary dependencies without modifying TerraExplorer's global or Node environment.

2. **Start the Service:**
   ```bash
   ./scripts/start-kokoro.sh
   ```
   The service listens on:
   ```text
   http://127.0.0.1:8880
   ```
   *(To override the port, set `KOKORO_PORT=8885 ./scripts/start-kokoro.sh`)*

### Voice Options

The following six voices are available in the Settings Panel:

* **Michael (American)** — `am_michael` (Default)
* **George (British)** — `bm_george`
* **Bella (American)** — `af_bella`
* **Sarah (American)** — `af_sarah`
* **Emma (British)** — `bf_emma`
* **Isabella (British)** — `bf_isabella`

### Repository Files

* [`local-services/kokoro-tts/`](local-services/kokoro-tts/): Contains the lightweight HTTP bridge server (`server.py`) and requirements (`requirements.txt`).
* [`scripts/setup-kokoro.sh`](scripts/setup-kokoro.sh): Automated setup script to configure the Python virtual environment.
* [`scripts/start-kokoro.sh`](scripts/start-kokoro.sh): Startup script to run the Kokoro TTS bridge server.

*Note: The Python virtual environment (`.venv`), model weight caches, and generated audio files are intentionally excluded from Git.*

## Local Orpheus TTS

TerraExplorer also supports local neural narration through Orpheus TTS and LM Studio.

See the [Orpheus TTS setup guide](local-services/orpheus-tts/README.md) for installation, configuration, and troubleshooting.

## Setup

### Environment Variables

Copy `.env.example` to `.env` and configure the services you want to use:

```env
# AI
GEMINI_API_KEY=your_gemini_api_key

# Maps
VITE_CARTO_API_KEY=your_carto_api_key

# Optional news providers
VITE_NYT_API_KEY=your_nytimes_api_key
VITE_NEWS_API_KEY=your_newsapi_org_key
VITE_NEWS_DATA_API_KEY=your_newsdata_io_key
```

AI, local LM Studio, narration, and news settings can also be configured in the application.

### Run

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

## Key Components

- `Earth.tsx` - 3D globe, lighting, atmosphere, and location markers.
- `OSMMapLayer.tsx` - CARTO/OpenStreetMap street-level map rendering.
- `InfoPanel.tsx` - Location information, news, notes, and related content.
- `Controls.tsx` - Search, navigation, Trace Route, themes, and settings.
- `SettingsPanel.tsx` - AI, map, news, narration, and Documentary Mode configuration.
- `documentaryController.ts` - Cinematic camera and narration orchestration.
- `narrationService.ts` - Browser speech synthesis.
- `geminiService.ts` - AI location intelligence and search classification.
- `osmTileService.ts` - CARTO map styles and geometry.
- `routeExtractionService.ts` - Location extraction and geographic resolution.

## AI Development Context

Before making architectural changes, review [`docs/AI_CONTEXT.md`](docs/AI_CONTEXT.md).

It contains the project's architecture, conventions, data models, debugging history, and design decisions.
