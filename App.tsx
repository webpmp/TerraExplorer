
import React, { useState, useRef, useCallback, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { ChevronDown, Loader2 } from 'lucide-react';

import Earth from './components/Earth';
import InfoPanel from './components/InfoPanel';
import Controls from './components/Controls';
import FavoritesPanel from './components/FavoritesPanel';
import SettingsPanel from './components/SettingsPanel';
import { LocationInfo, SkinType, MapMarker, FavoriteLocation, LocationType, Waypoint, GeoCoordinates, UserSettings, AIProvider, NewsProvider } from './types';
import { getInfoFromFeature, getNearbyPlaces, generateRoute, extractEntityFromQuery, routeIntentAndExtractEntity, EnrichmentMetrics, cancelFeatureInfoRequests } from './services/geminiService';
import { getEstimatedClimate } from './services/geographic/climateEstimator';
import { enrichLocationInfo, mergeLocationInfo, fetchAndValidateLocationNews } from './services/locationService';
import { resolveGeographicMetadata } from './services/geographic/geographicResolver';
import { logWaypointSnapshot } from './utils/pipelineDebug';
import { fetchLiveNews } from './services/newsService';
import { runSearchPipeline } from './services/pipeline';
import { ENTITY_SCHEMAS } from './entitySchema';
import logoImageBlack from './assets/logo-terra-explorer-black.png';
import logoImageGreen from './assets/logo-terra-explorer-green.png';
import logoImageAmber from './assets/logo-terra-explorer-amber.png';
import { calculateClampedZoomDelta, normalizeWheelDelta } from './utils/cameraZoomUtils';

// Helper to convert Lat/Lng to 3D Cartesian coordinates (Local Space)
const latLngToVector3 = (lat: number, lng: number, radius: number = 1) => {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = (radius * Math.sin(phi) * Math.sin(theta));
  const y = (radius * Math.cos(phi));
  return new THREE.Vector3(x, y, z);
};

// Helper for distance measurement (Haversine formula in km)
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; 
};

const PARCHMENT_DEFAULT_DISTANCE = 3.0;
const DISTANCE_EPSILON = 0.01;


const CameraAnimator: React.FC<{
  targetPosRef: React.MutableRefObject<THREE.Vector3 | null>;
  cameraControlsRef: React.RefObject<any>;
  cameraStateRef: React.MutableRefObject<any>;
  activeScanIdRef: React.MutableRefObject<number>;
}> = ({ targetPosRef, cameraControlsRef, cameraStateRef, activeScanIdRef }) => {
  const animStartTimeRef = useRef<number>(0);

  useFrame(({ camera }) => {
    if (targetPosRef.current && cameraControlsRef.current) {
        if (!animStartTimeRef.current) {
          animStartTimeRef.current = Date.now();
        }

        camera.position.lerp(targetPosRef.current, 0.08);
        cameraControlsRef.current.update(); // Update controls to reflect new position
        
        const dist = camera.position.distanceTo(targetPosRef.current);
        const timedOut = Date.now() - animStartTimeRef.current > 1200;

        if (dist < 0.05 || timedOut) {
            targetPosRef.current = null;
            animStartTimeRef.current = 0;
            if (cameraStateRef.current) {
                cameraStateRef.current.targetRotation = null;
            }
            console.log(`[Camera] DISCOVERY_POSITIONING_COMPLETE discoveryId=${activeScanIdRef.current}`);
        }
    } else {
        animStartTimeRef.current = 0;
    }
  });
  return null;
};

const AuthoritativeCameraEnforcer: React.FC<{
  skin: SkinType;
  cameraControlsRef: React.RefObject<any>;
  targetCameraPosRef: React.MutableRefObject<THREE.Vector3 | null>;
  isSidebarOpen: boolean;
  cameraStateRef: React.MutableRefObject<any>;
  parchmentZoom: number;
}> = ({ skin, cameraControlsRef, targetCameraPosRef, isSidebarOpen, cameraStateRef, parchmentZoom }) => {
  useFrame(() => {
    if (!cameraControlsRef.current) return;
    const controls = cameraControlsRef.current;
    const camera = controls.object;
    
    const cameraState = cameraStateRef.current;
    
    // Single Source of Truth for Authoritative Distance
    let authoritativeDistance = 4.5;
    if (skin === 'parchment') {
       const aspect = window.innerWidth / window.innerHeight;
       const baseDistance = aspect <= 1.28985 ? 3.0 : (3.0 * 1.28985) / aspect;
       const effectiveParchmentZoom = Math.max(0.375, Math.min(50.0, parchmentZoom));
       authoritativeDistance = Math.max(1.018, Math.min(8.0, baseDistance / effectiveParchmentZoom));
    } else {
       if (cameraState.activeRoute) {
          authoritativeDistance = cameraState.routeSuggestedDistance;
       } else {
          authoritativeDistance = cameraState.themeSuggestedDistance;
       }
    }
    
    // Protect against NaN
    if (isNaN(authoritativeDistance) || authoritativeDistance <= 0) {
        authoritativeDistance = 4.5;
    }
    
    // Maintain distance magnitude along camera's current view vector
    const currentDist = camera.position.length();
    if (currentDist > 0.001 && Math.abs(currentDist - authoritativeDistance) > 0.01) {
        camera.position.normalize().multiplyScalar(authoritativeDistance);
    }
    
    if (targetCameraPosRef.current && targetCameraPosRef.current.lengthSq() > 0.0001) {
       targetCameraPosRef.current.normalize().multiplyScalar(authoritativeDistance);
    }
  });
  return null;
};

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
      intensity={skin === 'modern' || skin === 'parchment' ? 2.5 : 3.0} 
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
  onZoomChange: (isZoomedOut: boolean) => void;
  disabled: boolean;
}> = ({ isDragging, autoRotate, setAutoRotate, onZoomChange, disabled }) => {
  const wasZoomedOutRef = useRef(true);

  useFrame(({ camera }) => {
    const dist = camera.position.length();
    // Max distance is 8. Consider zoomed out when close to max.
    const isZoomedOut = dist > 7.0;
    
    if (wasZoomedOutRef.current !== isZoomedOut) {
      onZoomChange(isZoomedOut);
      wasZoomedOutRef.current = isZoomedOut;
    }

    if (isDragging) return;
    
    // Check if we are at max distance (zoomed all the way out)
    // If user zooms out to ~7.5 units (max is 8), resume rotation
    // We prioritize this over 'disabled' status if the user intentionally zooms out far enough
    if (dist > 7.5 && !autoRotate) {
      setAutoRotate(true);
      return;
    }

    if (disabled) return;
  });
  return null;
};

// Visibility Tracker: checks if the current selected location is visible to the camera
const VisibilityTracker: React.FC<{ 
  location: LocationInfo | null, 
  onVisibilityChange: (visible: boolean) => void 
}> = ({ location, onVisibilityChange }) => {
  const wasVisible = useRef<boolean | null>(null);

  useFrame(({ camera }) => {
    if (!location || !location.coordinates) {
        return;
    }

    // Calculate Visibility
    const vec = latLngToVector3(location.coordinates.lat, location.coordinates.lng);
    const cameraDir = camera.position.clone().normalize();
    const dot = vec.clone().normalize().dot(cameraDir);
    
    // Horizon culling approximation
    // Point visible if dot > 1/dist approximately (for sphere R=1)
    const dist = camera.position.length();
    // Safety buffer of 0.05 to ensure it's not flickering on the exact edge
    const limit = (1 / dist) - 0.05; 
    
    const isVisible = dot > limit;
    
    if (wasVisible.current !== isVisible) {
        wasVisible.current = isVisible;
        onVisibilityChange(isVisible);
    }
  });
  return null;
};



