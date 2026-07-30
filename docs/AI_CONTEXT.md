# Terra Explorer AI Context

## Purpose
Interactive 3D globe application for exploring locations, historical routes, and geographic context.

## Architecture

Frontend:
- React + TypeScript
- React Three Fiber globe
- Earth rendering: components/Earth.tsx

Search flow:
App.tsx
 -> runSearchPipeline()
 -> services/pipeline.ts
 -> geminiService.ts resolution
 -> locationService.ts enrichment
 -> LocationInfo rendering

## Coordinate Resolution
Location queries do not use Leaflet/OpenStreetMap.
Coordinates currently come from:
- Gemini resolution
- AI recovery fallback

## Important Files

components/Earth.tsx
- Globe rendering
- Camera behavior
- Marker rendering
- Route visualization

App.tsx
- Search state
- Marker state
- Route state

services/pipeline.ts
- Intent routing
- Coordinate validation
- Route fallback

types.ts
- LocationInfo
- Waypoint
- MapMarker contracts

## Current Issue
Investigating map/navigation architecture.
Need to determine:
- camera control implementation
- whether globe supports smooth location fly-to
- whether external map providers exist

## Do Not Change
- Historical route pipeline
- Coordinate validation
- Waypoint roles
