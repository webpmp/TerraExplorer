<img src="https://github.com/webpmp/webpmp.github.io/blob/master/TerraExplorer_Modern_v2.png" alt="Terra Explorer Modern screenshot" width="768" height="616">

<img src="https://github.com/webpmp/webpmp.github.io/blob/master/TerraExplorer_Modern_v2_small.jpg" alt="Terra Explorer CRT-G screenshot" width="200" height="160">&nbsp;<img src="https://github.com/webpmp/webpmp.github.io/blob/master/TerraExplorer_CRT_G.png" alt="Terra Explorer CRT-G screenshot" width="200" height="175">&nbsp;<img src="https://github.com/webpmp/webpmp.github.io/blob/master/TerraExplorer_CRT_A.png" alt="Terra Explorer CRT-A screenshot" width="200" height="175">

# TerraExplorer

TerraExplorer is an immersive, interactive 3D Earth visualization application powered by Google's Gemini API. It allows users to explore the globe, discover detailed information about any location, and view real-time news updates, all wrapped in a customizable interface featuring modern and retro aesthetics.

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