const App: React.FC = () => {
  const [worldDimensions, setWorldDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  const [parchmentZoom, setParchmentZoom] = useState(1.0);
  const currentParchmentZoomRef = useRef<number>(1.0);
  const targetParchmentZoomRef = useRef<number>(1.0);
  const parchmentZoomAnimRef = useRef<number | null>(null);
  
  const activeScanIdRef = useRef<number>(0);
  const scanResolvedRef = useRef<boolean>(false);
  const scanStatusRef = useRef<string | null>(null);
  const scanFullyProcessedRef = useRef<boolean>(false);
  const [scanningArea, setScanningArea] = useState<GeoCoordinates | null>(null);
  const [isScanningArea, setIsScanningArea] = useState(false);
  const [scanningStatusText, setScanningStatusText] = useState<string | null>(null);
  
  const activeMarkerRequestRef = useRef<number>(0);
  const processingMarkerRef = useRef<string | null>(null);
  const isManualControlActiveRef = useRef<boolean>(false);

  useEffect(() => {
    const handleResize = () => {
      setWorldDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const animateParchmentZoom = useCallback(() => {
     const currentZoom = currentParchmentZoomRef.current;
     const clampedTarget = Math.max(0.375, Math.min(50.0, targetParchmentZoomRef.current));
     targetParchmentZoomRef.current = clampedTarget;
     const diff = clampedTarget - currentZoom;
     
     if (Math.abs(diff) < 0.001) {
        currentParchmentZoomRef.current = clampedTarget;
        setParchmentZoom(clampedTarget);
        parchmentZoomAnimRef.current = null;
        return;
     }
     
     const nextZoom = currentZoom + diff * 0.08; // Buttery smooth 0.08 smoothing factor
     const clampedNextZoom = Math.max(0.375, Math.min(50.0, nextZoom));
     currentParchmentZoomRef.current = clampedNextZoom;
     setParchmentZoom(clampedNextZoom);
     
     parchmentZoomAnimRef.current = requestAnimationFrame(animateParchmentZoom);
  }, []);


  const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(null);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [favorites, setFavorites] = useState<FavoriteLocation[]>([]);
  
  // Favorites UI State
  const [isFavoritesPanelOpen, setIsFavoritesPanelOpen] = useState(false);
  const [visibleFavoriteIds, setVisibleFavoriteIds] = useState<string[]>([]);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [userSettings, setUserSettings] = useState<UserSettings>(() => {
    const saved = localStorage.getItem('terraExplorerSettings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.newsProvider === 'gemini') parsed.newsProvider = 'nyt';
        return parsed;
      } catch (e) {
        // Ignore
      }
    }
    return {
      aiProvider: 'gemini',
      lmStudioUrl: 'http://localhost:1234/v1',
      lmStudioModel: 'local-model',
      newsProvider: 'nyt',
      newsApiKey: '',
      nytApiKey: '',
      newsDataApiKey: ''
    };
  });

  const handleUpdateSettings = useCallback((newSettings: UserSettings) => {
    setUserSettings(newSettings);
    localStorage.setItem('terraExplorerSettings', JSON.stringify(newSettings));
  }, []);

  // Route State
  const [routeWaypoints, setRouteWaypoints] = useState<Waypoint[]>([]);
  const [currentWaypointIndex, setCurrentWaypointIndex] = useState<number>(-1);
  const [isTraceModalOpen, setIsTraceModalOpen] = useState(false);

  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [selectedMarkerCoordinates, setSelectedMarkerCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(false); // Controls input search / discovery scan spinner
  const [isInfoPanelLoading, setIsInfoPanelLoading] = useState(false); // Controls InfoPanel enrichment skeleton
  const [isNewsFetching, setIsNewsFetching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isInteracting, setIsInteracting] = useState(false); // Interaction with Earth mesh
  const [isDragging, setIsDragging] = useState(false); // Interaction with Camera Controls
  const [autoRotate, setAutoRotate] = useState(true);
  const [skin, setSkin] = useState<SkinType>('modern');
  const [isZoomedOut, setIsZoomedOut] = useState(true);
  const [isLocationVisible, setIsLocationVisible] = useState(true);
  const [isZoomLocked, setIsZoomLocked] = useState(false);
  const [lockedZoomDistance, setLockedZoomDistance] = useState<number | null>(null);
  

  const currentCameraDistanceRef = useRef(4.5);

  const cameraStateRef = useRef({
      mode: 'route' as 'route' | 'theme',
      theme: 'modern' as SkinType,
      activeRoute: null as string | null,
      routeSuggestedDistance: 2.0,
      themeSuggestedDistance: 4.5,
      targetRotation: null as { lat: number; lng: number } | null
  });

  const updateCameraDistance = useCallback((dist: number) => {
    currentCameraDistanceRef.current = dist;
    cameraStateRef.current.themeSuggestedDistance = dist;
    cameraStateRef.current.routeSuggestedDistance = dist;
  }, []);

  const previousGeoCenterRef = useRef<{ lat: number; lng: number }>({ lat: 0, lng: 0 });

  const updateAuthoritativeCamera = useCallback((lat: number, lng: number, distance: number) => {
    // Normalize longitude to [-180, 180]
    let normalizedLng = ((lng + 180) % 360 + 360) % 360 - 180;
    const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));

    const prevLat = previousGeoCenterRef.current.lat;
    const prevLng = previousGeoCenterRef.current.lng;
    const deltaLat = clampedLat - prevLat;
    const deltaLng = ((normalizedLng - prevLng + 540) % 360) - 180;

    console.log(`[Camera Sync] OSM_ABSOLUTE_CENTER lat=${clampedLat.toFixed(4)} lng=${normalizedLng.toFixed(4)}`);
    console.log(`[Camera Sync] PREVIOUS_CENTER lat=${prevLat.toFixed(4)} lng=${prevLng.toFixed(4)}`);
    console.log(`[Camera Sync] DELTA lat=${deltaLat.toFixed(4)} lng=${deltaLng.toFixed(4)}`);
    console.log(`[Camera Sync] GLOBE_TARGET lat=${clampedLat.toFixed(4)} lng=${normalizedLng.toFixed(4)}`);
    console.log(`[Camera Sync] MODE=ABSOLUTE_TARGET`);
    console.log(`[Camera] GEO_CENTER lat=${clampedLat.toFixed(4)} lng=${normalizedLng.toFixed(4)} distance=${distance.toFixed(4)}`);

    previousGeoCenterRef.current = { lat: clampedLat, lng: normalizedLng };

    const localCameraVec = latLngToVector3(clampedLat, normalizedLng, distance);
    let worldCameraPos = localCameraVec;
    if (earthRef.current) {
      worldCameraPos = localCameraVec.clone().applyMatrix4(earthRef.current.matrixWorld);
    }

    if (cameraControlsRef.current) {
      const controls = cameraControlsRef.current;
      const cam = controls.object;
      cam.position.copy(worldCameraPos);
      cam.lookAt(0, 0, 0);
      controls.target.set(0, 0, 0);
      if (controls.sphericalDelta) {
        controls.sphericalDelta.set(0, 0, 0);
      }
      controls.update();
    }
    
    // Cancel any running manual zoom animation to avoid conflicting camera updates
    if (zoomAnimRef.current) {
      cancelAnimationFrame(zoomAnimRef.current);
      zoomAnimRef.current = null;
    }
    targetZoomRef.current = null;

    if (cameraStateRef.current) {
      cameraStateRef.current.themeSuggestedDistance = distance;
      cameraStateRef.current.routeSuggestedDistance = distance;
    }
    currentCameraDistanceRef.current = distance;

    if (skin === 'parchment') {
      const aspect = window.innerWidth / window.innerHeight;
      const baseDistance = aspect <= 1.28985 ? 3.0 : (3.0 * 1.28985) / aspect;
      const syncZoom = Math.max(0.375, Math.min(50.0, baseDistance / Math.max(1.018, distance)));
      currentParchmentZoomRef.current = syncZoom;
      targetParchmentZoomRef.current = syncZoom;
      setParchmentZoom(syncZoom);
    }
  }, [skin]);

  const programmaticTransitionUntilRef = useRef<number>(0);

  const reconcileCameraState = useCallback(() => {
     if (!cameraControlsRef.current) return;
     
     // Cancel manual zoom animations on programmatic transitions
     targetZoomRef.current = null;
     if (zoomAnimRef.current) {
        cancelAnimationFrame(zoomAnimRef.current);
        zoomAnimRef.current = null;
     }

     programmaticTransitionUntilRef.current = Date.now() + 1500;

     const cameraState = cameraStateRef.current;

     const isSidebarOpen = !!locationInfo || routeWaypoints.length > 0 || isFavoritesPanelOpen;

     // Only allow target rotation updates
     if (cameraState.targetRotation && earthRef.current) {
        const { lat, lng } = cameraState.targetRotation;
        
        let targetDistance = 4.5;
        if (skin === 'parchment') {
           const aspect = window.innerWidth / window.innerHeight;
           const baseDistance = aspect <= 1.28985 ? 3.0 : (3.0 * 1.28985) / aspect;
           const effectiveParchmentZoom = Math.max(0.375, Math.min(50.0, parchmentZoom));
           targetDistance = Math.max(1.018, Math.min(8.0, baseDistance / effectiveParchmentZoom));
        } else if (cameraState.activeRoute) {
           targetDistance = cameraState.routeSuggestedDistance;
        } else {
           targetDistance = cameraState.themeSuggestedDistance;
        }
        
        const localCameraVec = latLngToVector3(lat, lng, targetDistance);
        const worldCameraPos = localCameraVec.clone().applyMatrix4(earthRef.current.matrixWorld);
        targetCameraPosRef.current = worldCameraPos;
        // Consume target rotation immediately so it executes as a strict one-shot command
        cameraState.targetRotation = null;
     }
  }, [skin, locationInfo, routeWaypoints.length, parchmentZoom]);

  const handleSkinChange = useCallback((newSkin: SkinType) => {
     cameraStateRef.current.theme = newSkin;
     setSkin(newSkin);
      setParchmentZoom(1.0); // Reset parchment zoom on theme change
      currentParchmentZoomRef.current = 1.0;
      targetParchmentZoomRef.current = 1.0;
      if (parchmentZoomAnimRef.current) {
         cancelAnimationFrame(parchmentZoomAnimRef.current);
         parchmentZoomAnimRef.current = null;
      }

     // Reset standard zoom references as well
     targetZoomRef.current = null;
     if (zoomAnimRef.current) {
        cancelAnimationFrame(zoomAnimRef.current);
        zoomAnimRef.current = null;
     }

     if (newSkin === 'parchment') {
        cameraStateRef.current.mode = 'theme';
     } else {
        cameraStateRef.current.mode = 'route';
        setIsZoomLocked(false);
        setLockedZoomDistance(null);
     }
     
     // Compute target rotation synchronously
     reconcileCameraState();
  }, [reconcileCameraState]);
  
  const handleCycleSkin = useCallback(() => {
    const skins: SkinType[] = ['modern', 'retro-green', 'retro-amber', 'parchment'];
    const nextIndex = (skins.indexOf(skin) + 1) % skins.length;
    handleSkinChange(skins[nextIndex]);
  }, [skin, handleSkinChange]);
  

  
  // Track focus state to manage suggestions pausing
  const [isFocused, setIsFocused] = useState(false);
  
  type InteractionStateType = 'GLOBE_IDLE' | 'GLOBE_SEARCHING' | 'PINS_RENDERED' | 'PIN_SELECTED';
  const [interactionState, setInteractionState] = useState<InteractionStateType>('GLOBE_IDLE');
  
  const cameraControlsRef = useRef<any>(null);
  const earthRef = useRef<THREE.Mesh>(null);
  const userModifiedZoomRef = useRef(false);
  const zoomAnimRef = useRef<number | null>(null);
  const targetZoomRef = useRef<number | null>(null);

  const targetCameraPosRef = useRef<THREE.Vector3 | null>(null);

  const animateCameraTo = useCallback((worldCameraPos: THREE.Vector3) => {
      // With OrbitControls we just lerp the position in a generic frame loop
      targetCameraPosRef.current = worldCameraPos.clone();
  }, []);

  // Load favorites from local storage on mount
  useEffect(() => {
    const savedFavorites = localStorage.getItem('terraexplorer_favorites');
    if (savedFavorites) {
      try {
        const parsed = JSON.parse(savedFavorites);
        if (Array.isArray(parsed) && parsed.length > 0) {
            // Robustly filter favorites to ensure no corrupt data crashes the app
            setFavorites(parsed.filter((f: any) => f && typeof f.lat === 'number' && typeof f.lng === 'number' && f.name));
            return;
        }
      } catch (e) {
        console.error("Failed to parse favorites", e);
      }
    }

    // Default routes if nothing in local storage
    const shackletonRoute: FavoriteLocation = {
        id: 'default-shackleton',
        name: "Ernest Shackleton's Endurance Expedition",
        lat: 50.3755,
        lng: -4.1427,
        type: 'route',
        waypoints: [
            { 
                id: 'wp-shackleton-1', 
                name: "Plymouth, England", 
                lat: 50.3755, 
                lng: -4.1427, 
                context: "August 8, 1914: The Endurance departs for Buenos Aires.", 
                description: "Plymouth served as the final departure point in Great Britain for Ernest Shackleton's Imperial Trans-Antarctic Expedition aboard the Endurance. Departing on the eve of World War I after Winston Churchill authorized the journey to proceed, the expedition aimed to achieve the first land crossing of Antarctica.",
                routeTitle: "Endurance Expedition" 
            },
            { 
                id: 'wp-shackleton-2', 
                name: "Buenos Aires, Argentina", 
                lat: -34.6037, 
                lng: -58.3816, 
                context: "October 9, 1914: The ship arrives to pick up supplies and crew.", 
                description: "Buenos Aires was the primary South American staging ground for the Endurance. Here the expedition completed final outfitting, took on vital cold-weather supplies, and recruited photographer Frank Hurley and stowaway Perce Blackborow before heading into the Southern Ocean.",
                routeTitle: "Endurance Expedition" 
            },
            { 
                id: 'wp-shackleton-3', 
                name: "Grytviken, South Georgia", 
                lat: -54.2811, 
                lng: -36.5092, 
                context: "December 5, 1914: The expedition departs the whaling station for the Weddell Sea.", 
                description: "Grytviken was a remote Norwegian whaling station on South Georgia Island. Whalers warned Shackleton of unusually heavy pack ice further south in the Weddell Sea, advice that prompted a month-long delay while the crew waited for favorable sea ice conditions.",
                routeTitle: "Endurance Expedition" 
            },
            { 
                id: 'wp-shackleton-4', 
                name: "Weddell Sea (Ice Trap)", 
                lat: -76.5, 
                lng: -35.0, 
                context: "January 1915: The Endurance becomes frozen fast in the pack ice.", 
                description: "Deep in the Weddell Sea, the Endurance encountered impassable pack ice and was frozen solid into an ice floe just miles from the Antarctic mainland. For ten months the ship drifted helplessly northward with the ice floe in sub-zero polar conditions.",
                routeTitle: "Endurance Expedition" 
            },
            { 
                id: 'wp-shackleton-5', 
                name: "Endurance Sinks", 
                lat: -69.08, 
                lng: -51.5, 
                context: "November 21, 1915: Crushed by ice, the ship sinks, stranding the crew.", 
                description: "Under enormous pressure from shifting pack ice, the hull of the Endurance was crushed beyond repair. Shackleton ordered the crew to abandon ship, salvaging food, dog teams, and three wooden lifeboats before the ship slipped beneath the icy waters.",
                routeTitle: "Endurance Expedition" 
            },
            { 
                id: 'wp-shackleton-6', 
                name: "Elephant Island", 
                lat: -61.1417, 
                lng: -55.2333, 
                context: "April 1916: The crew reaches solid land for the first time in 497 days.", 
                description: "After perilous open-boat navigation through turbulent Antarctic seas, the 28 exhausted crew members landed on the desolate spit of Elephant Island. It marked their first footing on solid ground in over sixteen months, though rescue remained thousands of miles away.",
                routeTitle: "Endurance Expedition" 
            },
            { 
                id: 'wp-shackleton-7', 
                name: "King Haakon Bay", 
                lat: -54.1500, 
                lng: -37.2333, 
                context: "May 1916: Shackleton and five men land after the perilous voyage of the James Caird.", 
                description: "In one of history's greatest feats of small-boat navigation, Shackleton and five companions sailed 800 miles across the treacherous Drake Passage in the 22-foot James Caird lifeboat, making a miraculous landing on the uninhabited southern coast of South Georgia.",
                routeTitle: "Endurance Expedition" 
            },
            { 
                id: 'wp-shackleton-8', 
                name: "Stromness Whaling Station", 
                lat: -54.1600, 
                lng: -36.7110, 
                context: "May 20, 1916: Shackleton, Worsley, and Crean reach safety after crossing the mountains.", 
                description: "Lacking climbing equipment, Shackleton, Frank Worsley, and Tom Crean trekked non-stop across South Georgia's uncharted glaciers and alpine ridges for 36 hours, finally reaching the managers at Stromness Whaling Station to organize rescue operations.",
                routeTitle: "Endurance Expedition" 
            },
             { 
                id: 'wp-shackleton-9', 
                name: "Punta Arenas, Chile", 
                lat: -53.1638, 
                lng: -70.9171, 
                context: "August 30, 1916: The tug Yelcho, commanded by Luis Pardo, finally rescues the remaining crew from Elephant Island.", 
                description: "From Punta Arenas, Shackleton mounted four rescue attempts before securing the Chilean steam tug Yelcho under Captain Luis Pardo. They successfully breached the winter ice at Elephant Island, rescuing all 22 stranded crewmen without a single loss of life.",
                routeTitle: "Endurance Expedition" 
            }
        ]
    };

    const genghisRoute: FavoriteLocation = {
        id: 'default-genghis',
        name: "The Campaigns of Genghis Khan",
        lat: 48.9, 
        lng: 109.0,
        type: 'route',
        waypoints: [
            {
                id: 'wp-genghis-1',
                name: "Burkhan Khaldun (Mongolia)",
                lat: 48.9,
                lng: 109.0,
                context: "1206: Temüjin unites the Mongol tribes and is proclaimed Genghis Khan.",
                description: "Burkhan Khaldun is a sacred mountain in northeastern Mongolia where Temüjin sought spiritual refuge in his youth. Following decades of inter-tribal warfare, he convened a grand kurultai here in 1206, uniting the nomadic confederations and proclaiming the Mongol Empire.",
                routeTitle: "Campaigns of Genghis Khan"
            },
            {
                id: 'wp-genghis-2',
                name: "Yinchuan (Western Xia)",
                lat: 38.4872,
                lng: 106.2309,
                context: "1209: The Mongols force the Western Xia emperor to submit.",
                description: "Yinchuan was the fortified capital of the Tangut Western Xia dynasty. In 1209, Genghis Khan launched his first major external campaign, surrounding the capital and diverting the Yellow River to breach defenses, successfully forcing Western Xia into tribute and vassalage.",
                routeTitle: "Campaigns of Genghis Khan"
            },
            {
                id: 'wp-genghis-3',
                name: "Zhongdu (Beijing)",
                lat: 39.9042,
                lng: 116.4074,
                context: "1215: The Jin capital is captured and sacked after a long siege.",
                description: "Zhongdu was the formidable northern capital of the Jurchen Jin dynasty. The Mongol army laid siege to the city in 1214, cutting off supply lines and capturing the metropolis in 1215, giving the Mongols complete strategic dominance over the North China Plain.",
                routeTitle: "Campaigns of Genghis Khan"
            },
            {
                id: 'wp-genghis-4',
                name: "Balasagun",
                lat: 42.746,
                lng: 75.25,
                context: "1218: General Jebe conquers the Qara Khitai empire.",
                description: "Balasagun was an ancient Silk Road trading center in modern Kyrgyzstan. In 1218, Mongol general Jebe pursued the usurper Kuchlug, granting religious freedom to the local Muslim population and annexing the vast Qara Khitai realm without prolonged bloodshed.",
                routeTitle: "Campaigns of Genghis Khan"
            },
            {
                id: 'wp-genghis-5',
                name: "Otrar",
                lat: 42.85,
                lng: 68.3,
                context: "1219: The Khwarazmian governor executes Mongol envoys, triggering invasion.",
                description: "Otrar was a key commercial oasis on the Silk Road along the Syr Darya. When its governor executed a 500-camel Mongol trade delegation, Genghis Khan retaliated with a massive western expedition, besieging and destroying the city in a five-month siege.",
                routeTitle: "Campaigns of Genghis Khan"
            },
            {
                id: 'wp-genghis-6',
                name: "Bukhara",
                lat: 39.7681,
                lng: 64.4556,
                context: "1220: Genghis Khan captures the city and addresses the populace in the mosque.",
                description: "Bukhara was one of the intellectual and spiritual capitals of the Islamic Golden Age. Genghis Khan led a surprise attack across the Kyzylkum Desert, capturing the city and assembling the civic leaders in the Great Mosque before advancing along the Zeravshan Valley.",
                routeTitle: "Campaigns of Genghis Khan"
            },
            {
                id: 'wp-genghis-7',
                name: "Samarkand",
                lat: 39.6542,
                lng: 66.9597,
                context: "1220: The capital of the Khwarazmian Empire falls.",
                description: "Samarkand was the grand, heavily fortified imperial capital of the Khwarazmian Empire. Despite formidable walls and war elephants, the city fell within days under coordinated Mongol assaults and advanced Chinese siege engineers.",
                routeTitle: "Campaigns of Genghis Khan"
            },
             {
                id: 'wp-genghis-8',
                name: "Indus River",
                lat: 33.9,
                lng: 72.2,
                context: "1221: Genghis Khan defeats Jalal ad-Din Mingburnu on the banks of the Indus.",
                description: "At the Battle of the Indus, Genghis Khan surrounded the last Khwarazmian ruler, Jalal ad-Din. After a desperate last stand, Jalal ad-Din galloped his stallion off a steep cliff into the swollen river, escaping to India while Genghis Khan ordered his archers to spare his life in tribute to his valor.",
                routeTitle: "Campaigns of Genghis Khan"
            },
            {
                id: 'wp-genghis-9',
                name: "Liupan Mountains",
                lat: 35.6,
                lng: 106.2,
                context: "1227: Genghis Khan dies during the final campaign against Western Xia.",
                description: "The cool highlands of the Liupan Mountains in northwestern China served as the summer headquarters for Genghis Khan's final punitive campaign against Western Xia. The great conqueror passed away here in August 1227, leaving an empire spanning from the Pacific to the Caspian.",
                routeTitle: "Campaigns of Genghis Khan"
            }
        ]
    };

    const lewisClarkRoute: FavoriteLocation = {
        id: 'default-lewisclark',
        name: "Lewis and Clark Expedition",
        lat: 38.8027,
        lng: -90.1012,
        type: 'route',
        waypoints: [
            {
                id: 'wp-lc-1',
                name: "Camp Dubois",
                lat: 38.802722,
                lng: -90.10125,
                context: "May 14, 1804: The Corps of Discovery departs their winter camp to begin the journey up the Missouri.",
                description: "Camp Dubois in Illinois served as the winter training and staging base for the Corps of Discovery. Meriwether Lewis and William Clark trained soldiers, gathered equipment, and finalized navigation instruments before launching their expedition up the Missouri River.",
                routeTitle: "Lewis and Clark Expedition"
            },
            {
                id: 'wp-lc-2',
                name: "St. Charles",
                lat: 38.7758,
                lng: -90.4851,
                context: "May 16-21, 1804: The expedition makes final preparations and recruits the last crew members.",
                description: "St. Charles was the last major European-American settlement on the Missouri River. The expedition paused here for several days to recruit experienced French-Canadian boatmen, adjust cargo balances, and wait for Captain Lewis to arrive from St. Louis.",
                routeTitle: "Lewis and Clark Expedition"
            },
            {
                id: 'wp-lc-3',
                name: "Kaw Point",
                lat: 39.117,
                lng: -94.606,
                context: "June 26, 1804: The explorers reach the confluence of the Kansas and Missouri rivers.",
                description: "Kaw Point, situated at the junction of the Kansas and Missouri rivers in modern-day Kansas City, provided a strategic rest stop where Clark took celestial observations and the crew repaired their keelboat and pirogues.",
                routeTitle: "Lewis and Clark Expedition"
            },
            {
                id: 'wp-lc-4',
                name: "Sergeant Floyd Monument",
                lat: 42.4631,
                lng: -96.3838,
                context: "August 20, 1804: Sergeant Charles Floyd dies of appendicitis, the expedition's only fatality.",
                description: "On a high bluff overlooking the Missouri River near present-day Sioux City, Sergeant Charles Floyd succumbed to probable appendicitis. He was buried with military honors, remaining the sole fatality of the entire two-and-a-half-year transcontinental expedition.",
                routeTitle: "Lewis and Clark Expedition"
            },
            {
                id: 'wp-lc-5',
                name: "Council Bluff",
                lat: 41.434,
                lng: -96.009,
                context: "August 3, 1804: Lewis and Clark hold their first formal council with the Oto and Missouri tribes.",
                description: "Council Bluff in eastern Nebraska was the site of the expedition's first diplomatic meeting with indigenous leaders. Lewis delivered a speech announcing United States sovereignty and distributed peace medals to chiefs of the Oto and Missouri tribes.",
                routeTitle: "Lewis and Clark Expedition"
            },
            {
                id: 'wp-lc-6',
                name: "Spirit Mound",
                lat: 42.8425,
                lng: -96.942,
                context: "August 25, 1804: The captains climb this mound to investigate local legends of 'little people'.",
                description: "Spirit Mound is a prominent geological landmark in South Dakota that local Native American tribes believed was inhabited by diminutive spirit-beings. Lewis, Clark, and several men hiked to the summit to map the expansive prairie views and observe wildlife.",
                routeTitle: "Lewis and Clark Expedition"
            },
            {
                id: 'wp-lc-7',
                name: "Fort Mandan",
                lat: 47.297926,
                lng: -101.08726,
                context: "Winter 1804-1805: The expedition builds a fort for the winter and meets Sacagawea.",
                description: "Fort Mandan was constructed near the Mandan and Hidatsa villages in North Dakota. During their winter stay, Lewis and Clark forged friendly diplomatic ties, hired French-Canadian fur trapper Toussaint Charbonneau, and met his Shoshone wife, Sacagawea.",
                routeTitle: "Lewis and Clark Expedition"
            },
            {
                id: 'wp-lc-8',
                name: "Knife River Indian Villages",
                lat: 47.375,
                lng: -101.405,
                context: "Major trade hub where the captains gathered vital geographical information from the Hidatsa.",
                description: "The Knife River Villages comprised thriving agricultural and trade centers on the Upper Missouri. Hidatsa and Mandan elders provided the captains with detailed geographical descriptions and hand-drawn maps of the Rocky Mountains ahead.",
                routeTitle: "Lewis and Clark Expedition"
            },
            {
                id: 'wp-lc-9',
                name: "Great Falls (Lower Portage)",
                lat: 47.516,
                lng: -111.378,
                context: "June 1805: The expedition faces a grueling month-long portage around the massive waterfalls.",
                description: "The Great Falls of the Missouri presented a series of five cascading waterfalls over an 18-mile stretch. The crew undertook an arduous overland portage through cactus and intense heat, hauling canoes and heavy cargo by hand across rough terrain.",
                routeTitle: "Lewis and Clark Expedition"
            },
            {
                id: 'wp-lc-10',
                name: "Three Forks of the Missouri",
                lat: 45.894,
                lng: -111.927,
                context: "July 1805: The explorers discover the headwaters of the Missouri River.",
                description: "At Three Forks in Montana, the expedition reached the headwaters of the Missouri River where three major rivers converge. Captains Lewis and Clark named them the Jefferson, Madison, and Gallatin rivers in honor of prominent leaders.",
                routeTitle: "Lewis and Clark Expedition"
            },
            {
                id: 'wp-lc-11',
                name: "Lemhi Pass",
                lat: 44.975833,
                lng: -113.441944,
                context: "August 12, 1805: Meriwether Lewis crosses the Continental Divide, leaving US territory.",
                description: "Lemhi Pass on the Montana-Idaho border marks the point where Meriwether Lewis crossed the Continental Divide. Standing at the pass, Lewis looked west expecting a navigable river to the Pacific, only to see endless rows of snow-capped mountains.",
                routeTitle: "Lewis and Clark Expedition"
            },
            {
                id: 'wp-lc-12',
                name: "Fort Clatsop",
                lat: 46.133611,
                lng: -123.880278,
                context: "Winter 1805-1806: The Corps achieves their goal, wintering on the Pacific Coast.",
                description: "Fort Clatsop was established near the mouth of the Columbia River in Oregon after the expedition reached the Pacific Ocean. The crew spent the rainy winter documenting new species, drawing maps, and preparing for their return journey home.",
                routeTitle: "Lewis and Clark Expedition"
            }
        ]
    };

    const franklinRoute: FavoriteLocation = {
        id: 'default-franklin',
        name: "Franklin Expedition Route",
        lat: 74.716,
        lng: -91.833,
        type: 'route',
        notes: "Waypoints from https://www.coolantarctica.com/Antarctica%20fact%20file/History/antarctic_ships/Franklin-north-west-passage-map.php",
        waypoints: [
            {
                id: 'wp-fr-1',
                name: "Greenhithe, England",
                lat: 51.448,
                lng: 0.283,
                context: "May 19, 1845: The HMS Erebus and HMS Terror depart England.",
                description: "Sir John Franklin's lost expedition set sail from Greenhithe on the Thames with 129 officers and crew aboard HMS Erebus and HMS Terror. Outfitted with auxiliary steam engines and three years of provisions, the mission was tasked with discovering the Northwest Passage.",
                routeTitle: "Franklin Expedition Route"
            },
            {
                id: 'wp-fr-2',
                name: "Stromness, Orkney",
                lat: 58.965,
                lng: -3.296,
                context: "Final port of call in the UK.",
                description: "Stromness in the Orkney Islands served as the expedition's last stop in the British Isles. The ships took on fresh water, cattle, and supplies before heading west across the North Atlantic toward Greenland.",
                routeTitle: "Franklin Expedition Route"
            },
            {
                id: 'wp-fr-3',
                name: "Whalefish Islands, Greenland",
                lat: 69.25,
                lng: -53.53,
                context: "July 1845: Five men sent home, provisions loaded. Last letters sent.",
                description: "In the Whalefish Islands off the western coast of Greenland, the expedition transferred additional coal and preserved rations from escort transport ships. Five crew members were discharged and sent home, carrying the expedition's final letters to families.",
                routeTitle: "Franklin Expedition Route"
            },
            {
                id: 'wp-fr-4',
                name: "Lancaster Sound",
                lat: 74.25,
                lng: -84.0,
                context: "Late July 1845: Last spotted by European whalers waiting for ice to clear.",
                description: "Lancaster Sound was the eastern gateway to the Northwest Passage in northern Canada. Two whaling ships, the Prince of Wales and Enterprise, spotted the Erebus and Terror tethered to an iceberg waiting for open leads in the pack ice—the last Europeans to see Franklin alive.",
                routeTitle: "Franklin Expedition Route"
            },
            {
                id: 'wp-fr-5',
                name: "Beechey Island",
                lat: 74.716,
                lng: -91.833,
                context: "Winter 1845-1846: Expedition camps here. Three crewmen die and are buried.",
                description: "Beechey Island provided a sheltered harbor where the expedition spent their first Arctic winter. Three crewmen (John Torrington, John Hartnell, and William Braine) died here of illness and were buried on the windswept shore.",
                routeTitle: "Franklin Expedition Route"
            },
            {
                id: 'wp-fr-6',
                name: "Cornwallis Island",
                lat: 75.15,
                lng: -95.0,
                context: "1846: The ships circumnavigated this island before heading south.",
                description: "During the summer thaw of 1846, Franklin navigated north around Cornwallis Island via Wellington Channel, proving it was an island before steering south into Peel Sound toward King William Island.",
                routeTitle: "Franklin Expedition Route"
            },
            {
                id: 'wp-fr-7',
                name: "Peel Sound",
                lat: 73.0,
                lng: -96.5,
                context: "Summer 1846: Sailed south towards King William Island.",
                description: "Peel Sound is an icy strait in Nunavut between Somerset Island and Prince of Wales Island. The ships sailed south through its freezing waters before becoming hopelessly trapped by multi-year pack ice off the northwestern tip of King William Island in September 1846.",
                routeTitle: "Franklin Expedition Route"
            },
            {
                id: 'wp-fr-8',
                name: "Point Victory",
                lat: 69.63,
                lng: -98.81,
                context: "Sept 1846: Ships beset in ice. April 1848: Ships abandoned by survivors.",
                description: "At Point Victory on King William Island, searchers later found the sole written record left by the expedition. The note recorded Sir John Franklin's death on June 11, 1847, and the abandonment of the iced-in ships by the remaining 105 survivors in April 1848.",
                routeTitle: "Franklin Expedition Route"
            },
            {
                id: 'wp-fr-9',
                name: "Terror Bay",
                lat: 68.89,
                lng: -98.94,
                context: "Resting place of the HMS Terror, discovered in 2016.",
                description: "Terror Bay on the southwestern coast of King William Island is the resting place of HMS Terror. Discovered in 2016 in pristine condition beneath 80 feet of water, the wreck confirmed Inuit oral history that the ship had drifted south before foundering.",
                routeTitle: "Franklin Expedition Route"
            },
            {
                id: 'wp-fr-10',
                name: "Queen Maud Gulf",
                lat: 68.25,
                lng: -98.9,
                context: "Resting place of the HMS Erebus, discovered in 2014.",
                description: "Queen Maud Gulf in the Canadian Arctic waters south of King William Island contains the wreck of HMS Erebus. Located by Parks Canada underwater archaeologists in 2014, the flagship's discovery resolved one of the greatest mysteries in maritime exploration history.",
                routeTitle: "Franklin Expedition Route"
            }
        ]
    };

    const defaultRoutes = [shackletonRoute, genghisRoute, lewisClarkRoute, franklinRoute];

    // Build lookup for default waypoint descriptions to hydrate legacy cached favorites
    const defaultWaypointMap = new Map<string, Waypoint>();
    defaultRoutes.forEach(r => {
      r.waypoints?.forEach(wp => {
        defaultWaypointMap.set(wp.id, wp);
      });
    });

    if (savedFavorites) {
      try {
        const parsed = JSON.parse(savedFavorites);
        if (Array.isArray(parsed) && parsed.length > 0) {
            const hydratedFavorites = parsed
              .filter((f: any) => f && typeof f.lat === 'number' && typeof f.lng === 'number' && f.name)
              .map((f: FavoriteLocation) => {
                if (f.type === 'route' && Array.isArray(f.waypoints)) {
                  const updatedWaypoints = f.waypoints.map(wp => {
                    const defaultMatch = defaultWaypointMap.get(wp.id);
                    if (defaultMatch && (!wp.description || wp.description.trim() === '')) {
                      return { ...wp, description: defaultMatch.description };
                    }
                    return wp;
                  });
                  return { ...f, waypoints: updatedWaypoints };
                }
                return f;
              });
            setFavorites(hydratedFavorites);
            return;
        }
      } catch (e) {
        console.error("Failed to parse favorites", e);
      }
    }

    setFavorites(defaultRoutes);
  }, []);

  // Save favorites to local storage whenever they change
  useEffect(() => {
    localStorage.setItem('terraexplorer_favorites', JSON.stringify(favorites));
  }, [favorites]);

  // Sync activeRouteId with routeWaypoints if route is cleared externally
  useEffect(() => {
    if (routeWaypoints.length === 0 && activeRouteId) {
        setActiveRouteId(null);
    }
  }, [routeWaypoints, activeRouteId]);

  useEffect(() => {
    cameraStateRef.current.activeRoute = activeRouteId;
    requestAnimationFrame(() => {
      reconcileCameraState();
    });
  }, [activeRouteId, reconcileCameraState]);

  const handleVisibilityChange = useCallback((visible: boolean) => {
    setIsLocationVisible(visible);
  }, []);  const loadWaypointData = useCallback(async (wp: Waypoint) => {
     const stableId = wp.id || `${wp.name}-${wp.lat}-${wp.lng}`;
     const enrichmentRequestId = ++activeMarkerRequestRef.current;
     
     console.log(`[InfoPanel] OPEN`);
     console.log(`[InfoPanel] selection = ${stableId}`);
     console.log(`[InfoPanel] enrichment started`);

     setInteractionState('PIN_SELECTED');
     setIsInfoPanelLoading(true);
     setIsNewsFetching(false);
     console.log('[Scan Lifecycle] BACKGROUND_ENRICHMENT_STARTED');
     
     const initialWaypointPayload: any = {
         id: stableId,
         name: wp.name,
         coordinates: { lat: wp.lat, lng: wp.lng },
         waypoint: wp,
         description: wp.description || "",
         significance: wp.significance,
         highlights: wp.highlights,
         historicalPeriod: wp.historicalPeriod,
         entities: wp.entities,
         entityType: wp.entityType || (wp as any).type || "historical_waypoint",
         climate: getEstimatedClimate(wp.lat, wp.lng, wp.historicalRegion || wp.modernLocation || "", "", wp.entityType || (wp as any).type),
         contextNotes: [],
         news: [],
         relatedEntities: [],
         sectionState: { description: wp.description ? "complete" : "loading", news: "idle" }
     };
     
     setLocationInfo(initialWaypointPayload);
     setSelectedMarkerId(stableId);
     setSelectedMarkerCoordinates({ lat: wp.lat, lng: wp.lng });
     setIsFocused(true);

     // Propose camera values to central state
     if (earthRef.current && cameraControlsRef.current) {
        const targetDist = isZoomLocked && lockedZoomDistance ? lockedZoomDistance : 2.0; 
        
        cameraStateRef.current.routeSuggestedDistance = targetDist;
        cameraStateRef.current.targetRotation = { lat: wp.lat, lng: wp.lng };
        
        requestAnimationFrame(() => {
           reconcileCameraState();
        });
     }
     
     console.log(`ENTITY_RESOLUTION_STARTED [req: ${enrichmentRequestId}] for ${wp.name}`);
     
     const anchor: MapMarker = {
         id: wp.id,
         name: wp.name,
         lat: wp.lat,
         lng: wp.lng,
         type: wp.entityType || (wp as any).type || 'historical_waypoint',
         populationClass: 'small'
     };
     
     const geoMarker = await resolveGeographicMetadata(anchor);
     if (enrichmentRequestId !== activeMarkerRequestRef.current) return;
     
     console.log(`ENTITY_RESOLUTION_COMPLETE [req: ${enrichmentRequestId}] for ${wp.name}`);

     let data: any = { 
         id: geoMarker.id || stableId,
         name: wp.name, // Protected
         coordinates: { lat: wp.lat, lng: wp.lng }, // Protected
         waypoint: wp, // Protected
         country: geoMarker.country,
         state: geoMarker.state,
         city: geoMarker.city,
         population: geoMarker.population,
         osmId: geoMarker.osmId,
         osmType: geoMarker.osmType,
         wikidataId: geoMarker.wikidataId,
         wikipedia: geoMarker.wikipedia,
         description: wp.description,
         significance: wp.significance,
         highlights: wp.highlights,
         historicalPeriod: wp.historicalPeriod,
         entities: wp.entities,
         entityType: wp.entityType || geoMarker.type || "historical_waypoint",
         climate: getEstimatedClimate(wp.lat, wp.lng, wp.historicalRegion || wp.modernLocation || geoMarker.state || geoMarker.region || "", geoMarker.country || "", wp.entityType || geoMarker.type),
         contextNotes: [],
         news: [],
         relatedEntities: [],
         sectionState: { description: wp.description ? "complete" : "loading", news: "idle" }
     };

     setLocationInfo((prev: any) => {
         if (!prev || enrichmentRequestId !== activeMarkerRequestRef.current) return prev;
         return mergeLocationInfo(prev, data);
     }); // Inject the route context so it's always available as historical context
     if (wp.context) {
         const routeLabel = wp.routeTitle || "From Route";
         data.routeContext = {
             title: routeLabel,
             text: wp.context
         };
     }

     if (wp.id === 'wp-genghis-1') {
         data.defaultNote = "Waypoints from https://www.worldhistory.org/image/11221/map-of-the-campaigns-of-genghis-khan/";
     }

     setLocationInfo(data);
     // InfoPanel mounting state ready
     setIsInfoPanelLoading(true);

     const schema = ENTITY_SCHEMAS[data.entityType || 'city'] || ENTITY_SCHEMAS['city'];
     const fetchGeographicMetadata = schema.capabilities.supportsPopulation || schema.capabilities.supportsClimate;
     const overwriteNarrative = schema.enrichment.overwriteNarrative;

     if (fetchGeographicMetadata) {
         // Stage 3: Description & Notable
         (async () => {
             try {
                 const enrichedData = await getInfoFromFeature(geoMarker);
                 if (enrichmentRequestId !== activeMarkerRequestRef.current) return;
                 
                 if (enrichedData) {
                     setLocationInfo((prev: any) => {
                         if (!prev || prev.waypoint?.id !== wp.id) return prev;
                         const desc = overwriteNarrative 
                              ? (enrichedData.description || wp.description || wp.significance || "") 
                              : (wp.description || enrichedData.description || wp.significance || "");
                         let nextState = mergeLocationInfo(prev, {
                             description: desc,
                             notable: enrichedData.notable,
                             contextNotes: enrichedData.contextNotes,
                             relatedEntities: enrichedData.relatedEntities,
                             imageSearchTerm: enrichedData.imageSearchTerm,
                             sectionState: { ...prev.sectionState, description: "complete" }
                         });
                         const mode = enrichedData.metadataMode || 'modern_place';
                         if (mode === 'historical_site') {
                             delete nextState.population;
                             delete nextState.climate;
                         } else if (mode === 'natural_feature') {
                             delete nextState.population;
                         }
                         return nextState;
                     });
                 } else {
                     setLocationInfo((prev: any) => {
                         if (!prev || prev.waypoint?.id !== wp.id) return prev;
                         return { ...prev, sectionState: { ...prev.sectionState, description: "error" } };
                     });
                 }
             } catch (err) {
                 if (enrichmentRequestId === activeMarkerRequestRef.current) {
                     setLocationInfo((prev: any) => prev ? { ...prev, sectionState: { ...prev.sectionState, description: "error" } } : prev);
                 }
             } finally {
                 if (enrichmentRequestId === activeMarkerRequestRef.current) {
                     setIsInfoPanelLoading(false);
                     console.log('[Scan Lifecycle] BACKGROUND_ENRICHMENT_COMPLETE');
                 }
             }
         })();
     } else {
         setIsInfoPanelLoading(false);
         console.log('[Scan Lifecycle] BACKGROUND_ENRICHMENT_COMPLETE');
     }
  }, [isZoomLocked, lockedZoomDistance, reconcileCameraState]);  const selectEntity = useCallback(async (marker: MapMarker | FavoriteLocation | Waypoint) => {
    const stableId = marker.id || `${marker.name}-${marker.lat}-${marker.lng}`;
    const targetKey = stableId;
    
    if (processingMarkerRef.current === targetKey) {
        return;
    }
    
    processingMarkerRef.current = targetKey;

    try {
        const enrichmentRequestId = ++activeMarkerRequestRef.current;
        
        console.log(`[InfoPanel] OPEN`);
        console.log(`[InfoPanel] selection = ${stableId}`);
        console.log(`[Marker Lifecycle] MARKER_SELECTED name="${marker.name}"`);
        console.log(`[Marker Lifecycle] INFOPANEL_OPEN`);

        setInteractionState('PIN_SELECTED');
        setSearchError(null);
        setAutoRotate(false);
        setSelectedMarkerId(stableId);
        setSelectedMarkerCoordinates({ lat: marker.lat, lng: marker.lng });
        setIsFocused(true);
        
        const fav = marker as FavoriteLocation;
        if (fav.type === 'route' && fav.waypoints) {
            setRouteWaypoints(fav.waypoints);
            setActiveRouteId(fav.id);
            cameraStateRef.current.activeRoute = fav.id;
            setCurrentWaypointIndex(0);
            if (fav.waypoints.length > 0) {
                loadWaypointData(fav.waypoints[0]);
            }
            return;
        }

        const isRoutePoint = 'context' in marker || 'routeTitle' in marker;
        if (isRoutePoint) {
            const wp = marker as Waypoint;
            const idx = routeWaypoints.findIndex(w => w.id === wp.id);
            if (idx !== -1) {
                setCurrentWaypointIndex(idx);
            }
            loadWaypointData(wp);
            return;
        } else {
            if (!activeRouteId) {
                setRouteWaypoints([]);
                setCurrentWaypointIndex(-1);
            } else {
                setCurrentWaypointIndex(-1);
            }
        }

        // 1. Immediately create and display the basic payload so the user sees the title/basic identity without delay
        const initialPayload: any = {
            id: stableId,
            name: marker.name,
            entityType: ('type' in marker && marker.type ? marker.type : "generic"),
            type: ('type' in marker && marker.type ? marker.type : undefined),
            coordinates: { lat: marker.lat, lng: marker.lng },
            country: ('country' in marker ? (marker as any).country : undefined),
            state: ('state' in marker ? (marker as any).state : undefined),
            city: ('city' in marker ? (marker as any).city : undefined),
            population: ('population' in marker ? (marker as any).population : undefined),
            description: "",
            climate: getEstimatedClimate(marker.lat, marker.lng, ('state' in marker ? (marker as any).state : "") || ('region' in marker ? (marker as any).region : ""), ('country' in marker ? (marker as any).country : "") || "", ('type' in marker ? marker.type : undefined)),
            contextNotes: [],
            news: [],
            notable: [],
            relatedEntities: [],
            sectionState: { description: "loading", news: "loading" }
        };

        setLocationInfo(initialPayload);
        setIsInfoPanelLoading(true);
        setIsNewsFetching(false);
        console.log('[Scan Lifecycle] BACKGROUND_ENRICHMENT_STARTED');

        if (cameraControlsRef.current) {
            const targetDist = isZoomLocked && lockedZoomDistance ? lockedZoomDistance : 1.5;
            cameraStateRef.current.routeSuggestedDistance = targetDist;
            cameraStateRef.current.targetRotation = { lat: marker.lat, lng: marker.lng };
            requestAnimationFrame(() => reconcileCameraState());
        }

        // 2. Resolve geographic metadata asynchronously
        console.log(`[InfoPanel] enrichment started`);
        console.log(`[Entity] Resolving ${marker.name}`);
        
        const anchor: MapMarker = {
             id: stableId,
             name: marker.name,
             lat: marker.lat,
             lng: marker.lng,
             type: ('type' in marker && marker.type ? marker.type : 'generic'),
             populationClass: 'small'
        };
        
        const geoMarker = await resolveGeographicMetadata(anchor);
        if (enrichmentRequestId !== activeMarkerRequestRef.current) return;
        console.log(`[Entity] ${marker.name} resolved`);

        const basePayload: any = {
            id: geoMarker.id || stableId,
            name: geoMarker.name || marker.name,
            entityType: geoMarker.type || initialPayload.entityType || "generic",
            type: geoMarker.type || initialPayload.type,
            coordinates: { lat: geoMarker.lat, lng: geoMarker.lng },
            country: geoMarker.country || initialPayload.country,
            state: geoMarker.state || initialPayload.state,
            city: geoMarker.city || initialPayload.city,
            population: geoMarker.population || initialPayload.population,
            osmId: geoMarker.osmId,
            osmType: geoMarker.osmType,
            wikidataId: geoMarker.wikidataId,
            wikipedia: geoMarker.wikipedia,
            description: "",
            climate: getEstimatedClimate(geoMarker.lat, geoMarker.lng, geoMarker.state || geoMarker.region || "", geoMarker.country || "", geoMarker.type),
            contextNotes: [],
            news: [],
            notable: [],
            relatedEntities: [],
            sectionState: { description: "loading", news: "idle" }
        };

        setLocationInfo((prev: any) => {
            if (!prev || enrichmentRequestId !== activeMarkerRequestRef.current) return prev;
            return mergeLocationInfo(prev, basePayload);
        });

        // Stage 3: Description & Notable
        (async () => {
            try {
                const data = await getInfoFromFeature(geoMarker);
                if (enrichmentRequestId !== activeMarkerRequestRef.current) return;
                
                if (data) {
                    console.log(`[InfoPanel] enrichment updated`);
                    console.log(`[Enrichment] ${geoMarker.name} complete`);
                    setLocationInfo((prev: any) => {
                        if (!prev || enrichmentRequestId !== activeMarkerRequestRef.current) return prev;
                        return mergeLocationInfo(prev, {
                            description: data.description || prev.description,
                            notable: data.notable || prev.notable,
                            contextNotes: data.contextNotes || prev.contextNotes,
                            relatedEntities: data.relatedEntities || prev.relatedEntities,
                            imageSearchTerm: data.imageSearchTerm || prev.imageSearchTerm,
                            sectionState: { ...prev.sectionState, description: "complete" }
                        });
                    });
                } else {
                    setLocationInfo((prev: any) => (prev && enrichmentRequestId === activeMarkerRequestRef.current) ? { ...prev, sectionState: { ...prev.sectionState, description: "error" } } : prev);
                }
            } catch (err) {
                if (enrichmentRequestId === activeMarkerRequestRef.current) {
                    setLocationInfo((prev: any) => prev ? { ...prev, sectionState: { ...prev.sectionState, description: "error" } } : prev);
                }
            } finally {
                if (enrichmentRequestId === activeMarkerRequestRef.current) {
                    setIsInfoPanelLoading(false);
                    console.log('[Scan Lifecycle] BACKGROUND_ENRICHMENT_COMPLETE');
                }
            }
        })();
    } finally {
        processingMarkerRef.current = null;
    }
  }, [isZoomLocked, lockedZoomDistance, reconcileCameraState, loadWaypointData, activeRouteId, routeWaypoints]);
  const handleMarkerClick = useCallback(async (marker: MapMarker | FavoriteLocation | Waypoint, point?: THREE.Vector3) => {
      selectEntity(marker);
  }, [selectEntity]);

  const setScanStatus = useCallback((text: string | null) => {
     setScanningStatusText(text);
     scanStatusRef.current = text;
  }, []);

  const startScan = useCallback((location: GeoCoordinates) => {
     activeScanIdRef.current++;
     activeMarkerRequestRef.current++; // Invalidate previous async requests
     scanResolvedRef.current = false;
     scanFullyProcessedRef.current = false;
     console.log(`[InfoPanel] CLOSE reason = new_scan_started`);
     console.log("[Scan Lifecycle] DISCOVERY_STARTED");
     console.log("scan_started");
     console.log("triangulation_started");
     setScanningArea(location);
     setIsScanningArea(true);
     setScanStatus("Starting scan");

     setInteractionState('GLOBE_SEARCHING');
     setIsDiscoveryLoading(true);
     setLocationInfo(null); // Ensure NO overlay is opened
     setSearchError(null);
     setAutoRotate(false); 
     console.log(`[Marker Lifecycle] DISCOVERY_REPLACED oldCount=${markers.length} newCount=0`);
     setMarkers([]); // Clear transient markers
     
     if (!activeRouteId) {
         setRouteWaypoints([]);
         setCurrentWaypointIndex(-1);
     } else {
         setCurrentWaypointIndex(-1);
     }
     
     setSelectedMarkerId(null);
     setSelectedMarkerCoordinates(null);
     setIsFocused(false);

     if (cameraControlsRef.current) {
       const targetDist = isZoomLocked && lockedZoomDistance ? lockedZoomDistance : 2.2;
       
       cameraStateRef.current.routeSuggestedDistance = targetDist;
       cameraStateRef.current.targetRotation = { lat: location.lat, lng: location.lng };
       
       requestAnimationFrame(() => {
          reconcileCameraState();
       });
     }
  }, [activeRouteId, isZoomLocked, lockedZoomDistance, reconcileCameraState, setScanStatus, markers.length]);

  const resolveScan = useCallback(async (result: { type: "results", data: MapMarker[] } | { type: "empty", status: "NO_RESULTS" | "PROVIDER_FAILURE", coords: { lat: number, lng: number }, diagnostics: any, environment?: string }) => {
     const currentScanId = activeScanIdRef.current;
     if (scanResolvedRef.current) return;

     // Safety gate check:
     if (!scanFullyProcessedRef.current) {
        console.warn("Attempted resolveScan before processing complete!");
        return;
     }

     scanResolvedRef.current = true;
     console.log("SCAN RESOLVED");

     if (result.type === "results") {
        console.log("[Scan Lifecycle] DISCOVERY_RESULTS_RECEIVED");
        console.log(JSON.stringify({
            stage: "marker-mapping",
            received: result.data.length,
            mapped: result.data.length, // No additional filtering here
            returned: result.data.length
        }));
        console.log("[DEBUG] setMarkers called with length:", result.data.length); 
        setMarkers(result.data);
        console.log(`[Marker Lifecycle] DISCOVERY_RESULTS_SET count=${result.data.length}`);
        console.log("[Scan Lifecycle] MARKERS_RENDERED");
        
        // Immediately terminate primary discovery spinner & clear scan status text
        setIsDiscoveryLoading(false);
        setScanStatus(null);
        console.log("[Scan Lifecycle] DISCOVERY_COMPLETE");

        if (result.data.length === 1) {
            selectEntity(result.data[0]);
        }
     } else {
        console.log(`[SCAN EMPTY RESULT]\nStatus: ${result.status}\nCoordinates: ${result.coords.lat}, ${result.coords.lng}\nEnvironment: ${result.diagnostics?.environment || 'unknown'}\nCandidates Received: ${result.diagnostics?.candidatesReceived || 0}\nCandidates Rejected: ${result.diagnostics?.rejectedByDistance || 0}\nFinal Candidate Count: 0\nUser Notification: true`);
        setScanStatus(null);
        setIsDiscoveryLoading(false);
        console.log("[Scan Lifecycle] DISCOVERY_COMPLETE");
        if (currentScanId === activeScanIdRef.current) {
            console.log(`[InfoPanel] CLOSE reason = scan_empty_results`);
            setMarkers([]);
            setLocationInfo(null);
            setSelectedMarkerId(null);
            setInteractionState('GLOBE_IDLE');
            
            if (result.status === 'PROVIDER_FAILURE') {
                setSearchError("Unable to search this location right now.");
            } else {
                setSearchError("No locations found near this point.");
            }
        }
     }

     // Keep scan rings briefly, then fade out
     await new Promise(resolve => setTimeout(resolve, 1500));
     if (currentScanId !== activeScanIdRef.current) return;
     setScanningArea(null);
     setIsScanningArea(false);

     // Return to default state after short delay
     await new Promise(resolve => setTimeout(resolve, 500));
     if (currentScanId !== activeScanIdRef.current) return;
     setScanStatus(null);
     
     // Do NOT reset interactionState if a PIN is currently selected or if selection exists!
     setInteractionState((prev) => {
        if (prev === 'PIN_SELECTED') return 'PIN_SELECTED';
        return result.type === "results" ? 'PINS_RENDERED' : 'GLOBE_IDLE';
     });
  }, [setScanStatus, selectEntity]);

  const failScan = useCallback(async (error: string) => {
     const currentScanId = activeScanIdRef.current;
     if (scanResolvedRef.current) return;

     // Safety gate check (allow cancellation without full processing if user clicked CANCEL):
     if (!scanFullyProcessedRef.current && error !== "Scan cancelled") {
        console.warn("Attempted failScan before processing complete!");
        return;
     }

     scanResolvedRef.current = true;
     console.log("SCAN RESOLVED");
     setScanStatus(null);
     setIsDiscoveryLoading(false);
     console.log("[Scan Lifecycle] DISCOVERY_FAILED");

     // Keep scan rings briefly, then fade out
     await new Promise(resolve => setTimeout(resolve, 1500));
     if (currentScanId !== activeScanIdRef.current) return;
     setScanningArea(null);
     setIsScanningArea(false);

     // Return to default state after short delay
     await new Promise(resolve => setTimeout(resolve, 500));
     if (currentScanId !== activeScanIdRef.current) return;
     setScanStatus(null);
     setInteractionState((prev) => {
        if (prev === 'PIN_SELECTED') return 'PIN_SELECTED';
        return 'GLOBE_IDLE';
     });
  }, [setScanStatus]);

   const handleCancelScan = useCallback(() => {
      scanFullyProcessedRef.current = true;
      setIsDiscoveryLoading(false);
      setScanStatus(null);
      console.log("[Scan Lifecycle] DISCOVERY_CANCELLED");
      failScan("Scan cancelled");
   }, [failScan, setScanStatus]);

  const handleGlobeClick = useCallback(async (lat: number, lng: number, point: THREE.Vector3) => {
     // Guard against programmatic transitions and ongoing camera animations
     if (Date.now() < programmaticTransitionUntilRef.current || targetCameraPosRef.current !== null) {
        console.log("[handleGlobeClick] Blocked click during programmatic globe positioning/animation");
        return;
     }

     // Check if the clicked location is close to an existing waypoint
     const isClose = (lat1: number, lng1: number, lat2: number, lng2: number) => {
       const R = 6371; // km
       const dLat = (lat2 - lat1) * Math.PI / 180;
       const dLng = (lng2 - lng1) * Math.PI / 180;
       const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                 Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                 Math.sin(dLng/2) * Math.sin(dLng/2);
       const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
       return R * c < 150; // 150km threshold
     };

     const nearbyWaypoint = routeWaypoints.find(wp => isClose(lat, lng, wp.lat, wp.lng));

     if (nearbyWaypoint) {
        // Waypoint flow: Keep existing behavior and open the location overlay as normal
        handleMarkerClick(nearbyWaypoint, point);
        return;
     }

     // Non-waypoint flow: Do NOT open any overlay under any condition. Set scanning state.
     const currentScanId = activeScanIdRef.current + 1; // Anticipate the scan ID
     startScan({ lat, lng });

      // Return immediately while the scanning request runs in the background
      (async () => {
         const steps = ["Starting scan", "Locating area", "Expanding search", "Checking area"];

         // 1. Progress Animation Loop (runs gradually, 600-1000ms per step)
         const progressPromise = (async () => {
            for (let i = 0; i < steps.length; i++) {
               if (currentScanId !== activeScanIdRef.current) return;
               setScanStatus(steps[i]);
               await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 400));
            }
         })();

         // 2. Parallel API Fetch
         try {
            console.log("scan_data_requested");
            let result = await getNearbyPlaces(lat, lng, 100);
            console.log("[App] Raw getNearbyPlaces result", result);
            let places = result.places || [];

            if (currentScanId !== activeScanIdRef.current) return;

            // Wait for the visual progress animation (up to "Checking area") to finish first to enforce visual pacing
            await progressPromise;
            if (currentScanId !== activeScanIdRef.current) return;

            // Explicit "Processing results" phase
            setScanStatus("Reviewing results");
            await new Promise(resolve => setTimeout(resolve, 800));
            if (currentScanId !== activeScanIdRef.current) return;

            setScanStatus("Finalizing results");
            await new Promise(resolve => setTimeout(resolve, 500));
            if (currentScanId !== activeScanIdRef.current) return;

            // Pipeline fully complete - trigger completion gate
            scanFullyProcessedRef.current = true;

            if (result.status === "SUCCESS") {
               console.log("scan_results_received");
               const finalMarkers = places.map((m: any) => ({
                  ...m,
                  id: m.id,
                  name: m.name,
                  lat: m.lat,
                  lng: m.lng,
                  populationClass: m.populationClass
               }));
               await resolveScan({ type: "results", data: finalMarkers });
            } else {
                console.log("scan_results_empty");
                await resolveScan({ 
                  type: "empty", 
                  status: result.status, 
                  coords: { lat, lng }, 
                  diagnostics: result.diagnostics
                });
             }

         } catch (err: any) {
            if (currentScanId !== activeScanIdRef.current) return;
            
            await progressPromise;
            if (currentScanId !== activeScanIdRef.current) return;

            setScanStatus("Finalizing results");
            await new Promise(resolve => setTimeout(resolve, 600));
            if (currentScanId !== activeScanIdRef.current) return;

            scanFullyProcessedRef.current = true;

            console.log("scan_results_empty");
            let errorMsg = "Scan failed";
            if (err?.message?.includes("access") || err?.message?.includes("permission") || err?.status === 403) {
               errorMsg = "This area cannot be accessed";
            }
            await failScan(errorMsg);
         }

         // 3. Fallback resolution guard (10s total limit)
         setTimeout(async () => {
            if (currentScanId !== activeScanIdRef.current) return;
            if (scanResolvedRef.current) return;
            if (scanStatusRef.current === "Finalizing results" || scanStatusRef.current === "Reviewing results") return; // Grace window for active processing!
            console.warn("Scan fallback guard triggered!");
            await failScan("Scan took too long to complete");
         }, 10000);
      })();
   }, [routeWaypoints, handleMarkerClick, startScan, resolveScan, failScan, setScanStatus]);

  const handleSearch = async (query: string) => {
    const cleanQuery = query.trim();
    if (!cleanQuery) return;

    // 1. Intent routing & entity extraction
    const parsedQuery = routeIntentAndExtractEntity(cleanQuery);

    if (parsedQuery.intent === 'EXPLORATORY' || parsedQuery.resolutionMode === 'MULTI_LOCATION_EXPLORATION') {
        handleTraceRoute(cleanQuery);
        return;
    }

    setInteractionState('PIN_SELECTED');
    setIsDiscoveryLoading(true);
    console.log('[Scan Lifecycle] DISCOVERY_STARTED');
    setIsNewsFetching(false);
    setLocationInfo(null);
    setSearchError(null);
    setAutoRotate(false);
    console.log(`[Marker Lifecycle] DISCOVERY_REPLACED oldCount=${markers.length} newCount=0`);
    setMarkers([]); 
    setScanningArea(null);
    
    setRouteWaypoints([]); 
    setActiveRouteId(null);
    
    setCurrentWaypointIndex(-1);
    setSelectedMarkerId(null);
    setIsFocused(true);

    // 2. Active loading state inside the search input
    setScanningStatusText(`LOCATING ${parsedQuery.entity.toUpperCase()}`);

    // 3. Unified entity resolver lookup
    const pipelineResult = await runSearchPipeline({
        rawQuery: cleanQuery,
        intent: parsedQuery.intent,
        entity: parsedQuery.entity
    });

    setScanningStatusText(null);
    
    if (pipelineResult.mode === 'route') {
      if (pipelineResult.isValid && pipelineResult.waypoints && pipelineResult.waypoints.length > 0) {
        logWaypointSnapshot('App.tsx (Before Set State)', pipelineResult.waypoints[0]);
        
        setRouteWaypoints(pipelineResult.waypoints);
        setCurrentWaypointIndex(0);
        setIsDiscoveryLoading(false);
        console.log('[Scan Lifecycle] DISCOVERY_COMPLETE');
        loadWaypointData(pipelineResult.waypoints[0]);
      } else {
        setSearchError("No identifiable locations found in the route.");
        setIsDiscoveryLoading(false);
        console.log('[Scan Lifecycle] DISCOVERY_FAILED');
      }
      return;
    }

    const hasValidCoords = pipelineResult.isValid && (pipelineResult as any).finalData && !pipelineResult.error;

    if (hasValidCoords) {
      const { lat, lng } = (pipelineResult as any).finalData!.coordinates;
      
      const searchMarker: MapMarker = {
        id: `search-${Date.now()}`,
        name: (pipelineResult as any).finalData!.name,
        lat: lat,
        lng: lng,
        populationClass: 'large'
      };

      // Invalidate any in-flight background scans and suppress scan state
      activeScanIdRef.current += 1;
      setScanningArea(null);
      setIsScanningArea(false);
      setScanStatus(null);
      scanFullyProcessedRef.current = true;
      programmaticTransitionUntilRef.current = Date.now() + 1500;

      setMarkers([searchMarker]);
      console.log(`[Marker Lifecycle] DISCOVERY_RESULTS_SET count=1`);
      setSelectedMarkerId(searchMarker.id);
      setSelectedMarkerCoordinates({ lat, lng });
      setLocationInfo((pipelineResult as any).finalData!);
      setIsDiscoveryLoading(false);
      console.log('[Scan Lifecycle] DISCOVERY_COMPLETE');

      const zoom = (pipelineResult as any).metadataResult?.coordinateResult?.suggestedZoom || 5;
      const targetDist = isZoomLocked && lockedZoomDistance ? lockedZoomDistance : Math.max(1.3, 4.5 - ((zoom / 10) * (4.5 - 1.2)));
      
      cameraStateRef.current.routeSuggestedDistance = targetDist;
      cameraStateRef.current.targetRotation = { lat, lng };
      
      requestAnimationFrame(() => {
         reconcileCameraState();
      });

    } else {
      const errorData = (pipelineResult as any).metadataResult?.enrichedData;
      if (errorData) {
        console.log(`=== INVALID COORDINATE BLOCKED ===
Query: ${query}
Location: ${errorData.name}
Coordinates: ${JSON.stringify(errorData.coordinates)}
Reason: Coordinates failed validation (sentinel, missing, or invalid 0,0)
===============================`);
      }

      let userError = "COULD NOT RESOLVE LOCATION";
      const errorCode = pipelineResult.error;
      if (errorCode === "LOCATION_SYSTEM_UNAVAILABLE") {
        userError = "LOCATION SYSTEM UNAVAILABLE";
      } else if (errorCode === "NOT_FOUND") {
        userError = "COULD NOT FIND LOCATION";
      } else if (errorCode === "NO_GEOGRAPHIC_DATA") {
        userError = "NO RESULTS FOUND FOR THIS QUERY";
      } else if (errorCode === "TEMP_FAILURE") {
        userError = "TEMPORARILY UNABLE TO LOAD LOCATION DATA";
      } else if (errorCode === "AMBIGUOUS") {
        userError = "LOCATION IS TOO AMBIGUOUS TO RESOLVE";
      }
      setSearchError(userError);
      setIsDiscoveryLoading(false);
      console.log('[Scan Lifecycle] DISCOVERY_FAILED');
    }
  };

  const handleTraceRoute = async (text: string) => {
      setInteractionState('PIN_SELECTED');
      setIsDiscoveryLoading(true);
      console.log('[Scan Lifecycle] DISCOVERY_STARTED');
      setSearchError(null);
      setLocationInfo(null);
      setAutoRotate(false);
      setMarkers([]); 
      setScanningArea(null);
      setIsFocused(true);
      
      // Clear current active route when generating new one
      setActiveRouteId(null);
      
      const route = await generateRoute(text);
      
      if (route.waypoints && route.waypoints.length > 0) {
          setRouteWaypoints(route.waypoints);
          
          console.log(`Route Generated: ${route.title}`);
          if (route.routeConfidence) {
              console.log(`Confidence: ${route.routeConfidence.level} - ${route.routeConfidence.reasoning}`);
          }
          
          setCurrentWaypointIndex(0);
          setIsDiscoveryLoading(false);
          console.log('[Scan Lifecycle] DISCOVERY_COMPLETE');
          loadWaypointData(route.waypoints[0]);
      } else {
          setSearchError("No identifiable locations found in the text.");
          setIsDiscoveryLoading(false);
          console.log('[Scan Lifecycle] DISCOVERY_FAILED');
      }
  };

  const handleNextWaypoint = () => {
      if (currentWaypointIndex < routeWaypoints.length - 1) {
          const nextIdx = currentWaypointIndex + 1;
          setCurrentWaypointIndex(nextIdx);
          loadWaypointData(routeWaypoints[nextIdx]);
      }
  };

  const handlePrevWaypoint = () => {
      if (currentWaypointIndex > 0) {
          const prevIdx = currentWaypointIndex - 1;
          setCurrentWaypointIndex(prevIdx);
          loadWaypointData(routeWaypoints[prevIdx]);
      }
  };

  const clampZoom = useCallback((z: number) => {
    const minZ = isZoomLocked && lockedZoomDistance ? lockedZoomDistance : 1.018;
    const maxZ = isZoomLocked && lockedZoomDistance ? lockedZoomDistance : 8.0;
    return Math.max(minZ, Math.min(maxZ, z));
  }, [isZoomLocked, lockedZoomDistance]);

  const animateZoom = useCallback(() => {
    if (!cameraControlsRef.current || targetZoomRef.current === null) {
      zoomAnimRef.current = null;
      return;
    }

    const camera = cameraControlsRef.current.object;
    const currentZoom = cameraControlsRef.current.getDistance();
    const diff = targetZoomRef.current - currentZoom;

    // Smooth cinematic damping factor (0.075 for gradual, responsive deceleration)
    const nextZoom = currentZoom + diff * 0.075;
    camera.position.normalize().multiplyScalar(nextZoom);
    cameraControlsRef.current?.update();

    updateCameraDistance(nextZoom);

    if (Math.abs(diff) > 0.0008) {
      zoomAnimRef.current = requestAnimationFrame(animateZoom);
    } else {
      zoomAnimRef.current = null;
      targetZoomRef.current = null;
    }
  }, [updateCameraDistance]);

  const BUTTON_ZOOM_FACTOR = 1.25;

  const handleZoomIn = useCallback(() => {
    if (skin === 'parchment') {
       targetParchmentZoomRef.current = Math.min(50.0, Math.max(1.0, targetParchmentZoomRef.current * BUTTON_ZOOM_FACTOR));
       if (!parchmentZoomAnimRef.current) {
          parchmentZoomAnimRef.current = requestAnimationFrame(animateParchmentZoom);
       }
       return;
    }
    if (!isZoomLocked && cameraControlsRef.current) {
      targetZoomRef.current = targetZoomRef.current ?? cameraControlsRef.current.getDistance();
      targetZoomRef.current = clampZoom(targetZoomRef.current / BUTTON_ZOOM_FACTOR);
      if (!zoomAnimRef.current) {
        zoomAnimRef.current = requestAnimationFrame(animateZoom);
      }
    }
  }, [isZoomLocked, clampZoom, animateZoom, skin, animateParchmentZoom]);

  const handleUserZoomIn = useCallback(() => {
    userModifiedZoomRef.current = true;
    handleZoomIn();
  }, [handleZoomIn]);

  const handleZoomOut = useCallback(() => {
    if (skin === 'parchment') {
       targetParchmentZoomRef.current = Math.max(1.0, targetParchmentZoomRef.current / BUTTON_ZOOM_FACTOR);
       if (!parchmentZoomAnimRef.current) {
          parchmentZoomAnimRef.current = requestAnimationFrame(animateParchmentZoom);
       }
       return;
    }
    userModifiedZoomRef.current = true;
    if (!isZoomLocked && cameraControlsRef.current) {
      targetZoomRef.current = targetZoomRef.current ?? cameraControlsRef.current.getDistance();
      targetZoomRef.current = clampZoom(targetZoomRef.current * BUTTON_ZOOM_FACTOR);
      if (!zoomAnimRef.current) {
        zoomAnimRef.current = requestAnimationFrame(animateZoom);
      }
    }
  }, [isZoomLocked, clampZoom, animateZoom, skin, animateParchmentZoom]);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (skin === 'parchment') {
         const normalizedDelta = normalizeWheelDelta(e.deltaY, e.deltaMode);
         const parchmentScale = targetParchmentZoomRef.current / 15 + 0.4;
         const parchmentStep = Math.max(-2.5, Math.min(2.5, normalizedDelta * 0.0018 * parchmentScale));
         targetParchmentZoomRef.current = Math.max(1.0, Math.min(50.0, targetParchmentZoomRef.current - parchmentStep));
         if (!parchmentZoomAnimRef.current) {
            parchmentZoomAnimRef.current = requestAnimationFrame(animateParchmentZoom);
         }
         return;
      }

      if (!isZoomLocked && cameraControlsRef.current) {
        const currentDist = targetZoomRef.current ?? cameraControlsRef.current.getDistance();
        const zoomDelta = calculateClampedZoomDelta(e.deltaY, e.deltaMode, currentDist);
        targetZoomRef.current = clampZoom(currentDist + zoomDelta);
        
        userModifiedZoomRef.current = true;

        if (!zoomAnimRef.current) {
          zoomAnimRef.current = requestAnimationFrame(animateZoom);
        }
      }
    };

    let initialPinchDistance: number | null = null;
    let initialParchmentZoom = 1.0;
    let initialCameraZoom = 4.5;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialPinchDistance = Math.hypot(dx, dy);
        initialParchmentZoom = currentParchmentZoomRef.current;
        if (cameraControlsRef.current) {
          initialCameraZoom = cameraControlsRef.current.getDistance();
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialPinchDistance !== null && initialPinchDistance > 0) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentPinchDistance = Math.hypot(dx, dy);
        const pinchRatio = currentPinchDistance / initialPinchDistance;

        if (skin === 'parchment') {
          targetParchmentZoomRef.current = Math.max(1.0, Math.min(50.0, initialParchmentZoom * pinchRatio));
          if (!parchmentZoomAnimRef.current) {
            parchmentZoomAnimRef.current = requestAnimationFrame(animateParchmentZoom);
          }
        } else if (!isZoomLocked && cameraControlsRef.current) {
          targetZoomRef.current = clampZoom(initialCameraZoom / pinchRatio);
          userModifiedZoomRef.current = true;
          if (!zoomAnimRef.current) {
            zoomAnimRef.current = requestAnimationFrame(animateZoom);
          }
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        initialPinchDistance = null;
      }
    };

    const container = document.getElementById('canvas-container');
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      container.addEventListener('touchstart', handleTouchStart, { passive: true });
      container.addEventListener('touchmove', handleTouchMove, { passive: false });
      container.addEventListener('touchend', handleTouchEnd, { passive: true });
      return () => {
        container.removeEventListener('wheel', handleWheel);
        container.removeEventListener('touchstart', handleTouchStart);
        container.removeEventListener('touchmove', handleTouchMove);
        container.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isZoomLocked, clampZoom, animateZoom, skin, animateParchmentZoom]);

  const handleClosePanel = () => {
    console.log(`[InfoPanel] CLOSE reason = user_close`);
    activeMarkerRequestRef.current++;
    setInteractionState(markers.length > 0 ? 'PINS_RENDERED' : 'GLOBE_IDLE');
    setLocationInfo(null);
    setSelectedMarkerId(null);
    setSelectedMarkerCoordinates(null);
    setIsNewsFetching(false);
    setIsFocused(false);
    console.log(`[Marker Lifecycle] INFOPANEL_CLOSED markersPreserved=${markers.length}`);
  };

  const getCurrentFavorite = () => {
    // Only return route favorite if we are actually viewing the route (index != -1)
    if (routeWaypoints.length > 0 && currentWaypointIndex !== -1) {
        // If we have an activeRouteId, use that
        if (activeRouteId) {
            return favorites.find(f => f.id === activeRouteId);
        }
        
        // Otherwise try to match
        const start = routeWaypoints[0];
        return favorites.find(f => 
            f.type === 'route' && 
            f.waypoints && 
            f.waypoints.length === routeWaypoints.length &&
            f.waypoints[0].name === start.name &&
            Math.abs(f.waypoints[0].lat - start.lat) < 0.001
        );
    } else if (locationInfo && locationInfo.coordinates) {
        return favorites.find(f => 
            (f.type === 'location' || !f.type) && 
            f.name === locationInfo.name && 
            Math.abs(f.lat - locationInfo.coordinates.lat) < 0.01 &&
            Math.abs(f.lng - locationInfo.coordinates.lng) < 0.01
        );
    }
    return undefined;
  };

  const currentFavorite = getCurrentFavorite();
  const isCurrentLocationFavorite = !!currentFavorite;

  const handleSaveFavorite = (name: string) => {
    if (currentFavorite) {
        // Edit existing
        setFavorites(prev => prev.map(f => f.id === currentFavorite.id ? { ...f, name: name } : f));
    } else {
        // Create new
        if (routeWaypoints.length > 0 && currentWaypointIndex !== -1) {
            const start = routeWaypoints[0];
            const newFav: FavoriteLocation = {
                id: `fav-route-${Date.now()}`,
                name: name,
                lat: start.lat,
                lng: start.lng,
                type: 'route',
                waypoints: routeWaypoints
            };
            setFavorites(prev => [...prev, newFav]);
            setActiveRouteId(newFav.id); // Automatically set as active
        } else if (locationInfo) {
            const newFav: FavoriteLocation = {
                id: `fav-loc-${Date.now()}`,
                name: name,
                lat: locationInfo.coordinates.lat,
                lng: locationInfo.coordinates.lng,
                type: 'location'
            };
            setFavorites(prev => [...prev, newFav]);
            // Automatically make visible
            setVisibleFavoriteIds(prev => [...prev, newFav.id]);
        }
    }
  };

  const handleUpdateFavorite = (updatedFav: FavoriteLocation) => {
      setFavorites(prev => prev.map(f => f.id === updatedFav.id ? updatedFav : f));
      
      // If this route is currently active, update the map immediately
      if (activeRouteId === updatedFav.id && updatedFav.type === 'route' && updatedFav.waypoints) {
          setRouteWaypoints(updatedFav.waypoints);
          if (updatedFav.waypoints.length === 0) {
             setCurrentWaypointIndex(-1);
          } else if (currentWaypointIndex >= updatedFav.waypoints.length) {
              setCurrentWaypointIndex(updatedFav.waypoints.length - 1);
          }
      }
  };

  const handleRemoveFavorite = (id?: string) => {
    const targetId = id || currentFavorite?.id;
    if (targetId) {
        setFavorites(prev => prev.filter(f => f.id !== targetId));
        setVisibleFavoriteIds(prev => prev.filter(vid => vid !== targetId));
        if (targetId === activeRouteId) {
            setActiveRouteId(null);
            setRouteWaypoints([]);
        }

        // Close panels if removing the currently displayed favorite
        if (currentFavorite && targetId === currentFavorite.id) {
            setIsFavoritesPanelOpen(false);
            handleClosePanel();
        }
    }
  };

  const handleToggleFavoriteVisibility = (fav: FavoriteLocation) => {
    if (fav.type === 'route') {
        if (activeRouteId === fav.id) {
            // Toggle Off
            setActiveRouteId(null);
            setRouteWaypoints([]);
            setCurrentWaypointIndex(-1);
        } else {
            // Toggle On
            setAutoRotate(false); // Stop rotation to ensure camera stays centered on waypoint
            if (fav.waypoints) {
                setRouteWaypoints(fav.waypoints);
                setActiveRouteId(fav.id);
                setCurrentWaypointIndex(0); // Explicitly start at beginning
                // Optionally fly to start
                if(fav.waypoints[0]) {
                     loadWaypointData(fav.waypoints[0]);
                }
            }
        }
    } else {
        // Location toggle
        setVisibleFavoriteIds(prev => {
            if (prev.includes(fav.id)) {
                return prev.filter(id => id !== fav.id);
            } else {
                return [...prev, fav.id];
            }
        });
    }
  };

  const handleFavoriteFlyTo = (fav: FavoriteLocation) => {
      setAutoRotate(false); // Stop rotation to ensure camera stays centered on waypoint
      
      // Logic similar to click
      if (fav.type === 'route') {
          if (activeRouteId !== fav.id) {
              handleToggleFavoriteVisibility(fav);
          } else {
               // Just look at start
               setCurrentWaypointIndex(0);
               if(fav.waypoints && fav.waypoints[0]) {
                   loadWaypointData(fav.waypoints[0]);
               }
          }
      } else {
          // If not visible, make visible?
          if (!visibleFavoriteIds.includes(fav.id)) {
              setVisibleFavoriteIds(prev => [...prev, fav.id]);
          }
          // Simulate marker click
          handleMarkerClick(fav, latLngToVector3(fav.lat, fav.lng, 1.0)); // vector radius doesn't matter much here as handleMarkerClick recalculates
      }
  };

  const handleFetchNews = useCallback(async () => {
    if (!locationInfo) return;
    setIsNewsFetching(true);
    try {
      const newsItems = await fetchAndValidateLocationNews(locationInfo.name, locationInfo);
      setLocationInfo(prev => {
         if (!prev) return null;
         return {
            ...prev,
            news: newsItems,
            sectionState: { ...prev.sectionState, news: "complete" }
         };
      });
      return newsItems;
    } catch (err) {
      console.error("Failed to fetch news:", err);
      setLocationInfo(prev => prev ? { ...prev, sectionState: { ...prev.sectionState, news: "error" } } : prev);
      throw err;
    } finally {
      setIsNewsFetching(false);
    }
  }, [locationInfo]);

  const handleLoadMoreNews = useCallback(async () => {
    if (!locationInfo) return;
    setIsNewsFetching(true);
    try {
      const currentTitles = (locationInfo.news || []).map((n: any) => n.title);
      const newNews = await fetchAndValidateLocationNews(locationInfo.name, locationInfo);
      setLocationInfo(prev => {
         if(!prev) return null;
         const uniqueNewNews = newNews.filter((n: any) => !currentTitles.includes(n.title));
         return {
            ...prev,
            news: [...(prev.news || []), ...uniqueNewNews]
         };
      });
    } catch (err) {
      console.error("Failed to load more news:", err);
      throw err;
    } finally {
      setIsNewsFetching(false);
    }
  }, [locationInfo]);


  const shouldPauseSuggestions = isFocused && !isZoomedOut;

  // Filter favorites for Earth component
  const earthFavorites = favorites.filter(f => visibleFavoriteIds.includes(f.id));
  
  // Logic to show/hide saved items based on panel state
  // If panel is closed, we hide all saved items (favorites prop handling in Earth relies on showFavorites)
  // And we must manually hide route markers if they are from a saved route
  const showSavedItems = isFavoritesPanelOpen;
  
  // If activeRouteId is set, it means we are viewing a saved route. 
  // If so, only show it if the favorites panel (favorites mode) is open.
  // If activeRouteId is null, it's a transient trace route, so we keep showing it.
  const displayRouteWaypoints = activeRouteId 
      ? (showSavedItems ? routeWaypoints : []) 
      : routeWaypoints;

  const isParchment = skin === 'parchment';
  
  const fovRadians = (45 * Math.PI) / 180;
  // Calculate baseline distance ignoring user zoom to keep the opening size fixed on zoom!
  const aspect = worldDimensions.width / worldDimensions.height;
  const baseDistance = aspect <= 1.28985 ? 3.0 : (3.0 * 1.28985) / aspect;
  const globeVisualRadius = worldDimensions.height / (2 * baseDistance * Math.tan(fovRadians / 2));
  const maskRadius = isParchment ? globeVisualRadius * 1.025 : 0;

  const canvasContainerStyle: React.CSSProperties = isParchment ? {
     position: 'absolute',
     inset: 0,
     zIndex: 10,
     clipPath: `circle(${maskRadius}px at center)`,
     WebkitClipPath: `circle(${maskRadius}px at center)`,
     transform: 'translateY(-15px)',
  } : {
     position: 'absolute',
     inset: 0,
     zIndex: 10,
  };

  return (
    <div 
      className={`relative w-full h-screen bg-black overflow-hidden bg-cover bg-center bg-no-repeat`}
      style={isParchment ? { backgroundImage: 'url(https://raw.githubusercontent.com/webpmp/webpmp.github.io/master/terra-explorer-noglobe.png)' } : {}}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Background Gradient for Parchment Theme Contrast */}
      {isParchment && (
         <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none z-0"></div>
      )}

      {/* 3D Scene */}
      <div id="canvas-container" style={canvasContainerStyle}>
        <Canvas camera={{ position: [0, 0, 4.5], fov: 45, near: 0.001, far: 1000 }}>
          <Suspense fallback={null}>
            <ambientLight intensity={skin === 'modern' || skin === 'parchment' ? 0.4 : 1.5} color={skin === 'modern' || skin === 'parchment' ? "#ccccff" : "#ffffff"} />
        <Sun skin={skin} />
        {(skin === 'modern' || skin === 'parchment') && (
           <pointLight position={[-10, 0, -5]} intensity={1.0} color="#0044ff" distance={20} />
        )}
        <Stars radius={300} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        
        <Earth 
          ref={earthRef}
          onLocationClick={handleGlobeClick} 
          onMarkerClick={handleMarkerClick}
          isInteracting={isInteracting || isDragging}
          setIsInteracting={setIsInteracting}
          autoRotate={autoRotate}
          skin={skin}
          boundary={locationInfo?.boundary}
          markers={markers}
          favorites={earthFavorites}
          showFavorites={showSavedItems}
          selectedMarkerId={selectedMarkerId}
          selectedMarkerCoordinates={selectedMarkerCoordinates}
          routeWaypoints={displayRouteWaypoints}
          currentWaypointIndex={currentWaypointIndex}
          scanningArea={scanningArea}
          onCameraChange={updateAuthoritativeCamera}
        />
        
        <VisibilityTracker 
            location={locationInfo} 
            onVisibilityChange={handleVisibilityChange} 
        />

        <OrbitControls 
          ref={cameraControlsRef} 
          minDistance={isZoomLocked && lockedZoomDistance ? lockedZoomDistance : 1.018} 
          maxDistance={isZoomLocked && lockedZoomDistance ? lockedZoomDistance : 8}
          enablePan={false}
          enableRotate={true}
          enableZoom={false}
          enableDamping={true}
          dampingFactor={0.05}
          onChange={() => {
            if (cameraControlsRef.current && !targetCameraPosRef.current) {
              updateCameraDistance(cameraControlsRef.current.getDistance());
            }
          }}
          onStart={() => {
            setIsDragging(true);
            setAutoRotate(false);
            userModifiedZoomRef.current = true;
            targetCameraPosRef.current = null;
            if (cameraStateRef.current) {
              cameraStateRef.current.targetRotation = null;
            }
            if (!isManualControlActiveRef.current) {
              isManualControlActiveRef.current = true;
              console.log('[Camera] MANUAL_CONTROL_STARTED');
            }
          }}
          onEnd={() => {
            setIsDragging(false);
            isManualControlActiveRef.current = false;
            if (cameraControlsRef.current) {
              updateCameraDistance(cameraControlsRef.current.getDistance());
            }
          }}
          target={[0, 0, 0]}
          makeDefault
        />

        <CameraAnimator 
           targetPosRef={targetCameraPosRef} 
           cameraControlsRef={cameraControlsRef} 
           cameraStateRef={cameraStateRef}
           activeScanIdRef={activeScanIdRef}
        />

        <AuthoritativeCameraEnforcer 
           skin={skin}
           cameraControlsRef={cameraControlsRef}
           targetCameraPosRef={targetCameraPosRef}
           isSidebarOpen={!!locationInfo || routeWaypoints.length > 0 || isFavoritesPanelOpen}
           cameraStateRef={cameraStateRef}
           parchmentZoom={parchmentZoom}
        />


        
            <RotationManager 
              isDragging={isDragging} 
              autoRotate={autoRotate} 
              setAutoRotate={setAutoRotate} 
              onZoomChange={(zoomedOut) => {
                 setIsZoomedOut(zoomedOut);
                 if (zoomedOut) setIsFocused(false);
              }}
              disabled={isDiscoveryLoading || routeWaypoints.length > 0 || !!locationInfo || markers.length > 0}
            />
          </Suspense>
        </Canvas>
      </div>

      {/* Parchment Engraved Depth Bevel Shadow Ring */}
      {isParchment && (
        <div 
          className="absolute pointer-events-none rounded-full"
          style={{
            zIndex: 15,
            top: '50%',
            left: '50%',
            width: `${maskRadius * 2 + 8}px`,
            height: `${maskRadius * 2 + 8}px`,
            transform: 'translate(-50%, -50%) translateY(-15px)',
            border: '8px solid #8b5a2b',
            boxShadow: 'inset 0 0 20px rgba(0, 0, 0, 0.85), 0 0 15px rgba(0, 0, 0, 0.65)',
            background: 'transparent',
          }}
        />
      )}

      {/* Retro Effect Overlay */}
      {(skin === 'retro-green' || skin === 'retro-amber') && <div className="scanlines"></div>}

      {/* UI Overlay */}
      <div className={`absolute top-8 left-8 z-10 pointer-events-none ${skin === 'parchment' ? 'hidden' : ''}`}>
        <img 
          src={
            skin === 'retro-green' ? logoImageGreen : 
            skin === 'retro-amber' ? logoImageAmber : 
            logoImageBlack
          } 
          alt="TerraExplorer Knowledge Engine" 
          className="drop-shadow-lg"
          style={{
            width: '240px',
            height: '211px',
            objectFit: 'contain'
          }}
        />
      </div>



      <div className="absolute top-[281px] left-8 z-30 flex flex-col gap-4 bottom-8 pointer-events-none w-[24rem]">
        {isFavoritesPanelOpen && (
          <FavoritesPanel 
              favorites={favorites}
              onClose={() => setIsFavoritesPanelOpen(false)}
              visibleFavoriteIds={visibleFavoriteIds}
              activeRouteId={activeRouteId}
              onToggleVisibility={handleToggleFavoriteVisibility}
              onUpdate={handleUpdateFavorite}
              onDelete={handleRemoveFavorite}
              onFlyTo={handleFavoriteFlyTo}
              skin={skin}
              dimmed={isTraceModalOpen}
          />
        )}

        {isSettingsOpen && (
          <SettingsPanel
            settings={userSettings}
            onUpdateSettings={handleUpdateSettings}
            onClose={() => setIsSettingsOpen(false)}
            skin={skin}
          />
        )}      </div>

      {interactionState === 'PIN_SELECTED' && (
        <InfoPanel 
          info={locationInfo} 
          isLoading={isInfoPanelLoading}
          isNewsFetching={isNewsFetching}
          onClose={handleClosePanel} 
          skin={skin}
          isFavorite={isCurrentLocationFavorite}
          onSaveFavorite={handleSaveFavorite}
          onRemoveFavorite={() => handleRemoveFavorite()}
          currentFavoriteName={currentFavorite?.name}
          onFetchNews={handleFetchNews}
          onLoadMoreNews={handleLoadMoreNews}
          routeNav={(routeWaypoints.length > 0 && currentWaypointIndex !== -1) ? {
              current: currentWaypointIndex + 1,
              total: routeWaypoints.length,
              onNext: handleNextWaypoint,
              onPrev: handlePrevWaypoint
          } : undefined}
        />
      )}

      <Controls 
        onSearch={handleSearch} 
        onTraceRoute={handleTraceRoute}
        onZoomIn={handleUserZoomIn} 
        onZoomOut={handleZoomOut}
        isSearching={isDiscoveryLoading}
        searchError={searchError}
        onClearError={() => setSearchError(null)}
        skin={skin}
        showFavorites={isFavoritesPanelOpen}
        onToggleShowFavorites={() => setIsFavoritesPanelOpen(!isFavoritesPanelOpen)}
        paused={shouldPauseSuggestions}
        isTraceModalOpen={isTraceModalOpen}
        onToggleTraceModal={setIsTraceModalOpen}
        isZoomLocked={isZoomLocked}
        onToggleZoomLock={() => {
           setIsZoomLocked(prev => {
              if (!prev) {
                 setLockedZoomDistance(cameraControlsRef.current?.getDistance() || null);
                 return true;
              } else {
                 setLockedZoomDistance(null);
                 return false;
              }
           });
        }}
        isScanningArea={isScanningArea}
        scanningStatusText={scanningStatusText}
        onCancelScan={handleCancelScan}
        onCycleSkin={handleCycleSkin}
        onToggleSettings={() => setIsSettingsOpen(!isSettingsOpen)}
      />
    </div>
  );
};

export default App;