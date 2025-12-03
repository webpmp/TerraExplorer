<img src="https://github.com/webpmp/webpmp.github.io/blob/master/terraexplorer-modern-waypoints.png" alt="Terra Explorer Modern screenshot" width="75%" height="75%">

# TerraExplorer

Terra Explorer is an interactive 3D globe application that lets users freely navigate the planet or quickly jump to cities, states, landmarks, and unique points of interest through a powerful search experience. It supports rich data layers including shipwrecks, natural wonders, and historical sites, provides overlays with location overviews, current news, and notable people associated with each place, and includes the Trace Route feature that extracts locations from any article, URL, or text block to build a connected journey across them.

## Features

- **Interactive 3D Globe**: Seamlessly rotate, zoom, and explore a high-fidelity 3D model of the Earth.
- **AI-Powered Insights**: Click anywhere or search for a location to receive instant, AI-generated encyclopedic summaries, population data, climate info, and fun facts using the Gemini 2.5 Flash model.
- **Real-Time News**: Fetches live news headlines relevant to the selected location using Google Search Grounding.
- **Visual Themes (Skins)**:
  - **Modern**: Sleek, glassmorphism UI with high-resolution textures.
  - **CRT Green**: Retro monochrome monitor effect with scanlines and pixelated fonts.
  - **CRT Amber**: Amber monochrome variation for a different retro feel.
- **Favorites System**: Bookmark interesting locations to revisit them later.
- **Personal Notes**: Add and save personal notes for specific locations (persisted locally).
- **Smart Search**: Natural language processing to resolve queries like "Where did the Titanic sink?" to specific geographic coordinates.
- **Trace Route**: Paste an article, URL, or text block and the system identifies all referenced locations and generates a connected journey across them.

## Technologies Used

- **Frontend Framework**: React 19
- **3D Engine**: Three.js / React Three Fiber (@react-three/fiber, @react-three/drei)
- **Styling**: Tailwind CSS
- **AI & Data**: Google GenAI SDK (`@google/genai`)
- **Icons**: Lucide React

## Setup

1. **Environment Variables**:
   This application requires a Google Gemini API key.
   Ensure `process.env.API_KEY` is available in your environment configuration.

2. **Installation**:
   ```bash
   npm install
   npm start
   ```

## Key Components

- **`Earth.tsx`**: Renders the 3D globe, handles interaction events, shaders for retro effects, and marker rendering.
- **`geminiService.ts`**: Handles all communication with the Google Gemini API, including robust error handling for rate limits (429) and JSON parsing.
- **`InfoPanel.tsx`**: The main UI overlay displaying location details, news, notable people, and user notes.
- **`Controls.tsx`**: The HUD for search, zoom controls, and theme toggling.

## Usage

1. **Explore**: Drag to rotate the earth. Scroll to zoom.
2. **Interact**: Click on any landmass to identify it, or click on specific markers (dots) to see details.
3. **Search**: Use the search bar to find cities, landmarks, or historical events.
4. **Customize**: Toggle between Modern and Retro skins using the buttons in the top right.
