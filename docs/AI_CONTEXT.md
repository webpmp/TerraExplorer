# Terra Explorer AI Context

## Purpose

Interactive 3D globe application for exploring locations, historical events, routes, and geographic context.

## Architecture

Frontend:
- React + TypeScript
- React Three Fiber / Three.js
- Globe rendering: `components/Earth.tsx`

Search flow:

```text
App.tsx
 -> runSearchPipeline()
 -> services/pipeline.ts
 -> location resolution
 -> locationService.ts enrichment
 -> image / media handling
 -> LocationInfo rendering
```

## Location Resolution

Location queries are resolved through the AI search pipeline and validated before display.

Key responsibilities:
- Resolve geographic coordinates
- Validate coordinate trust
- Distinguish point locations from routes
- Resolve historical locations and events
- Handle AI recovery when initial resolution fails

Do not assume Leaflet or OpenStreetMap is responsible for coordinate resolution.

## Search and Content Behavior

The pipeline must distinguish between:
- Single-point locations
- Historical events with a specific location
- Multi-waypoint historical routes
- General geographic entities
- Image/media requests

Location titles should represent the canonical entity or event.

Avoid:
- Duplicate aliases
- Raw latitude/longitude labels
- Generic labels when a more specific category is available

Image search should prioritize relevant location photography and reject unrelated:
- Logos
- Coats of arms
- Maps
- Illustrations
- Paintings
- Other non-photographic results

unless explicitly requested by the user.

## Important Files

`App.tsx`
- Search state
- Search pipeline orchestration
- Marker state
- Route state
- InfoPanel rendering

`services/pipeline.ts`
- Search intent routing
- Coordinate resolution
- Coordinate validation
- Route handling
- Search result classification

`locationService.ts`
- Location enrichment
- Geographic metadata

`components/Earth.tsx`
- Globe rendering
- Camera behavior
- Marker rendering
- Route visualization

`types.ts`
- `LocationInfo`
- `Waypoint`
- `MapMarker` contracts

## Routes

Route visualization is registry-driven.

Important rules:
- Route registries are the source of truth for route segments.
- Route lines represent sequential historical evidence.
- Do not alter historical route definitions when fixing unrelated globe, camera, marker, or UI behavior.
- Waypoint roles must remain intact.

## Camera and Navigation

Camera behavior is handled by the globe/navigation architecture.

Relevant behavior includes:
- Single-location fly-to
- Multi-waypoint navigation
- Documentary-mode camera behavior
- Camera target and zoom limits
- Camera-idle handling for visual effects

Current documentary camera behavior:
- Default documentary mode is off.
- Camera target is approximately `1.30`.
- Maximum target is `5`.
- Documentary transitions use approximately 2 to 10 seconds.
- Multi-waypoint navigation outside documentary mode must not unexpectedly change the globe/map mode or snap the camera.

Do not change camera behavior as a side effect of unrelated marker, route, or UI changes.

## Markers and Globe Rendering

Marker behavior is implemented through the globe rendering architecture.

Important considerations:
- Marker scale must remain appropriate across zoom levels.
- Marker scaling should not begin too late or produce oversized markers.
- Globe occlusion must be preserved.
- Route lines must remain visually distinct from individual location markers.
- Visual effects such as the retro projection beam must not alter core location or route behavior.

## Themes

Supported themes include:
- Modern
- Parchment
- Retro Green
- Retro Amber

Theme-specific visual behavior should remain isolated from core search and geographic logic.

Retro projection beam effects are supported only in:
- Retro Green
- Retro Amber

Parchment-specific behavior includes:
- Tattered parchment background
- Voyager banner for multi-waypoint routes
- Pin glyph
- Theme-consistent brown labels
- No button hover backgrounds where specified by the theme

## AI Providers

AI configuration is managed through the Providers settings.

Supported provider categories include:
- AI
- MAP
- NEWS

Local AI development may use LM Studio.

Current local AI configuration:
- Endpoint: `http://localhost:1234/v1`
- Model: `qwen2.5-7b-instruct-1m`
- Temperature: `0.7`
- Top P: `0.9`
- Max tokens: `2048`

