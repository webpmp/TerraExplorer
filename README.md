<div align="center">
  <img src="assets/multi-waypoint-results.png"
       alt="TerraExplorer Multi-Waypoint Route Results"
       width="900">
</div>

# TerraExplorer

TerraExplorer is an interactive 3D globe application for exploring locations, discovering geographic information, and building journeys across the world.

Search for cities, landmarks, historical sites, and points of interest, explore locations on a 3D globe or street-level map, view AI-generated information and current news, listen to location narration, and use Trace Route to turn articles, URLs, or text into connected geographic journeys.

<p align="center" style="background-color:black; padding:20px;">
  <a href="assets/machu-picchu-parchment.png">
    <img src="assets/machu-picchu-parchment.png"
         alt="TerraExplorer Parchment Theme"
         width="200"
         style="margin:5px;">
  </a>
  <a href="assets/machu-picchu-modern.png">
    <img src="assets/machu-picchu-modern.png"
         alt="TerraExplorer Modern Theme"
         width="200"
         style="margin:5px;">
  </a>
  <a href="assets/machu-picchu-crt-green.png">
    <img src="assets/machu-picchu-crt-green.png"
         alt="TerraExplorer CRT Green Theme"
         width="200"
         style="margin:5px;">
  </a>
  <a href="assets/machu-picchu-crt-amber.png">
    <img src="assets/machu-picchu-crt-amber.png"
         alt="TerraExplorer CRT Amber Theme"
         width="200"
         style="margin:5px;">
  </a>
</p>

## Features

- **3D Globe:** Rotate, zoom, and explore the Earth from orbit to street level.
- **Smart Search:** Find locations using natural-language queries.
- **AI Location Insights:** Generate summaries, facts, population, climate, and other geographic information using Google Gemini or local LM Studio inference.
- **Street Maps:** Switch to detailed CARTO vector maps based on OpenStreetMap data.
- **Documentary Mode:** Experience cinematic camera transitions from the globe to selected locations.
- **Location Narration:** Listen to location titles and descriptions using System Voice or local Orpheus TTS.
- **Real-Time News:** View current news relevant to selected locations.
- **Trace Route:** Extract locations from articles, URLs, or text and build connected journeys.
- **Favorites & Notes:** Save locations and attach personal notes.
- **Visual Themes:** Parchment, Modern, CRT Green, and CRT Amber.

## Map Configuration

TerraExplorer uses CARTO vector maps based on OpenStreetMap data for its street-level map experience.

A CARTO API key is required:

```env
VITE_CARTO_API_KEY=your_carto_api_key
```

OpenStreetMap and CARTO attribution is displayed within the application.

## Local Orpheus TTS

TerraExplorer supports local neural narration through Orpheus TTS and LM Studio.

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