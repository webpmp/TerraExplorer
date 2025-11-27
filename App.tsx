
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Stars, CameraControls } from '@react-three/drei';
import * as THREE from 'three';

import Earth from './components/Earth';
import InfoPanel from './components/InfoPanel';
import Controls from './components/Controls';
import { LocationInfo, SkinType, MapMarker, FavoriteLocation, LocationType } from './types';
import { resolveLocationQuery, getInfoFromCoordinates, getNearbyPlaces, getMoreNews } from './services/geminiService';

// Component to position the sun (directional light) at the camera's position
// ensuring the user always sees the "day" side of the earth.
const Sun: React.FC<{ skin: SkinType }> = ({ skin }) => {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  
  useFrame(({ camera }) => {
    if (lightRef.current) {
      // Copy camera position to light position
      lightRef.current.position.copy(camera.position);
    }
  });

  return (
    <directionalLight 
      ref={lightRef} 
      intensity={skin === 'modern' ? 2.5 : 3.0} 
      castShadow 
      color="#ffffff"
    />
  );
};

// Component to manage auto-rotation logic based on camera distance
const RotationManager: React.FC<{ 
  isDragging: boolean; 
  autoRotate: boolean; 
  setAutoRotate: (v: boolean) => void;
}> = ({ isDragging, autoRotate, setAutoRotate }) => {
  useFrame(({ camera }) => {
    if (isDragging) return;
    
    // Check if we are at max distance (zoomed all the way out)
    // Max distance in CameraControls is set to 5
    const dist = camera.position.length();
    
    // Use a threshold slightly less than 5 to account for floating point
    // If user zooms out to ~5 units, resume rotation
    if (dist > 4.9 && !autoRotate) {
      setAutoRotate(true);
    }
  });
  return null;
};

