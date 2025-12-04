
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Stars, CameraControls } from '@react-three/drei';
import * as THREE from 'three';

import Earth from './components/Earth';
import InfoPanel from './components/InfoPanel';
import Controls from './components/Controls';
import FavoritesPanel from './components/FavoritesPanel';
import { LocationInfo, SkinType, MapMarker, FavoriteLocation, LocationType, Waypoint } from './types';
import { resolveLocationQuery, getInfoFromCoordinates, getNearbyPlaces, getMoreNews, fetchLiveNews, generateRoute } from './services/geminiService';

// Helper to convert Lat/Lng to 3D Cartesian coordinates (Local Space)
const latLngToVector3 = (lat: number, lng: number, radius: number = 1) => {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = (radius * Math.sin(phi) * Math.sin(theta));
  const y = (radius * Math.cos(phi));
  return new THREE.Vector3(x, y, z);
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
  onZoomChange: (isZoomedOut: boolean) => void;
  disabled: boolean;
}> = ({ isDragging, autoRotate, setAutoRotate, onZoomChange, disabled }) => {
  const wasZoomedOutRef = useRef(true);

  useFrame(({ camera }) => {
    const dist = camera.position.length();
    // Max distance is 5. Consider zoomed out when close to max.
    const isZoomedOut = dist > 4.5;
    
    if (wasZoomedOutRef.current !== isZoomedOut) {
      onZoomChange(isZoomedOut);
      wasZoomedOutRef.current = isZoomedOut;
    }

    if (isDragging) return;
    
    // Check if we are at max distance (zoomed all the way out)
    // If user zooms out to ~4.8 units (max is 5), resume rotation
    // We prioritize this over 'disabled' status if the user intentionally zooms out far enough
    if (dist > 4.8 && !autoRotate) {
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
  const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(null);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [favorites, setFavorites] = useState<FavoriteLocation[]>([]);
  
  // Favorites UI State
  const [isFavoritesPanelOpen, setIsFavoritesPanelOpen] = useState(false);
  const [visibleFavoriteIds, setVisibleFavoriteIds] = useState<string[]>([]);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);

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
  
  // Route State
  const [routeWaypoints, setRouteWaypoints] = useState<Waypoint[]>([]);
  const [currentWaypointIndex, setCurrentWaypointIndex] = useState<number>(-1);
  const [isTraceModalOpen, setIsTraceModalOpen] = useState(false);
  
  // Track focus state to manage suggestions pausing
  const [isFocused, setIsFocused] = useState(false);
  
  const cameraControlsRef = useRef<CameraControls>(null);
  const earthRef = useRef<THREE.Mesh>(null);

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

    setFavorites([shackletonRoute, genghisRoute, lewisClarkRoute]);
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

  const handleVisibilityChange = useCallback((visible: boolean) => {
    setIsLocationVisible(visible);
  }, []);

  const loadWaypointData = useCallback(async (wp: Waypoint) => {
     setIsLoading(true);
     setIsNewsFetching(false);
     setLocationInfo(null);
     setSelectedMarkerId(wp.id);
     setIsFocused(true);

     // Move camera
     if (earthRef.current && cameraControlsRef.current) {
        const targetDist = 2.0; 
        const localCameraVec = latLngToVector3(wp.lat, wp.lng, targetDist);
        const worldCameraPos = localCameraVec.clone().applyMatrix4(earthRef.current.matrixWorld);
        
        cameraControlsRef.current.setLookAt(
            worldCameraPos.x, worldCameraPos.y, worldCameraPos.z,
            0, 0, 0,
            true
        );
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
  }, []);

  const handleGlobeClick = useCallback(async (lat: number, lng: number, point: THREE.Vector3) => {
    setIsLoading(true);
    setLocationInfo(null);
    setSearchError(null);
    setAutoRotate(false); 
    setMarkers([]); // Clear transient markers
    
    // Clicking globe clears active route ONLY if it's not a saved "Checked" route?
    // Actually, usually map click deselects everything. But if a layer is "On", it should stay on.
    // However, if we click empty space, we probably want to inspect that space.
    // Let's keep the route visible but deselect the specific waypoint.
    // BUT: Current logic is handleGlobeClick calls setRouteWaypoints([]) below.
    // To support "Turn On Route", we should probably NOT clear routeWaypoints if activeRouteId is set?
    // The prompt says "turn on... to view". If I view it, clicking elsewhere shouldn't turn it off.
    
    if (!activeRouteId) {
        setRouteWaypoints([]);
        setCurrentWaypointIndex(-1);
    } else {
        // Just deselect waypoint
        setCurrentWaypointIndex(-1);
    }
    
    setSelectedMarkerId(null);
    setIsFocused(true);

    if (cameraControlsRef.current) {
      const direction = point.clone().normalize();
      const camPos = direction.multiplyScalar(2.2); 
      
      cameraControlsRef.current.setLookAt(
        camPos.x, camPos.y, camPos.z,
        0, 0, 0,
        true
      );
    }

    let newMarkers = await getNearbyPlaces(lat, lng);
    
    if (newMarkers.length === 0) {
       newMarkers = [{
         id: `fallback-${Date.now()}`,
         name: "Loading Data",
         lat: lat,
         lng: lng,
         populationClass: 'medium'
       }];
    }
    
    setMarkers(newMarkers);
    setIsLoading(false);
  }, [activeRouteId]);

  const handleMarkerClick = useCallback(async (marker: MapMarker | FavoriteLocation | Waypoint, point: THREE.Vector3) => {
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

    const isRoutePoint = (marker as Waypoint).context !== undefined;

    if (isRoutePoint) {
        const wp = marker as Waypoint;
        const idx = routeWaypoints.findIndex(w => w.id === wp.id);
        if (idx !== -1) {
            setCurrentWaypointIndex(idx);
            loadWaypointData(wp);
            return;
        }
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

    if (data && data.name) {
       setIsNewsFetching(true);
       const news = await fetchLiveNews(data.name);
       setLocationInfo(prev => {
         if (!prev || prev.name !== data.name) return prev; 
         return { ...prev, news };
       });
       setIsNewsFetching(false);
    }
  }, [routeWaypoints, loadWaypointData, activeRouteId]);

  const handleSearch = async (query: string) => {
    setIsLoading(true);
    setIsNewsFetching(false);
    setLocationInfo(null);
    setSearchError(null);
    setAutoRotate(false);
    setMarkers([]); 
    
    // Search clears route unless locked? Usually search implies a new context.
    // Let's clear active route on search to be safe.
    setRouteWaypoints([]); 
    setActiveRouteId(null);
    
    setCurrentWaypointIndex(-1);
    setSelectedMarkerId(null);
    setIsFocused(true);

    const result = await resolveLocationQuery(query);
    
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

      const targetDist = Math.max(1.3, 3.0 - ((result.suggestedZoom / 10) * (3.0 - 1.2)));
      const localCameraVec = latLngToVector3(lat, lng, targetDist);

      if (earthRef.current) {
         const worldCameraPos = localCameraVec.clone().applyMatrix4(earthRef.current.matrixWorld);
         if (cameraControlsRef.current) {
          cameraControlsRef.current.setLookAt(
            worldCameraPos.x, worldCameraPos.y, worldCameraPos.z,
            0, 0, 0,
            true 
          );
        }
      }

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
      setSearchError(`Could not find location: "${query}"`);
      setIsLoading(false);
    }
  };

  const handleTraceRoute = async (text: string) => {
      setIsLoading(true);
      setSearchError(null);
      setLocationInfo(null);
      setAutoRotate(false);
      setMarkers([]); 
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

  const handleZoomIn = () => {
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
    setIsNewsFetching(false);
    setIsFocused(false);
    setMarkers([]); // Clear markers on close
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

  return (
    <div className={`relative w-full h-screen bg-black overflow-hidden`}>
      {/* 3D Scene */}
      <Canvas camera={{ position: [0, 0, 3], fov: 45 }}>
        <ambientLight intensity={skin === 'modern' ? 0.4 : 1.5} color={skin === 'modern' ? "#ccccff" : "#ffffff"} />
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
          favorites={earthFavorites}
          showFavorites={showSavedItems}
          selectedMarkerId={selectedMarkerId}
          routeWaypoints={displayRouteWaypoints}
          currentWaypointIndex={currentWaypointIndex}
        />
        
        <VisibilityTracker 
            location={locationInfo} 
            onVisibilityChange={handleVisibilityChange} 
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
          onZoomChange={(zoomedOut) => {
             setIsZoomedOut(zoomedOut);
             if (zoomedOut) setIsFocused(false);
          }}
          disabled={isLoading || routeWaypoints.length > 0 || !!locationInfo || markers.length > 0}
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

      <Controls 
        onSearch={handleSearch} 
        onTraceRoute={handleTraceRoute}
        onZoomIn={handleZoomIn} 
        onZoomOut={handleZoomOut}
        isSearching={isLoading}
        searchError={searchError}
        skin={skin}
        showFavorites={isFavoritesPanelOpen}
        onToggleShowFavorites={() => setIsFavoritesPanelOpen(!isFavoritesPanelOpen)}
        paused={shouldPauseSuggestions}
        isTraceModalOpen={isTraceModalOpen}
        onToggleTraceModal={setIsTraceModalOpen}
      />
    </div>
  );
};

export default App;
