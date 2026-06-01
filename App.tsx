
import React, { useState, useRef, useCallback, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { ChevronDown, Loader2 } from 'lucide-react';

import Earth from './components/Earth';
import InfoPanel from './components/InfoPanel';
import Controls from './components/Controls';
import FavoritesPanel from './components/FavoritesPanel';
import { LocationInfo, SkinType, MapMarker, FavoriteLocation, LocationType, Waypoint, GeoCoordinates } from './types';
import { resolveLocationQuery, getInfoFromCoordinates, getInfoFromFeature, getNearbyPlaces, getMoreNews, fetchLiveNews, generateRoute, extractEntityFromQuery, routeIntentAndExtractEntity } from './services/geminiService';
import logoImageBlack from './assets/logo-terra-explorer-black.png';
import logoImageGreen from './assets/logo-terra-explorer-green.png';

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
}> = ({ targetPosRef, cameraControlsRef }) => {
  useFrame(({ camera }) => {
    if (targetPosRef.current && cameraControlsRef.current) {
        camera.position.lerp(targetPosRef.current, 0.05);
        cameraControlsRef.current.update(); // Update controls to reflect new position
        
        if (camera.position.distanceTo(targetPosRef.current) < 0.05) {
            targetPosRef.current = null;
        }
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
       authoritativeDistance = baseDistance / parchmentZoom;
    } else {
       if (cameraState.activeRoute) {
          authoritativeDistance = cameraState.routeSuggestedDistance;
       } else {
          authoritativeDistance = cameraState.themeSuggestedDistance;
       }
    }
    
    // Force set camera distance strictly while preserving normalized rotation
    camera.position.normalize().multiplyScalar(authoritativeDistance);
    
    if (targetCameraPosRef.current) {
       targetCameraPosRef.current.normalize().multiplyScalar(authoritativeDistance);
    }
    
    controls.update();
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
     const diff = targetParchmentZoomRef.current - currentZoom;
     
     if (Math.abs(diff) < 0.001) {
        currentParchmentZoomRef.current = targetParchmentZoomRef.current;
        setParchmentZoom(targetParchmentZoomRef.current);
        parchmentZoomAnimRef.current = null;
        return;
     }
     
     const nextZoom = currentZoom + diff * 0.08; // Buttery smooth 0.08 smoothing factor
     currentParchmentZoomRef.current = nextZoom;
     setParchmentZoom(nextZoom);
     
     parchmentZoomAnimRef.current = requestAnimationFrame(animateParchmentZoom);
  }, []);


  const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(null);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [favorites, setFavorites] = useState<FavoriteLocation[]>([]);
  
  // Favorites UI State
  const [isFavoritesPanelOpen, setIsFavoritesPanelOpen] = useState(false);
  const [visibleFavoriteIds, setVisibleFavoriteIds] = useState<string[]>([]);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);

  // Route State
  const [routeWaypoints, setRouteWaypoints] = useState<Waypoint[]>([]);
  const [currentWaypointIndex, setCurrentWaypointIndex] = useState<number>(-1);
  const [isTraceModalOpen, setIsTraceModalOpen] = useState(false);

  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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
  
  const [currentCameraDistance, setCurrentCameraDistance] = useState(4.5);
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
    setCurrentCameraDistance(dist);
    currentCameraDistanceRef.current = dist;
    cameraStateRef.current.themeSuggestedDistance = dist;
    cameraStateRef.current.routeSuggestedDistance = dist;
  }, []);

  const reconcileCameraState = useCallback(() => {
     if (!cameraControlsRef.current) return;
     
     // Cancel manual zoom animations on programmatic transitions
     targetZoomRef.current = null;
     if (zoomAnimRef.current) {
        cancelAnimationFrame(zoomAnimRef.current);
        zoomAnimRef.current = null;
     }

     const cameraState = cameraStateRef.current;

     const isSidebarOpen = !!locationInfo || routeWaypoints.length > 0 || isFavoritesPanelOpen;

     // Only allow target rotation updates
     if (cameraState.targetRotation && earthRef.current) {
        const { lat, lng } = cameraState.targetRotation;
        
        let targetDistance = 4.5;
        if (skin === 'parchment') {
           const aspect = window.innerWidth / window.innerHeight;
           const baseDistance = aspect <= 1.28985 ? 3.0 : (3.0 * 1.28985) / aspect;
           targetDistance = baseDistance / parchmentZoom;
        } else if (cameraState.activeRoute) {
           targetDistance = cameraState.routeSuggestedDistance;
        } else {
           targetDistance = cameraState.themeSuggestedDistance;
        }
        
        const localCameraVec = latLngToVector3(lat, lng, targetDistance);
        const worldCameraPos = localCameraVec.clone().applyMatrix4(earthRef.current.matrixWorld);
        targetCameraPosRef.current = worldCameraPos;
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
  

  
  const [isSkinMenuOpen, setIsSkinMenuOpen] = useState(false);
  
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
                routeTitle: "Endurance Expedition" 
            },
            { 
                id: 'wp-shackleton-2', 
                name: "Buenos Aires, Argentina", 
                lat: -34.6037, 
                lng: -58.3816, 
                context: "October 9, 1914: The ship arrives to pick up supplies and crew.", 
                routeTitle: "Endurance Expedition" 
            },
            { 
                id: 'wp-shackleton-3', 
                name: "Grytviken, South Georgia", 
                lat: -54.2811, 
                lng: -36.5092, 
                context: "December 5, 1914: The expedition departs the whaling station for the Weddell Sea.", 
                routeTitle: "Endurance Expedition" 
            },
            { 
                id: 'wp-shackleton-4', 
                name: "Weddell Sea (Ice Trap)", 
                lat: -76.5, 
                lng: -35.0, 
                context: "January 1915: The Endurance becomes frozen fast in the pack ice.", 
                routeTitle: "Endurance Expedition" 
            },
            { 
                id: 'wp-shackleton-5', 
                name: "Endurance Sinks", 
                lat: -69.08, 
                lng: -51.5, 
                context: "November 21, 1915: Crushed by ice, the ship sinks, stranding the crew.", 
                routeTitle: "Endurance Expedition" 
            },
            { 
                id: 'wp-shackleton-6', 
                name: "Elephant Island", 
                lat: -61.1417, 
                lng: -55.2333, 
                context: "April 1916: The crew reaches solid land for the first time in 497 days.", 
                routeTitle: "Endurance Expedition" 
            },
            { 
                id: 'wp-shackleton-7', 
                name: "King Haakon Bay", 
                lat: -54.1500, 
                lng: -37.2333, 
                context: "May 1916: Shackleton and five men land after the perilous voyage of the James Caird.", 
                routeTitle: "Endurance Expedition" 
            },
            { 
                id: 'wp-shackleton-8', 
                name: "Stromness Whaling Station", 
                lat: -54.1600, 
                lng: -36.7110, 
                context: "May 20, 1916: Shackleton, Worsley, and Crean reach safety after crossing the mountains.", 
                routeTitle: "Endurance Expedition" 
            },
             { 
                id: 'wp-shackleton-9', 
                name: "Punta Arenas, Chile", 
                lat: -53.1638, 
                lng: -70.9171, 
                context: "August 30, 1916: The tug Yelcho, commanded by Luis Pardo, finally rescues the remaining crew from Elephant Island.", 
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
                routeTitle: "Campaigns of Genghis Khan"
            },
            {
                id: 'wp-genghis-2',
                name: "Yinchuan (Western Xia)",
                lat: 38.4872,
                lng: 106.2309,
                context: "1209: The Mongols force the Western Xia emperor to submit.",
                routeTitle: "Campaigns of Genghis Khan"
            },
            {
                id: 'wp-genghis-3',
                name: "Zhongdu (Beijing)",
                lat: 39.9042,
                lng: 116.4074,
                context: "1215: The Jin capital is captured and sacked after a long siege.",
                routeTitle: "Campaigns of Genghis Khan"
            },
            {
                id: 'wp-genghis-4',
                name: "Balasagun",
                lat: 42.746,
                lng: 75.25,
                context: "1218: General Jebe conquers the Qara Khitai empire.",
                routeTitle: "Campaigns of Genghis Khan"
            },
            {
                id: 'wp-genghis-5',
                name: "Otrar",
                lat: 42.85,
                lng: 68.3,
                context: "1219: The Khwarazmian governor executes Mongol envoys, triggering invasion.",
                routeTitle: "Campaigns of Genghis Khan"
            },
            {
                id: 'wp-genghis-6',
                name: "Bukhara",
                lat: 39.7681,
                lng: 64.4556,
                context: "1220: Genghis Khan captures the city and addresses the populace in the mosque.",
                routeTitle: "Campaigns of Genghis Khan"
            },
            {
                id: 'wp-genghis-7',
                name: "Samarkand",
                lat: 39.6542,
                lng: 66.9597,
                context: "1220: The capital of the Khwarazmian Empire falls.",
                routeTitle: "Campaigns of Genghis Khan"
            },
             {
                id: 'wp-genghis-8',
                name: "Indus River",
                lat: 33.9,
                lng: 72.2,
                context: "1221: Genghis Khan defeats Jalal ad-Din Mingburnu on the banks of the Indus.",
                routeTitle: "Campaigns of Genghis Khan"
            },
            {
                id: 'wp-genghis-9',
                name: "Liupan Mountains",
                lat: 35.6,
                lng: 106.2,
                context: "1227: Genghis Khan dies during the final campaign against Western Xia.",
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
                routeTitle: "Lewis and Clark Expedition"
            },
            {
                id: 'wp-lc-2',
                name: "St. Charles",
                lat: 38.7758,
                lng: -90.4851,
                context: "May 16-21, 1804: The expedition makes final preparations and recruits the last crew members.",
                routeTitle: "Lewis and Clark Expedition"
            },
            {
                id: 'wp-lc-3',
                name: "Kaw Point",
                lat: 39.117,
                lng: -94.606,
                context: "June 26, 1804: The explorers reach the confluence of the Kansas and Missouri rivers.",
                routeTitle: "Lewis and Clark Expedition"
            },
            {
                id: 'wp-lc-4',
                name: "Sergeant Floyd Monument",
                lat: 42.4631,
                lng: -96.3838,
                context: "August 20, 1804: Sergeant Charles Floyd dies of appendicitis, the expedition's only fatality.",
                routeTitle: "Lewis and Clark Expedition"
            },
            {
                id: 'wp-lc-5',
                name: "Council Bluff",
                lat: 41.434,
                lng: -96.009,
                context: "August 3, 1804: Lewis and Clark hold their first formal council with the Oto and Missouri tribes.",
                routeTitle: "Lewis and Clark Expedition"
            },
            {
                id: 'wp-lc-6',
                name: "Spirit Mound",
                lat: 42.8425,
                lng: -96.942,
                context: "August 25, 1804: The captains climb this mound to investigate local legends of 'little people'.",
                routeTitle: "Lewis and Clark Expedition"
            },
            {
                id: 'wp-lc-7',
                name: "Fort Mandan",
                lat: 47.297926,
                lng: -101.08726,
                context: "Winter 1804-1805: The expedition builds a fort for the winter and meets Sacagawea.",
                routeTitle: "Lewis and Clark Expedition"
            },
            {
                id: 'wp-lc-8',
                name: "Knife River Indian Villages",
                lat: 47.375,
                lng: -101.405,
                context: "Major trade hub where the captains gathered vital geographical information from the Hidatsa.",
                routeTitle: "Lewis and Clark Expedition"
            },
            {
                id: 'wp-lc-9',
                name: "Great Falls (Lower Portage)",
                lat: 47.516,
                lng: -111.378,
                context: "June 1805: The expedition faces a grueling month-long portage around the massive waterfalls.",
                routeTitle: "Lewis and Clark Expedition"
            },
            {
                id: 'wp-lc-10',
                name: "Three Forks of the Missouri",
                lat: 45.894,
                lng: -111.927,
                context: "July 1805: The explorers discover the headwaters of the Missouri River.",
                routeTitle: "Lewis and Clark Expedition"
            },
            {
                id: 'wp-lc-11',
                name: "Lemhi Pass",
                lat: 44.975833,
                lng: -113.441944,
                context: "August 12, 1805: Meriwether Lewis crosses the Continental Divide, leaving US territory.",
                routeTitle: "Lewis and Clark Expedition"
            },
            {
                id: 'wp-lc-12',
                name: "Fort Clatsop",
                lat: 46.133611,
                lng: -123.880278,
                context: "Winter 1805-1806: The Corps achieves their goal, wintering on the Pacific Coast.",
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
                routeTitle: "Franklin Expedition Route"
            },
            {
                id: 'wp-fr-2',
                name: "Stromness, Orkney",
                lat: 58.965,
                lng: -3.296,
                context: "Final port of call in the UK.",
                routeTitle: "Franklin Expedition Route"
            },
            {
                id: 'wp-fr-3',
                name: "Whalefish Islands, Greenland",
                lat: 69.25,
                lng: -53.53,
                context: "July 1845: Five men sent home, provisions loaded. Last letters sent.",
                routeTitle: "Franklin Expedition Route"
            },
            {
                id: 'wp-fr-4',
                name: "Lancaster Sound",
                lat: 74.25,
                lng: -84.0,
                context: "Late July 1845: Last spotted by European whalers waiting for ice to clear.",
                routeTitle: "Franklin Expedition Route"
            },
            {
                id: 'wp-fr-5',
                name: "Beechey Island",
                lat: 74.716,
                lng: -91.833,
                context: "Winter 1845-1846: Expedition camps here. Three crewmen die and are buried.",
                routeTitle: "Franklin Expedition Route"
            },
            {
                id: 'wp-fr-6',
                name: "Cornwallis Island",
                lat: 75.15,
                lng: -95.0,
                context: "1846: The ships circumnavigated this island before heading south.",
                routeTitle: "Franklin Expedition Route"
            },
            {
                id: 'wp-fr-7',
                name: "Peel Sound",
                lat: 73.0,
                lng: -96.5,
                context: "Summer 1846: Sailed south towards King William Island.",
                routeTitle: "Franklin Expedition Route"
            },
            {
                id: 'wp-fr-8',
                name: "Point Victory",
                lat: 69.63,
                lng: -98.81,
                context: "Sept 1846: Ships beset in ice. April 1848: Ships abandoned by survivors.",
                routeTitle: "Franklin Expedition Route"
            },
            {
                id: 'wp-fr-9',
                name: "Terror Bay",
                lat: 68.89,
                lng: -98.94,
                context: "Resting place of the HMS Terror, discovered in 2016.",
                routeTitle: "Franklin Expedition Route"
            },
            {
                id: 'wp-fr-10',
                name: "Queen Maud Gulf",
                lat: 68.25,
                lng: -98.9,
                context: "Resting place of the HMS Erebus, discovered in 2014.",
                routeTitle: "Franklin Expedition Route"
            }
        ]
    };

    setFavorites([shackletonRoute, genghisRoute, lewisClarkRoute, franklinRoute]);
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
  }, []);
  const loadWaypointData = useCallback(async (wp: Waypoint) => {
     setInteractionState('PIN_SELECTED');
     setIsLoading(true);
     setIsNewsFetching(false);
     setLocationInfo(null);
     setSelectedMarkerId(wp.id);
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

     // Fetch full info
     const data = await getInfoFromCoordinates(wp.lat, wp.lng);
     
     if (data) {
        if (wp.context) {
            const routeLabel = wp.routeTitle || "From Route";
            data.routeContext = {
                title: routeLabel,
                text: wp.context
            };
        }

        // Add default note for specific Genghis Khan waypoint
        if (wp.id === 'wp-genghis-1') {
            data.defaultNote = "Waypoints from https://www.worldhistory.org/image/11221/map-of-the-campaigns-of-genghis-khan/";
        }

        setLocationInfo(data);
        setIsLoading(false);

        if (data.name) {
            setIsNewsFetching(true);
            const news = await fetchLiveNews(data.name);
            setLocationInfo(prev => {
                if (!prev || prev.name !== data.name) return prev;
                return { ...prev, news };
            });
            setIsNewsFetching(false);
        }
     } else {
         setIsLoading(false);
     }
  }, [isZoomLocked, lockedZoomDistance, reconcileCameraState]);
  const handleMarkerClick = useCallback(async (marker: MapMarker | FavoriteLocation | Waypoint, point: THREE.Vector3) => {
    setInteractionState('PIN_SELECTED');
    setSearchError(null);
    setAutoRotate(false);
    setSelectedMarkerId(marker.id);
    setIsFocused(true);
    
    // Check if this is a Route Favorite
    const fav = marker as FavoriteLocation;
    if (fav.type === 'route' && fav.waypoints) {
        // Load the saved route
        setRouteWaypoints(fav.waypoints);
        setActiveRouteId(fav.id); // Mark as active
        setCurrentWaypointIndex(0);
        if (fav.waypoints.length > 0) {
            loadWaypointData(fav.waypoints[0]);
        }
        return;
    }

    const isRoutePoint = 'context' in marker || 'routeTitle' in marker;

    if (isRoutePoint) {
        const wp = marker as Waypoint;
        // Even if we don't find it in routeWaypoints, we should still load it!
        const idx = routeWaypoints.findIndex(w => w.id === wp.id);
        if (idx !== -1) {
            setCurrentWaypointIndex(idx);
        }
        loadWaypointData(wp);
        return;
    } else {
        // If clicking a normal marker, only clear route if it wasn't a "checked" route
        if (!activeRouteId) {
            setRouteWaypoints([]);
            setCurrentWaypointIndex(-1);
        } else {
              setCurrentWaypointIndex(-1);
        }
    }
    
    setLocationInfo({
        name: marker.name,
        type: LocationType.POI, 
        description: "",
        population: "",
        climate: "",
        funFacts: [],
        coordinates: { lat: marker.lat, lng: marker.lng },
        news: [],
        notable: []
    });

    setIsLoading(true);
    setIsNewsFetching(false);

    if (cameraControlsRef.current) {
        const targetDist = isZoomLocked && lockedZoomDistance ? lockedZoomDistance : 1.5;
        
        cameraStateRef.current.routeSuggestedDistance = targetDist;
        cameraStateRef.current.targetRotation = { lat: marker.lat, lng: marker.lng };
        
        requestAnimationFrame(() => {
           reconcileCameraState();
        });
    }

    const data = await getInfoFromFeature(marker.name, marker.lat, marker.lng);
    
    console.log(`[Click Debug] featureId: ${marker.id}, label text: ${marker.name}, resolved entity name: ${data?.name}`);
    
    setLocationInfo(data);
    setIsLoading(false);

    if (data && data.name) {
       setIsNewsFetching(true);
       const news = await fetchLiveNews(data.name);
       setLocationInfo(prev => {
         if (!prev || prev.name !== data.name) return prev; 
         return { ...prev, news };
       });
       setIsNewsFetching(false);
     }
  }, [routeWaypoints, loadWaypointData, activeRouteId, isZoomLocked, lockedZoomDistance, reconcileCameraState]);  
  
  const setScanStatus = useCallback((text: string | null) => {
     setScanningStatusText(text);
     scanStatusRef.current = text;
  }, []);

  const startScan = useCallback((location: GeoCoordinates) => {
     activeScanIdRef.current++;
     scanResolvedRef.current = false;
     scanFullyProcessedRef.current = false;
     console.log("scan_started");
     console.log("triangulation_started");
     setScanningArea(location);
     setIsScanningArea(true);
     setScanStatus("Starting scan");

     setInteractionState('GLOBE_SEARCHING');
     setIsLoading(true);
     setLocationInfo(null); // Ensure NO overlay is opened
     setSearchError(null);
     setAutoRotate(false); 
     setMarkers([]); // Clear transient markers
     
     if (!activeRouteId) {
         setRouteWaypoints([]);
         setCurrentWaypointIndex(-1);
     } else {
         setCurrentWaypointIndex(-1);
     }
     
     setSelectedMarkerId(null);
     setIsFocused(false);

     if (cameraControlsRef.current) {
       const targetDist = isZoomLocked && lockedZoomDistance ? lockedZoomDistance : 2.2;
       
       cameraStateRef.current.routeSuggestedDistance = targetDist;
       cameraStateRef.current.targetRotation = { lat: location.lat, lng: location.lng };
       
       requestAnimationFrame(() => {
          reconcileCameraState();
       });
     }
  }, [activeRouteId, isZoomLocked, lockedZoomDistance, reconcileCameraState, setScanStatus]);

  const resolveScan = useCallback(async (result: { type: "results", data: MapMarker[] } | { type: "empty", message: string }) => {
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
        setScanStatus("Scan complete");
        setMarkers(result.data);
     } else {
        setScanStatus(result.message);
     }

     // Keep scan rings briefly, then fade out
     await new Promise(resolve => setTimeout(resolve, 1500));
     if (currentScanId !== activeScanIdRef.current) return;
     setScanningArea(null);
     setIsScanningArea(false);

     // Return to default state after short delay
     await new Promise(resolve => setTimeout(resolve, 2000));
     if (currentScanId !== activeScanIdRef.current) return;
     setScanStatus(null);
     setIsLoading(false);
     if (result.type === "results") {
        setInteractionState('PINS_RENDERED');
     }
  }, [setScanStatus]);

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
     setScanStatus(error);

     // Keep scan rings briefly, then fade out
     await new Promise(resolve => setTimeout(resolve, 1500));
     if (currentScanId !== activeScanIdRef.current) return;
     setScanningArea(null);
     setIsScanningArea(false);

     // Return to default state after short delay
     await new Promise(resolve => setTimeout(resolve, 2000));
     if (currentScanId !== activeScanIdRef.current) return;
     setScanStatus(null);
     setIsLoading(false);
     setInteractionState('GLOBE_IDLE');
  }, [setScanStatus]);

   const handleCancelScan = useCallback(() => {
      scanFullyProcessedRef.current = true;
      failScan("Scan cancelled");
   }, [failScan]);

  const handleGlobeClick = useCallback(async (lat: number, lng: number, point: THREE.Vector3) => {
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
            let result = await getNearbyPlaces(lat, lng, 25);

            if (currentScanId !== activeScanIdRef.current) return;

            // Wait for the visual progress animation (up to "Checking area") to finish first to enforce visual pacing
            await progressPromise;
            if (currentScanId !== activeScanIdRef.current) return;

            // Explicit "Processing results" phase
            setScanStatus("Reviewing results");
            await new Promise(resolve => setTimeout(resolve, 800));
            if (currentScanId !== activeScanIdRef.current) return;

            // Fallback enrichment flow: if raw results are empty, fetch 100km radius places
            if (!result || result.length === 0) {
               setScanStatus("Finalizing results");
               result = await getNearbyPlaces(lat, lng, 100);
               if (currentScanId !== activeScanIdRef.current) return;

               await new Promise(resolve => setTimeout(resolve, 800));
               if (currentScanId !== activeScanIdRef.current) return;
            } else {
               setScanStatus("Finalizing results");
               await new Promise(resolve => setTimeout(resolve, 500));
               if (currentScanId !== activeScanIdRef.current) return;
            }

            // Pipeline fully complete - trigger completion gate
            scanFullyProcessedRef.current = true;

            if (result && result.length > 0) {
               console.log("scan_results_received");
               const finalMarkers = result.map(m => ({
                  id: m.id,
                  name: m.name,
                  lat: m.lat,
                  lng: m.lng,
                  populationClass: m.populationClass
               }));
               await resolveScan({ type: "results", data: finalMarkers });
            } else {
                console.log("scan_results_empty");
                const emptyMsg = "No information found in this area";
                await resolveScan({ type: "empty", message: emptyMsg });
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
   }, [routeWaypoints, handleMarkerClick, startScan, resolveScan, failScan, setScanStatus]);;

  const handleSearch = async (query: string) => {
    const cleanQuery = query.trim();
    if (!cleanQuery) return;

    // 1. Intent routing & entity extraction
    const parsedQuery = routeIntentAndExtractEntity(cleanQuery);
    console.log(`[DEBUG] Intent Routed: ${parsedQuery.intent}, Extracted Entity: "${parsedQuery.entity}"`);

    setInteractionState('PIN_SELECTED');
    setIsLoading(true);
    setIsNewsFetching(false);
    setLocationInfo(null);
    setSearchError(null);
    setAutoRotate(false);
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
    const result = await resolveLocationQuery(parsedQuery.entity);
    
    setScanningStatusText(null);

    if (result && result.locationInfo && result.locationInfo.coordinates) {
      const { lat, lng } = result.locationInfo.coordinates;
      
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
      setIsLoading(false);

      const targetDist = isZoomLocked && lockedZoomDistance ? lockedZoomDistance : Math.max(1.3, 4.5 - ((result.suggestedZoom / 10) * (4.5 - 1.2)));
      
      cameraStateRef.current.routeSuggestedDistance = targetDist;
      cameraStateRef.current.targetRotation = { lat, lng };
      
      requestAnimationFrame(() => {
         reconcileCameraState();
      });

      if (result.locationInfo.name) {
        setIsNewsFetching(true);
        const news = await fetchLiveNews(result.locationInfo.name);
        setLocationInfo(prev => {
          if (!prev || prev.name !== result.locationInfo.name) return prev;
          return { ...prev, news };
        });
        setIsNewsFetching(false);
      }

    } else {
      let userError = "COULD NOT RESOLVE LOCATION";
      const errorCode = result?.error;
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
      setIsLoading(false);
    }
  };

  const handleTraceRoute = async (text: string) => {
      setInteractionState('PIN_SELECTED');
      setIsLoading(true);
      setSearchError(null);
      setLocationInfo(null);
      setAutoRotate(false);
      setMarkers([]); 
      setScanningArea(null);
      setIsFocused(true);
      
      // Clear current active route when generating new one
      setActiveRouteId(null);
      
      const waypoints = await generateRoute(text);
      
      if (waypoints.length > 0) {
          setRouteWaypoints(waypoints);
          setCurrentWaypointIndex(0);
          loadWaypointData(waypoints[0]);
      } else {
          setSearchError("No identifiable locations found in the text.");
          setIsLoading(false);
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
    if (skin === 'parchment') {
       const aspect = window.innerWidth / window.innerHeight;
       const baseDistance = aspect <= 1.28985 ? 3.0 : (3.0 * 1.28985) / aspect;
       return baseDistance;
    }
    const minZ = isZoomLocked && lockedZoomDistance ? lockedZoomDistance : 1.2;
    const maxZ = isZoomLocked && lockedZoomDistance ? lockedZoomDistance : 8;
    return Math.max(minZ, Math.min(maxZ, z));
  }, [isZoomLocked, lockedZoomDistance, skin]);

  const animateZoom = useCallback(() => {
    if (!cameraControlsRef.current || targetZoomRef.current === null) {
      zoomAnimRef.current = null;
      return;
    }

    const camera = cameraControlsRef.current.object;
    const currentZoom = cameraControlsRef.current.getDistance();
    const diff = targetZoomRef.current - currentZoom;

    // smoothing factor (tune 0.08-0.15)
    const nextZoom = currentZoom + diff * 0.12;
    camera.position.normalize().multiplyScalar(nextZoom);
    cameraControlsRef.current?.update();

    updateCameraDistance(nextZoom);

    if (Math.abs(diff) > 0.001) {
      zoomAnimRef.current = requestAnimationFrame(animateZoom);
    } else {
      zoomAnimRef.current = null;
      targetZoomRef.current = null;
    }
  }, [updateCameraDistance]);

  const BUTTON_ZOOM_FACTOR = 1.25;

  const handleZoomIn = useCallback(() => {
    if (skin === 'parchment') {
       targetParchmentZoomRef.current = Math.min(3.0, targetParchmentZoomRef.current * BUTTON_ZOOM_FACTOR);
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
       targetParchmentZoomRef.current = Math.max(0.4, targetParchmentZoomRef.current / BUTTON_ZOOM_FACTOR);
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
    const WHEEL_SENSITIVITY = 0.02;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (skin === 'parchment') {
         targetParchmentZoomRef.current = Math.max(0.4, Math.min(3.0, targetParchmentZoomRef.current - e.deltaY * 0.0015));
         if (!parchmentZoomAnimRef.current) {
            parchmentZoomAnimRef.current = requestAnimationFrame(animateParchmentZoom);
         }
         return;
      }

      if (!isZoomLocked && cameraControlsRef.current) {
        targetZoomRef.current = targetZoomRef.current ?? cameraControlsRef.current.getDistance();
        targetZoomRef.current = clampZoom(targetZoomRef.current + e.deltaY * WHEEL_SENSITIVITY);
        
        userModifiedZoomRef.current = true;

        if (!zoomAnimRef.current) {
          zoomAnimRef.current = requestAnimationFrame(animateZoom);
        }
      }
    };

    const container = document.getElementById('canvas-container');
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [isZoomLocked, clampZoom, animateZoom, skin]);

  const handleClosePanel = () => {
    setInteractionState('GLOBE_IDLE');
    setLocationInfo(null);
    setSelectedMarkerId(null);
    setIsNewsFetching(false);
    setIsFocused(false);
    setMarkers([]); // Clear markers on close
    setScanningArea(null);
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

  const handleLoadMoreNews = useCallback(async () => {
    if (!locationInfo) return;
    
    const currentHeadlines = locationInfo.news.map(n => n.headline);
    const newNews = await getMoreNews(locationInfo.name, currentHeadlines);
    
    setLocationInfo(prev => {
       if(!prev) return null;
       const uniqueNewNews = newNews.filter(n => !prev.news.some(pn => pn.headline === n.headline));
       return {
          ...prev,
          news: [...prev.news, ...uniqueNewNews]
       }
    });
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
        <Canvas camera={{ position: [0, 0, 4.5], fov: 45 }}>
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
          routeWaypoints={displayRouteWaypoints}
          currentWaypointIndex={currentWaypointIndex}
          scanningArea={scanningArea}
        />
        
        <VisibilityTracker 
            location={locationInfo} 
            onVisibilityChange={handleVisibilityChange} 
        />

        <OrbitControls 
          ref={cameraControlsRef} 
          minDistance={isZoomLocked && lockedZoomDistance ? lockedZoomDistance : 1.2} 
          maxDistance={isZoomLocked && lockedZoomDistance ? lockedZoomDistance : 8}
          enablePan={false}
          enableRotate={true}
          enableZoom={false}
          enableDamping={true}
          dampingFactor={0.05}
          onChange={() => {
            if (cameraControlsRef.current) {
              updateCameraDistance(cameraControlsRef.current.getDistance());
            }
          }}
          onStart={() => {
            setIsDragging(true);
            setAutoRotate(false);
            userModifiedZoomRef.current = true;
            targetCameraPosRef.current = null;
          }}
          onEnd={() => {
            setIsDragging(false);
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
              disabled={isLoading || routeWaypoints.length > 0 || !!locationInfo || markers.length > 0}
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
          src={skin === 'retro-green' ? logoImageGreen : logoImageBlack} 
          alt="TerraExplorer Knowledge Engine" 
          className="drop-shadow-lg"
          style={{
            width: '240px',
            height: '211px',
            objectFit: 'contain',
            ...(skin === 'retro-amber' ? { filter: 'invert(1) sepia(1) saturate(12) hue-rotate(340deg) brightness(0.4) contrast(1.1)' } :
               {})
          }}
        />
      </div>

      {/* Skin Selector */}
      <div className="absolute top-8 right-8 z-30 flex flex-col items-end">
        <button 
          onClick={() => setIsSkinMenuOpen(!isSkinMenuOpen)}
          className={`px-3 py-1 flex items-center gap-1 text-xs transition-all ${
            skin === 'modern' ? 'bg-cyan-500 text-black border border-cyan-500 font-bold rounded-full' : 
            skin === 'retro-green' ? 'bg-green-400 text-black border border-green-400 font-bold font-mono rounded-none' :
            skin === 'parchment' ? 'bg-[#D2B48C] text-[#3e2723] border border-[#3e2723] font-bold rounded shadow-sm' :
            'bg-amber-400 text-black border border-amber-400 font-bold font-mono rounded-none'
          }`}
        >
          {skin === 'modern' ? 'MODERN' : skin === 'retro-green' ? 'CRT-G' : skin === 'parchment' ? 'PARCHMENT' : 'CRT-A'}
          <ChevronDown size={14} />
        </button>

        {isSkinMenuOpen && (
          <div className="mt-2 flex flex-col w-28 bg-black/80 backdrop-blur border border-white/20 rounded shadow-xl overflow-hidden">
            <button 
              onClick={() => { handleSkinChange('modern'); setIsSkinMenuOpen(false); }}
              className={`px-3 py-2 text-xs text-left hover:bg-white/10 ${skin === 'modern' ? 'text-white font-bold bg-white/5' : 'text-gray-400'}`}
            >
              MODERN
            </button>
            <button 
              onClick={() => { handleSkinChange('retro-green'); setIsSkinMenuOpen(false); }}
              className={`px-3 py-2 text-xs text-left font-mono hover:bg-white/10 ${skin === 'retro-green' ? 'text-green-400 font-bold bg-white/5' : 'text-green-400/50'}`}
            >
              CRT-G
            </button>
            <button 
              onClick={() => { handleSkinChange('retro-amber'); setIsSkinMenuOpen(false); }}
              className={`px-3 py-2 text-xs text-left font-mono hover:bg-white/10 ${skin === 'retro-amber' ? 'text-amber-400 font-bold bg-white/5' : 'text-amber-400/50'}`}
            >
              CRT-A
            </button>
            <button 
              onClick={() => { handleSkinChange('parchment'); setIsSkinMenuOpen(false); }}
              className={`px-3 py-2 text-xs text-left hover:bg-white/10 ${skin === 'parchment' ? 'text-[#D2B48C] font-bold bg-white/5' : 'text-[#D2B48C]/50'}`}
            >
              PARCHMENT
            </button>
          </div>
        )}
      </div>

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


      {interactionState === 'PIN_SELECTED' && (
        <InfoPanel 
          info={locationInfo} 
          isLoading={isLoading}
          isNewsFetching={isNewsFetching}
          onClose={handleClosePanel} 
          skin={skin}
          isFavorite={isCurrentLocationFavorite}
          onSaveFavorite={handleSaveFavorite}
          onRemoveFavorite={() => handleRemoveFavorite()}
          currentFavoriteName={currentFavorite?.name}
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
        isSearching={isLoading}
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
      />
    </div>
  );
};

export default App;