const App: React.FC = () => {
  const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(null);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [favorites, setFavorites] = useState<FavoriteLocation[]>([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isInteracting, setIsInteracting] = useState(false); // Interaction with Earth mesh
  const [isDragging, setIsDragging] = useState(false); // Interaction with Camera Controls
  const [autoRotate, setAutoRotate] = useState(true);
  const [skin, setSkin] = useState<SkinType>('modern');
  
  const cameraControlsRef = useRef<CameraControls>(null);
  const earthRef = useRef<THREE.Mesh>(null);

  // Load favorites from local storage on mount
  useEffect(() => {
    const savedFavorites = localStorage.getItem('terraexplorer_favorites');
    if (savedFavorites) {
      try {
        const parsed = JSON.parse(savedFavorites);
        if (Array.isArray(parsed)) {
            // Robustly filter favorites to ensure no corrupt data crashes the app
            setFavorites(parsed.filter((f: any) => f && typeof f.lat === 'number' && typeof f.lng === 'number' && f.name));
        }
      } catch (e) {
        console.error("Failed to parse favorites", e);
      }
    }
  }, []);

  // Save favorites to local storage whenever they change
  useEffect(() => {
    localStorage.setItem('terraexplorer_favorites', JSON.stringify(favorites));
  }, [favorites]);

  // Helper to convert Lat/Lng to 3D Cartesian coordinates (Local Space)
  const latLngToVector3 = (lat: number, lng: number, radius: number = 1) => {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = (radius * Math.sin(phi) * Math.sin(theta));
    const y = (radius * Math.cos(phi));
    return new THREE.Vector3(x, y, z);
  };

  const handleGlobeClick = useCallback(async (lat: number, lng: number, point: THREE.Vector3) => {
    // When clicking empty space on the globe, fetch nearby markers but don't show full details yet
    setIsLoading(true);
    setLocationInfo(null);
    setSearchError(null);
    setAutoRotate(false); 
    setMarkers([]); // Clear previous markers immediately
    setSelectedMarkerId(null);

    // Move camera to look at area
    if (cameraControlsRef.current) {
      const direction = point.clone().normalize();
      const camPos = direction.multiplyScalar(2.2); 
      
      cameraControlsRef.current.setLookAt(
        camPos.x, camPos.y, camPos.z,
        0, 0, 0,
        true
      );
    }

    const newMarkers = await getNearbyPlaces(lat, lng);
    setMarkers(newMarkers); // Replace with new markers
    setIsLoading(false);
  }, []);

  const handleMarkerClick = useCallback(async (marker: MapMarker | FavoriteLocation, point: THREE.Vector3) => {
    // When clicking a dot, show full details
    // Populate partial info immediately for better UX
    setSearchError(null);
    setAutoRotate(false);
    setSelectedMarkerId(marker.id);
    
    // Set partial data so the panel title appears immediately
    setLocationInfo({
        name: marker.name,
        type: LocationType.POI, // Default until resolved
        description: "", // Empty description triggers content skeleton
        population: "",
        climate: "",
        funFacts: [],
        coordinates: { lat: marker.lat, lng: marker.lng },
        news: [],
        notable: []
    });

    setIsLoading(true);

    // Zoom in closer to the marker
    if (cameraControlsRef.current) {
        const worldCamPos = point.clone().normalize().multiplyScalar(1.5);
        cameraControlsRef.current.setLookAt(
            worldCamPos.x, worldCamPos.y, worldCamPos.z,
            0, 0, 0,
            true 
        );
    }

    const data = await getInfoFromCoordinates(marker.lat, marker.lng);
    setLocationInfo(data);
    setIsLoading(false);
  }, []);

  const handleSearch = async (query: string) => {
    setIsLoading(true);
    setLocationInfo(null);
    setSearchError(null);
    setAutoRotate(false); // Stop rotation
    setMarkers([]); // Clear markers on new search
    setSelectedMarkerId(null);

    const result = await resolveLocationQuery(query);
    
    if (result && result.locationInfo && result.locationInfo.coordinates) {
      const { lat, lng } = result.locationInfo.coordinates;
      
      // 1. Create a marker for the search result so the user sees where it is
      const searchMarker: MapMarker = {
        id: `search-${Date.now()}`,
        name: result.locationInfo.name,
        lat: lat,
        lng: lng,
        populationClass: 'large'
      };
      setMarkers([searchMarker]);
      setSelectedMarkerId(searchMarker.id);
      setLocationInfo(result.locationInfo);

      // 2. Calculate Positions
      // Ensure target distance doesn't get too close to minDistance (1.2)
      // Clamping minimum distance to 1.3 to avoid glitches
      const targetDist = Math.max(1.3, 3.0 - ((result.suggestedZoom / 10) * (3.0 - 1.2)));
      
      // Camera Position (zoomed out distance)
      const localCameraVec = latLngToVector3(lat, lng, targetDist);

      if (earthRef.current) {
         // Apply Earth's rotation matrix to get World Coordinates
         const worldCameraPos = localCameraVec.clone().applyMatrix4(earthRef.current.matrixWorld);

         // Move camera to look at the location from the calculated distance
         if (cameraControlsRef.current) {
          cameraControlsRef.current.setLookAt(
            worldCameraPos.x, worldCameraPos.y, worldCameraPos.z, // Camera Position
            0, 0, 0, // Target (Earth Center)
            true // Transition
          );
        }
      }
    } else {
      // Handle failed search
      setSearchError(`Could not find location: "${query}"`);
    }
    setIsLoading(false);
  };

  const handleZoomIn = () => {
    // Zooming disables auto-rotate implicitly by changing distance or triggering controls
    if (cameraControlsRef.current) {
      cameraControlsRef.current.dolly(1, true);
    }
  };

  const handleZoomOut = () => {
    if (cameraControlsRef.current) {
      cameraControlsRef.current.dolly(-1, true);
    }
  };

  const handleClosePanel = () => {
    setLocationInfo(null);
    setSelectedMarkerId(null);
  };

  const handleToggleFavorite = () => {
    if (!locationInfo || !locationInfo.coordinates) return;

    const exists = favorites.find(f => f.name === locationInfo.name && Math.abs(f.lat - locationInfo.coordinates.lat) < 0.01);
    
    if (exists) {
      setFavorites(prev => prev.filter(f => f.id !== exists.id));
    } else {
      const newFav: FavoriteLocation = {
        id: `fav-${Date.now()}`,
        name: locationInfo.name,
        lat: locationInfo.coordinates.lat,
        lng: locationInfo.coordinates.lng
      };
      setFavorites(prev => [...prev, newFav]);
    }
  };

  const handleLoadMoreNews = useCallback(async () => {
    if (!locationInfo) return;
    
    const currentHeadlines = locationInfo.news.map(n => n.headline);
    const newNews = await getMoreNews(locationInfo.name, currentHeadlines);
    
    setLocationInfo(prev => {
       if(!prev) return null;
       // Filter duplicates by headline
       const uniqueNewNews = newNews.filter(n => !prev.news.some(pn => pn.headline === n.headline));
       return {
          ...prev,
          news: [...prev.news, ...uniqueNewNews]
       }
    });
  }, [locationInfo]);

  // Safe check using optional chaining for coordinates
  // This prevents crash if coordinates are missing or favorites array has corrupt entries
  const isCurrentLocationFavorite = locationInfo && locationInfo.coordinates 
    ? favorites.some(f => f && typeof f.lat === 'number' && f.name === locationInfo.name && Math.abs(f.lat - locationInfo.coordinates.lat) < 0.01) 
    : false;

  // Dynamic Styles based on skin
  const getHeaderStyle = () => {
    switch (skin) {
      case 'retro-green': return 'text-green-300 font-retro tracking-widest';
      case 'retro-amber': return 'text-amber-300 font-retro tracking-widest';
      default: return 'text-white brand-font tracking-tighter';
    }
  };

  const getSubheaderStyle = () => {
    switch (skin) {
      case 'retro-green': return 'text-green-400/80 font-retro';
      case 'retro-amber': return 'text-amber-400/80 font-retro';
      default: return 'text-gray-300 font-mono tracking-widest';
    }
  };

  return (
    <div className={`relative w-full h-screen bg-black overflow-hidden`}>
      {/* 3D Scene */}
      <Canvas camera={{ position: [0, 0, 3], fov: 45 }}>
        {/* Cinematic Lighting Setup */}
        <ambientLight intensity={skin === 'modern' ? 0.4 : 1.5} color={skin === 'modern' ? "#ccccff" : "#ffffff"} />
        
        {/* Dynamic Sun that follows camera */}
        <Sun skin={skin} />

        {skin === 'modern' && (
           <pointLight position={[-10, 0, -5]} intensity={1.0} color="#0044ff" distance={20} />
        )}
        
        <Stars radius={300} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        
        <Earth 
          ref={earthRef}
          onLocationClick={handleGlobeClick} 
          onMarkerClick={handleMarkerClick}
          isInteracting={isInteracting}
          setIsInteracting={setIsInteracting}
          autoRotate={autoRotate}
          skin={skin}
          boundary={locationInfo?.boundary}
          markers={markers}
          favorites={favorites}
          showFavorites={showFavorites}
          selectedMarkerId={selectedMarkerId}
        />
        
        <CameraControls 
          ref={cameraControlsRef} 
          minDistance={1.2} 
          maxDistance={5}
          smoothTime={0.8}
          onStart={() => {
            setIsDragging(true);
            setAutoRotate(false);
          }}
          onEnd={() => {
            setIsDragging(false);
          }}
        />

        <RotationManager 
          isDragging={isDragging} 
          autoRotate={autoRotate} 
          setAutoRotate={setAutoRotate} 
        />
      </Canvas>

      {/* Retro Effect Overlay */}
      {skin !== 'modern' && <div className="scanlines"></div>}

      {/* UI Overlay */}
      <div className="absolute top-8 left-8 z-10 pointer-events-none">
        <h1 className={`text-4xl font-bold drop-shadow-lg ${getHeaderStyle()}`}>
          TERRA<span className={skin === 'modern' ? 'text-cyan-400' : ''}>EXPLORER</span>
        </h1>
        <p className={`text-sm mt-1 drop-shadow-md ${getSubheaderStyle()}`}>
          KNOWLEDGE ENGINE
        </p>
      </div>

      {/* Skin Selector */}
      <div className="absolute top-8 right-8 z-30 flex gap-2">
        <button 
          onClick={() => setSkin('modern')}
          className={`px-3 py-1 text-xs rounded-full border transition-all ${
            skin === 'modern' ? 'bg-cyan-500 text-black border-cyan-500 font-bold' : 'bg-black/50 text-white/50 border-white/20 hover:border-white/50'
          }`}
        >
          MODERN
        </button>
        <button 
          onClick={() => setSkin('retro-green')}
          className={`px-3 py-1 text-xs rounded-none border transition-all font-mono ${
            skin === 'retro-green' ? 'bg-green-400 text-black border-green-400 font-bold' : 'bg-black/50 text-green-400/50 border-green-400/20 hover:border-green-400/50'
          }`}
        >
          CRT-G
        </button>
         <button 
          onClick={() => setSkin('retro-amber')}
          className={`px-3 py-1 text-xs rounded-none border transition-all font-mono ${
            skin === 'retro-amber' ? 'bg-amber-400 text-black border-amber-400 font-bold' : 'bg-black/50 text-amber-400/50 border-amber-400/20 hover:border-amber-400/50'
          }`}
        >
          CRT-A
        </button>
      </div>

      <InfoPanel 
        info={locationInfo} 
        isLoading={isLoading} 
        onClose={handleClosePanel} 
        skin={skin}
        isFavorite={isCurrentLocationFavorite}
        onToggleFavorite={handleToggleFavorite}
        onLoadMoreNews={handleLoadMoreNews}
      />

      <Controls 
        onSearch={handleSearch} 
        onZoomIn={handleZoomIn} 
        onZoomOut={handleZoomOut}
        isSearching={isLoading}
        searchError={searchError}
        skin={skin}
        showFavorites={showFavorites}
        onToggleShowFavorites={() => setShowFavorites(!showFavorites)}
      />
    </div>
  );
};

export default App;