Provider credentials and API keys must remain externalized through environment/configuration settings.

Do not hard-code credentials or assume a specific provider is always available.

If no local AI model is loaded, the expected user-facing state is:

`No model loaded. Please load a model. (Settings > Providers)`

## Narration / Text-to-Speech

Terra Explorer supports AI narration for location, event, and route content.

Current narration architecture:
- Narration is handled through the TTS service layer.
- Supported AI narration providers: **Kokoro TTS** (`mlx-community/Kokoro-82M-bf16` via local HTTP bridge) and **Orpheus TTS** (via SSE streaming).
- TTS is separate from location resolution and search intent classification.
- Narration consumes finalized content produced by the search/content pipeline.
- Narration must not independently resolve or modify geographic coordinates.
- Playback behavior and TTS provider/model configuration should remain isolated from geographic logic.

Current narration behavior:
- Location titles and descriptions can be narrated.
- Browser-based speech behavior should preserve the existing narration controls and playback flow.
- Narration speed is approximately `0.9`.
- Narration volume is approximately `75%`.
- There is no skip control unless explicitly added as a future feature.

Important rules:
- Do not introduce a second narration implementation when modifying the existing TTS system.
- Do not change location resolution, coordinate validation, route definitions, or search intent behavior when modifying narration.
- Do not hard-code narration provider credentials.
- Keep TTS configuration separate from the geographic/search pipeline.
- Preserve existing narration controls and playback behavior unless explicitly requested.

## Images and Media

The image pipeline should distinguish between:
- Entity identification
- Location photography
- Historical/media requests
- Generic visual references

Default location-image behavior should favor actual photographs of the requested place.

Do not treat image-search qualifiers such as:
- photo
- photograph
- image
- illustration
- painting
- map

as part of the canonical entity name.

Explicit media requests may intentionally request non-photographic media.

## InfoPanel

The InfoPanel should display the canonical location/event identity without unnecessary duplication.

Title area should use:
- Canonical title
- `displaySubtitle` when appropriate
- Category/type
- Coordinates where appropriate

Avoid:
- Duplicate aliases
- Repeated titles
- Raw lat/lng blocks
- Redundant metadata

Search-result state and InfoPanel rendering should not race or display stale location information when a new search replaces an earlier result.

## Coordinate Trust

Coordinate validation is a core part of the search pipeline.

Important rules:
- Do not bypass coordinate validation.
- Do not silently accept coordinates that fail validation.
- AI recovery may provide an alternate coordinate candidate, but the candidate must still pass validation.
- Historical locations require particular care because modern coordinates may not represent the historical location.

## Narration & Text-To-Speech (TTS)

TerraExplorer supports speech synthesis providers through `NarrationService` and `INarrationProvider`:
- **SystemVoiceProvider**: Native Web Speech API synthesis.
- **KokoroTTSProvider** (Recommended): Ultra-fast local neural TTS via `local-services/kokoro-tts/server.py` on port 8880 (`mlx-community/Kokoro-82M-bf16` on Apple Silicon MLX). Synthesizes entire narration in a single pass in ~1.2–1.4 seconds. Default voice: `am_michael`, secondary voice: `bm_george`.
- **OrpheusTTSProvider**: Local neural TTS via `local-services/orpheus-tts/server.py` on port 8765 using LM Studio.

Preloading: When TRACE ROUTE progresses, subsequent waypoint narrations are pre-synthesized in the background into `waypointNarrationCache` and played instantly via `speakCached` with zero generation latency.

## Do Not Change Without Explicit Instruction

- Historical route definitions
- Route registry behavior
- Coordinate validation rules
- Waypoint roles
- Search intent classification
- Canonical location/title behavior
- Existing theme-specific behavior
- Provider configuration behavior
- Existing camera/navigation behavior

When implementing a change:
- Keep the scope limited to the requested behavior.
- Reuse existing functionality rather than creating parallel implementations.
- Avoid duplicate UI.
- Do not introduce unrelated architectural changes.
- Preserve existing behavior outside the requested change.