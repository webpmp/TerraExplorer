
import React, { useRef, useImperativeHandle, forwardRef, useMemo, useEffect, useState, useCallback, Suspense } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { TextureLoader } from 'three';
import { Decal, useTexture, Line, Text, Billboard, Instances, Instance, Html } from '@react-three/drei';
import * as THREE from 'three';
import { SkinType, GeoCoordinates, MapMarker, FavoriteLocation, Waypoint } from '../types';

interface EarthProps {
  onLocationClick: (lat: number, lng: number, point: THREE.Vector3) => void;
  onMarkerClick: (marker: MapMarker | FavoriteLocation | Waypoint, point: THREE.Vector3) => void;
  isInteracting: boolean;
  setIsInteracting: (v: boolean) => void;
  autoRotate: boolean;
  skin: SkinType;
  boundary?: GeoCoordinates[];
  markers: MapMarker[];
  favorites: FavoriteLocation[];
  showFavorites: boolean;
  selectedMarkerId: string | null;
  selectedMarkerCoordinates?: { lat: number; lng: number } | null;
  routeWaypoints?: Waypoint[];
  currentWaypointIndex?: number;
  scanningArea?: GeoCoordinates | null;
  onCameraChange?: (lat: number, lng: number, distance: number) => void;
}

import { latLngToVector3, vector3ToLatLng } from '../utils/globeCoordinates';
import { OSMMapLayer } from './OSMMapLayer';
import { OSMTransitionFog } from './OSMTransitionFog';
import { evaluateLabelPlacement, MarkerScreenTarget, ScreenRect } from '../utils/labelCollisionHelper';
import { OSM_DETAIL_THRESHOLD } from '../services/geographic/osmTileService';

// Custom Shader for Retro Effect
const RetroShader = {
  uniforms: {
    map: { value: null },
    scanColor: { value: new THREE.Color(0.0, 1.0, 0.0) }, // Default green
    lightDirection: { value: new THREE.Vector3(5, 3, 5).normalize() }
  },
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D map;
    uniform vec3 scanColor;
    uniform vec3 lightDirection;
    varying vec2 vUv;
    varying vec3 vNormal;
    
    void main() {
      vec4 texColor = texture2D(map, vUv);
      
      // Convert to Grayscale (Luminance)
      float gray = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
      
      // Boost gray level to make landmasses brighter
      gray = pow(gray, 0.6); // Lower power = brighter midtones

      // Simple lighting
      float diff = max(dot(vNormal, lightDirection), 0.0);
      float light = 0.6 + 1.4 * diff; // Increased ambient and diffuse for higher contrast
      
      // Apply scan color based on intensity
      // Boost the color output significantly
      vec3 finalColor = scanColor * gray * light * 1.5; 
      
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
};

// Custom Shader for Atmosphere Glow
const AtmosphereGlowShader = {
  uniforms: {
    color: { value: new THREE.Color('#64b5f6') },
    power: { value: 2.0 },
    intensity: { value: 3.5 }
  },
  vertexShader: `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 color;
    uniform float power;
    uniform float intensity;
    varying vec3 vNormal;
    void main() {
      // Calculate opacity based on viewing angle
      // Normal points INWARDS (BackSide). View vector is (0,0,1) in view space.
      // dot product is 1.0 at center (behind earth), 0.0 at edge.
      float viewDot = dot(vNormal, vec3(0.0, 0.0, 1.0));
      
      // We clamp to avoid artifacts
      viewDot = clamp(viewDot, 0.0, 1.0);
      
      // Power curve controls the falloff
      // Lower power (e.g. 2.0) with high intensity gives a softer, thicker-looking atmosphere
      // that fades gently to zero at the edge.
      float alpha = pow(viewDot, power) * intensity;
      
      // Clamp alpha
      alpha = min(alpha, 0.8); // Cap max opacity to keep it translucent

      gl_FragColor = vec4(color, alpha);
    }
  `
};

const UniversalMarker: React.FC<{ 
  position: THREE.Vector3, 
  color: string | THREE.Color, 
  outlineColor: string | THREE.Color,
  size: number,
  hitSize: number,
  isRetro: boolean,
  isSelected: boolean,
  isWaypoint?: boolean,
  waypointIndex?: number,
  waypointRole?: string,
  markerData?: any,
  skin?: SkinType,
  onClick: (e: any) => void,
  onMouseEnter?: () => void,
  onMouseLeave?: () => void,
  markerId?: string,
  scanOffsetsRef?: React.RefObject<Record<string, THREE.Vector3>>
}> = ({ 
  position, 
  color, 
  outlineColor,
  size,
  hitSize,
  isRetro, 
  isSelected,
  isWaypoint,
  waypointIndex,
  waypointRole,
  markerData,
  skin,
  onClick,
  onMouseEnter,
  onMouseLeave,
  markerId = '',
  scanOffsetsRef
}) => {
  const meshRef = useRef<THREE.Group>(null);
  const domHitRef = useRef<HTMLDivElement>(null);
  const domPinRef = useRef<HTMLDivElement>(null);
  const { camera, size: viewportSize } = useThree();

  const colorStr = typeof color === 'string' ? color : (color instanceof THREE.Color ? `#${color.getHexString()}` : '#ff0000');
  const outlineStr = typeof outlineColor === 'string' ? outlineColor : (outlineColor instanceof THREE.Color ? `#${outlineColor.getHexString()}` : '#ffffff');

  useFrame((state) => {
    if (meshRef.current) {
      const distance = state.camera.position.length();
      const isOSMDetailActive = distance <= OSM_DETAIL_THRESHOLD;

      // When OSM detail view is active, hide the 3D globe DOM pins so OSM markers handle presentation
      if (isOSMDetailActive) {
        if (domHitRef.current) {
          domHitRef.current.style.display = 'none';
        }
        return;
      }

      // 1. Zoom scale calculation (0.0 = zoomed out, 1.0 = zoomed in)
      const zoomLevel = THREE.MathUtils.clamp((8.0 - distance) / (8.0 - 1.2), 0, 1);

      // Subtle size scaling formula: size multiplier goes from 0.8 to 0.95
      const sizeMultiplier = 0.8 + zoomLevel * 0.15;
        
      let roleScale = 1;
      if (isWaypoint && waypointRole) {
        if (waypointRole === 'primary') roleScale = 1.4;
        else if (waypointRole === 'administrative') roleScale = 0.8;
      }
      
      meshRef.current.scale.setScalar(sizeMultiplier * roleScale);

      // 2. Fetch screen-space collision offset computed in parent's useFrame loop
      const displacement = scanOffsetsRef?.current?.[markerId] || new THREE.Vector3(0, 0, 0);
      
      const parent = meshRef.current.parent;
      if (parent && (displacement.x !== 0 || displacement.y !== 0 || displacement.z !== 0)) {
         // Convert position to world coordinates, add world-space displacement, and map back to local coordinates
         const worldPos = new THREE.Vector3().copy(position).applyMatrix4(parent.matrixWorld);
         worldPos.add(displacement);
         
         const localPos = worldPos.applyMatrix4(new THREE.Matrix4().copy(parent.matrixWorld).invert());
         meshRef.current.position.copy(localPos);
      } else {
         meshRef.current.position.copy(position);
      }

      // 3. Screen-space DOM overlay projection & size calculation for OSM map visibility
      if (domHitRef.current && domPinRef.current) {
        const wp = new THREE.Vector3();
        meshRef.current.getWorldPosition(wp);

        // Check if marker is facing the camera
        const isFacingCam = wp.dot(camera.position) > 0.6;
        if (!isFacingCam) {
          domHitRef.current.style.display = 'none';
        } else {
          domHitRef.current.style.display = 'flex';
          
          const markerVisualSize = size * sizeMultiplier * roleScale;
          const centerScreen = wp.clone().project(camera);
          const edgeWp = wp.clone().add(camera.up.clone().multiplyScalar(markerVisualSize));
          const edgeScreen = edgeWp.project(camera);

          const heightHalf = viewportSize.height / 2;
          const centerY = -(centerScreen.y * heightHalf) + heightHalf;
          const edgeY = -(edgeScreen.y * heightHalf) + heightHalf;
          
          const radius = Math.max(3.5, Math.abs(centerY - edgeY));
          const diameter = radius * 2;
          const strokeWidth = Math.max(1.5, radius * 0.22);

          // Update visual marker size inside 40px hit area
          domPinRef.current.style.width = `${diameter}px`;
          domPinRef.current.style.height = `${diameter}px`;
          domPinRef.current.style.borderWidth = `${strokeWidth}px`;

          // Selected Marker Pure Uniform Scale Pulse (animates scale only, zero color/shadow/opacity shift)
          if (isSelected) {
            const pulseScale = 1.0 + (Math.sin(state.clock.elapsedTime * 3) * 0.5 + 0.5) * 0.25;
            domPinRef.current.style.transform = `scale(${pulseScale})`;
            domPinRef.current.style.transformOrigin = 'center center';
          } else {
            domPinRef.current.style.transform = 'scale(1)';
            domPinRef.current.style.transformOrigin = 'center center';
          }
        }
      }
    }
  });

  return (
    <group position={position} onClick={onClick} ref={meshRef}>
      {/* 3D Hitbox - ensures raycasting target */}
      <mesh 
        userData={{ 
          isPin: true, 
          markerData, 
          worldPos: position, 
          visualSize: size,
          isWaypoint,
          waypointIndex
        }}
      >
         <sphereGeometry args={[hitSize, 16, 16]} />
         <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* DOM Overlay Pin (Layered at z-index 40, guarantees 100% visibility above OSM raster layer) */}
      <Html 
        center 
        zIndexRange={[40, 0]} 
        style={{ 
          pointerEvents: 'auto',
          userSelect: 'none'
        }}
      >
        {/* Invisible 40px x 40px Hit Area */}
        <div 
          ref={domHitRef}
          data-marker-hit-id={markerId}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onClick={(e) => {
            e.stopPropagation();
            if (meshRef.current) {
              const wp = new THREE.Vector3();
              meshRef.current.getWorldPosition(wp);
              onClick({ ...e, object: meshRef.current, point: wp });
            } else {
              onClick(e);
            }
          }}
          className="flex items-center justify-center cursor-pointer"
          style={{
            width: '40px',
            height: '40px',
            position: 'absolute',
            left: '0px',
            top: '0px',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'auto',
            userSelect: 'none',
            background: 'transparent'
          }}
        >
          {/* Visual Marker Pin (strictly pointer-events: none) */}
          <div 
            ref={domPinRef}
            className="rounded-full flex items-center justify-center"
            style={{
              backgroundColor: colorStr,
              borderColor: outlineStr,
              borderStyle: 'solid',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
              opacity: isWaypoint && waypointRole === 'administrative' ? 0.6 : 1.0,
              pointerEvents: 'none',
              transformOrigin: 'center center',
              userSelect: 'none'
            }}
          >
            {isWaypoint && waypointIndex !== undefined && (
              <span 
                style={{
                  fontSize: '10px',
                  fontWeight: 'bold',
                  color: isRetro ? 'black' : (skin === 'parchment' ? '#3e2723' : 'black'),
                  lineHeight: 1,
                  userSelect: 'none',
                  textShadow: skin === 'parchment' ? '0 0 2px #f4ead5' : '0 0 2px white',
                  pointerEvents: 'none'
                }}
              >
                {waypointIndex + 1}
              </span>
            )}
          </div>
        </div>
      </Html>
    </group>
  );
};

const RouteLine: React.FC<{ 

  waypoints: Waypoint[], 

  color: string,

  isRetro: boolean,

  markerPositions?: Map<string, THREE.Vector3>

}> = ({ waypoints, color, isRetro, markerPositions }) => {
  const dotPoints = useMemo(() => {
    if (waypoints.length < 2) return [];
    
    const points: THREE.Vector3[] = [];
    const radius = 1.015; // Updated to match new marker altitude
    const lineRadius = 1.018; 
    
    // Spacing between dots (smaller = more dots)
    const spacing = 0.008; 
    
    // Distance to skip at start/end to avoid overlapping with marker
    const markerClearance = 0.03; 

    for (let i = 0; i < waypoints.length - 1; i++) {
        const start = markerPositions?.get(waypoints[i].id) || latLngToVector3(waypoints[i].lat, waypoints[i].lng, radius);
        const end = markerPositions?.get(waypoints[i+1].id) || latLngToVector3(waypoints[i+1].lat, waypoints[i+1].lng, radius);
        
        const angle = start.angleTo(end);
        const arcLength = angle * lineRadius;

        if (arcLength > markerClearance * 2) {
             const usableLength = arcLength - (markerClearance * 2);
             const count = Math.floor(usableLength / spacing);
             
             if (count > 0) {
                 for (let j = 0; j <= count; j++) {
                     // Calculate interpolation factor t based on physical distance along arc
                     // t maps from [clearance] to [arcLength - clearance]
                     const currentDist = markerClearance + (j / count) * usableLength;
                     const t = currentDist / arcLength;
                     
                     // Slerp approximation (lerp then normalize)
                     const v = new THREE.Vector3().copy(start).lerp(end, t).normalize().multiplyScalar(lineRadius);
                     points.push(v);
                 }
             }
        }
    }
    return points;
  }, [waypoints, markerPositions]);

  if (dotPoints.length === 0) return null;

  return (
    <Instances range={dotPoints.length}>
      <sphereGeometry args={[0.002, 8, 8]} />
      <meshBasicMaterial color={color} transparent opacity={0.6} />
      {dotPoints.map((pos, i) => (
        <Instance key={i} position={pos} />
      ))}
    </Instances>
  );
};

const HoverOverlay: React.FC<{
  isInteracting: boolean;
  groupRef: React.RefObject<THREE.Group>;
  skin: SkinType;
  onMarkerClick: (marker: any, point: THREE.Vector3) => void;
  outlineColor: string;
  selectedMarkerId?: string | null;
  hoveredMarkerId?: string | null;
  setHoveredMarkerId?: (id: string | null) => void;
}> = ({ isInteracting, groupRef, skin, onMarkerClick, outlineColor, selectedMarkerId, hoveredMarkerId, setHoveredMarkerId }) => {
  const isParchment = skin === 'parchment';
  const isModern = skin === 'modern' || isParchment;
  const isAmber = skin === 'retro-amber';
  
  const { camera, gl, size, scene } = useThree();
  const [rayHoveredPin, setRayHoveredPin] = useState<any>(null);
  const [rayHoveredObject, setRayHoveredObject] = useState<THREE.Object3D | null>(null);

  const containerGroupRef = useRef<THREE.Group>(null);
  const overlayContainerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const lineRef = useRef<SVGLineElement>(null);
  const labelDivRef = useRef<HTMLDivElement>(null);

  const cachedSelectedPinRef = useRef<{ pin: any; object: THREE.Object3D; id: string } | null>(null);

  // Clear cache if selectedMarkerId is removed
  useEffect(() => {
    if (!selectedMarkerId) {
      cachedSelectedPinRef.current = null;
    }
  }, [selectedMarkerId]);

  const findPinObjectById = useCallback((id: string) => {
    if (!id || !groupRef.current) {
      return null;
    }

    if (cachedSelectedPinRef.current && cachedSelectedPinRef.current.id === id && cachedSelectedPinRef.current.object.parent) {
      return cachedSelectedPinRef.current;
    }

    let match: { pin: any; object: THREE.Object3D; id: string } | null = null;
    groupRef.current.traverse((obj) => {
      if (!match && obj.userData?.isPin) {
        const markerData = obj.userData.markerData;
        if (markerData && (markerData.id === id || String(markerData.id) === String(id))) {
          match = { pin: markerData, object: obj, id: id };
        }
      }
    });

    if (match && id === selectedMarkerId) {
      cachedSelectedPinRef.current = match;
    }
    return match;
  }, [selectedMarkerId, groupRef]);

  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    let throttleTimeout: any = null;

    const handleMouseMove = (e: MouseEvent) => {
      const distance = camera.position.length();
      const isOSMDetailActive = distance <= OSM_DETAIL_THRESHOLD;
      if (isInteracting || isOSMDetailActive) {
         if (rayHoveredPin) {
             setRayHoveredPin(null);
             setRayHoveredObject(null);
             document.body.style.cursor = 'auto';
         }
         return;
      }

      if (throttleTimeout) return;

      throttleTimeout = setTimeout(() => {
        throttleTimeout = null;

        const bounds = gl.domElement.getBoundingClientRect();
        const x = e.clientX - bounds.left;
        const y = e.clientY - bounds.top;

        const mouse = new THREE.Vector2(
          (x / size.width) * 2 - 1,
          -(y / size.height) * 2 + 1
        );

        raycaster.setFromCamera(mouse, camera);

        if (groupRef.current) {
          const pins: THREE.Object3D[] = [];
          groupRef.current.traverse((obj) => {
            if (obj.userData?.isPin) {
              pins.push(obj);
            }
          });

          const intersects = raycaster.intersectObjects(pins, false);

          if (intersects.length > 0) {
            const firstHit = intersects[0].object;
            const markerData = firstHit.userData.markerData;
            
            if (markerData && (!rayHoveredPin || rayHoveredPin.id !== markerData.id)) {
                setRayHoveredPin(markerData);
                setRayHoveredObject(firstHit);
                document.body.style.cursor = 'pointer';
            }
          } else {
            if (rayHoveredPin) {
               setRayHoveredPin(null);
               setRayHoveredObject(null);
               if (!hoveredMarkerId) {
                 document.body.style.cursor = 'auto';
               }
            }
          }
        }
      }, 30);
    };

    const container = gl.domElement;
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseout', () => {
        setRayHoveredPin(null);
        setRayHoveredObject(null);
        document.body.style.cursor = 'auto';
    });

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(throttleTimeout);
      document.body.style.cursor = 'auto';
    };
  }, [isInteracting, camera, size, gl, rayHoveredPin, hoveredMarkerId, groupRef]);

  useFrame((state) => {
    const distance = state.camera.position.length();
    const isOSMDetailActive = distance <= OSM_DETAIL_THRESHOLD;

    if (overlayContainerRef.current) {
      overlayContainerRef.current.style.display = isOSMDetailActive ? 'none' : 'block';
    }

    if (isOSMDetailActive) {
      if (rayHoveredPin) {
        setRayHoveredPin(null);
        setRayHoveredObject(null);
      }
      return;
    }

    let activePin = null;
    let activeObject = null;

    if (hoveredMarkerId) {
      const match = findPinObjectById(hoveredMarkerId);
      if (match) {
        activePin = match.pin;
        activeObject = match.object;
      }
    }

    if (!activePin && rayHoveredPin) {
      activePin = rayHoveredPin;
      activeObject = rayHoveredObject;
    }

    if (!activePin && selectedMarkerId) {
      const match = findPinObjectById(selectedMarkerId);
      if (match) {
        activePin = match.pin;
        activeObject = match.object;
      }
    }

    if (!activePin || !activeObject || !containerGroupRef.current || typeof activeObject.getWorldPosition !== 'function') {
      if (overlayContainerRef.current) {
        overlayContainerRef.current.style.display = 'none';
      }
      return;
    }

    if (overlayContainerRef.current) {
      overlayContainerRef.current.style.display = 'block';
    }

    // 1. Refresh world position every frame
    const wp = new THREE.Vector3();
    activeObject.getWorldPosition(wp);
    containerGroupRef.current.position.copy(wp);

    // 2. Compute dynamic pin radius in screen pixels
    const markerVisualSize = (activeObject.userData.visualSize || 0.01) * 1.2;
    
    // Project center
    const centerScreen = wp.clone().project(camera);
    
    // Project an edge point
    const edgeWp = wp.clone().add(camera.up.clone().multiplyScalar(markerVisualSize));
    const edgeScreen = edgeWp.project(camera);

    // Convert projected coords to screen pixels
    const heightHalf = size.height / 2;
    const widthHalf = size.width / 2;
    const markerScreenX = (centerScreen.x * widthHalf) + widthHalf;
    const markerScreenY = -(centerScreen.y * heightHalf) + heightHalf;
    const edgeY = -(edgeScreen.y * heightHalf) + heightHalf;
    
    const pinScreenRadius = Math.abs(markerScreenY - edgeY);

    // 3. Project other visible markers on screen
    const otherMarkers: MarkerScreenTarget[] = [];
    if (groupRef.current) {
      groupRef.current.traverse((obj) => {
        if (obj.userData?.isPin && obj.userData?.markerData) {
          const mData = obj.userData.markerData;
          if (mData.id === activePin.id) return;
          const otherWp = new THREE.Vector3();
          obj.getWorldPosition(otherWp);

          // Check if facing camera
          if (otherWp.dot(camera.position) > 0.5) {
            const sc = otherWp.clone().project(camera);
            const ox = (sc.x * widthHalf) + widthHalf;
            const oy = -(sc.y * heightHalf) + heightHalf;
            
            const otherEdgeWp = otherWp.clone().add(camera.up.clone().multiplyScalar((obj.userData.visualSize || 0.01) * 1.2));
            const otherEdgeSc = otherEdgeWp.project(camera);
            const otherEdgeY = -(otherEdgeSc.y * heightHalf) + heightHalf;
            const otherRadius = Math.max(4, Math.abs(oy - otherEdgeY));

            otherMarkers.push({
              id: mData.id,
              x: ox,
              y: oy,
              radius: otherRadius,
              hitRadius: 20
            });
          }
        }
      });
    }

    // 4. Measure actual rendered label dimensions
    let labelWidth = 140;
    let labelHeight = 32;
    if (labelDivRef.current) {
      const rect = labelDivRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        labelWidth = rect.width;
        labelHeight = rect.height;
      }
    }

    // 5. Evaluate best collision-free placement
    const bestLayout = evaluateLabelPlacement(
      {
        x: markerScreenX,
        y: markerScreenY,
        visualRadius: pinScreenRadius,
        hitRadius: 20,
        id: activePin.id
      },
      labelWidth,
      labelHeight,
      otherMarkers,
      [],
      { width: size.width, height: size.height }
    );

    // 6. Update SVG and Label positions
    if (svgRef.current) {
      svgRef.current.style.left = `${bestLayout.svgBox.left}px`;
      svgRef.current.style.top = `${bestLayout.svgBox.top}px`;
      svgRef.current.style.width = `${bestLayout.svgBox.width}px`;
      svgRef.current.style.height = `${bestLayout.svgBox.height}px`;
    }

    if (lineRef.current) {
      lineRef.current.setAttribute('x1', bestLayout.svgLine.x1.toString());
      lineRef.current.setAttribute('y1', bestLayout.svgLine.y1.toString());
      lineRef.current.setAttribute('x2', bestLayout.svgLine.x2.toString());
      lineRef.current.setAttribute('y2', bestLayout.svgLine.y2.toString());
    }

    if (labelDivRef.current) {
      labelDivRef.current.style.left = `${bestLayout.labelOffset.left}px`;
      labelDivRef.current.style.top = `${bestLayout.labelOffset.top}px`;
    }
  });

  const currentDist = camera.position.length();
  const isOSMDetailActive = currentDist <= OSM_DETAIL_THRESHOLD;
  if (isOSMDetailActive) return null;

  let activePin = null;
  let activeObject = null;

  if (hoveredMarkerId) {
    const match = findPinObjectById(hoveredMarkerId);
    if (match) {
      activePin = match.pin;
      activeObject = match.object;
    }
  }

  if (!activePin && rayHoveredPin) {
    activePin = rayHoveredPin;
    activeObject = rayHoveredObject;
  }

  if (!activePin && selectedMarkerId) {
    const match = findPinObjectById(selectedMarkerId);
    if (match) {
      activePin = match.pin;
      activeObject = match.object;
    }
  }

  if (!activePin || !activeObject) return null;

  // Resolve world position directly for the group position prop
  const initWorldPos = new THREE.Vector3();
  if (typeof activeObject.getWorldPosition === 'function') {
    activeObject.getWorldPosition(initWorldPos);
  }

  const isWaypoint = activeObject?.userData?.isWaypoint;
  const waypointIndex = activeObject?.userData?.waypointIndex;

  return (
    <group ref={containerGroupRef} position={initWorldPos}>
      <Html 
        center 
        zIndexRange={[100, 0]} 
        style={{ 
          pointerEvents: 'none',
          userSelect: 'none'
        }}
      >
        <div 
          ref={overlayContainerRef}
          style={{ 
            position: 'relative', 
            pointerEvents: 'none',
            userSelect: 'none',
            display: isOSMDetailActive ? 'none' : 'block'
          }}
        >
          {/* Dynamic Connector Line */}
          <svg 
            ref={svgRef}
            style={{ 
              position: 'absolute', 
              top: '-32px', 
              left: '0px', 
              width: '32px', 
              height: '32px', 
              overflow: 'visible', 
              pointerEvents: 'none',
              userSelect: 'none'
            }}
          >
            <line 
              ref={lineRef}
              x1="0" y1="0"
              x2="32" y2="-32"
              stroke={isModern ? "rgba(255,255,255,0.7)" : outlineColor} 
              strokeWidth="1.5" 
            />
          </svg>

          {/* Dynamic Label Content (pointer-events: none) */}
          <div 
            ref={labelDivRef}
            style={{ 
              position: 'absolute', 
              left: '32px', 
              top: '-32px',
              pointerEvents: 'none',
              userSelect: 'none'
            }}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap text-sm font-bold shadow-xl border backdrop-blur-md transition-opacity duration-150
            ${isModern 
                ? 'bg-black/75 text-white border-white/20' 
                : isAmber
                  ? 'bg-black text-amber-300 border-amber-400 font-mono'
                  : 'bg-black text-green-300 border-green-400 font-mono'}`}
          >
            {isWaypoint && waypointIndex !== undefined 
              ? `${waypointIndex + 1}. ${(activePin as any).displayName || activePin.name || 'Unknown Location'}` 
              : ((activePin as any).displayName || activePin.name || 'Unknown Location')}
          </div>
        </div>
      </Html>
    </group>
  );
};

const RotatingEarth = forwardRef<THREE.Mesh, EarthProps>((props, ref) => {
  const groupRef = useRef<THREE.Group>(null);
  const scanOffsetsRef = useRef<Record<string, THREE.Vector3>>({});
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const [isStreetMapReady, setIsStreetMapReady] = useState<boolean>(false);
  const { autoRotate, isInteracting, skin, markers, favorites, showFavorites, selectedMarkerId, routeWaypoints, currentWaypointIndex, scanningArea } = props;

  // Rotate the entire group
  useFrame((state, delta) => {
    if (autoRotate && !isInteracting && groupRef.current) {
      groupRef.current.rotation.y += delta * 0.05;
    }
  });

  const isParchment = skin === 'parchment';
  const isModern = skin === 'modern' || isParchment;
  const isGreen = skin === 'retro-green';
  const isAmber = skin === 'retro-amber';

  // Marker Colors
  const markerColor = isParchment ? '#8b5a2b' : isModern ? '#ff0000' : isGreen ? '#a3e635' : '#fcd34d';
  const favoriteColor = isParchment ? '#8b0000' : isModern ? '#d946ef' : '#ffffff'; 
  const waypointColor = isParchment ? '#d2b48c' : isModern ? '#00e5ff' : isGreen ? '#4ade80' : '#fbbf24'; 
  
  // Marker Outline Colors
  const outlineColor = isParchment ? '#e8d5b5' : isModern ? '#ffffff' : isGreen ? '#4ade80' : '#fbbf24';

  // Memoize positions and declustering logic
  const { processedMarkers, adjustedPositions } = useMemo(() => {
    const allMarkers: any[] = [];
    
    // Constants for sizing and clustering
    const WAYPOINT_SIZE = 0.012; 
    const MARKER_SIZE_LARGE = 0.012;
    const MARKER_SIZE_SMALL = 0.008;
    
    // Tighter threshold: Only cluster if very close (touching)
    const CLUSTER_THRESHOLD = 0.02; 

    // Altitude
    const MARKER_ALTITUDE = 1.015;

    // 0. Waypoints (High priority)
    if (routeWaypoints && routeWaypoints.length > 0) {
        routeWaypoints.forEach((wp, idx) => {
             allMarkers.push({
                type: 'waypoint',
                data: wp,
                lat: wp.lat,
                lng: wp.lng,
                baseSize: WAYPOINT_SIZE, 
                color: waypointColor,
                id: wp.id,
                isWaypoint: true,
                index: idx,
                role: wp.role
             });
        });
    }

    // 1. Regular Markers
    markers.forEach(m => {
       if (m && typeof m.lat === 'number' && typeof m.lng === 'number') {
         allMarkers.push({
            type: 'marker',
            data: m,
            lat: m.lat,
            lng: m.lng,
            baseSize: m.populationClass === 'large' ? MARKER_SIZE_LARGE : MARKER_SIZE_SMALL,
            color: markerColor,
            id: m.id
         });
       }
    });

    if (showFavorites) {
        favorites.forEach(f => {
            if (f && typeof f.lat === 'number' && typeof f.lng === 'number') {
                allMarkers.push({
                    type: 'favorite',
                    data: f,
                    lat: f.lat,
                    lng: f.lng,
                    baseSize: MARKER_SIZE_LARGE,
                    color: favoriteColor,
                    id: f.id
                });
            }
        });
    }

    // 2. Calculate Initial 3D Positions
    const itemsWithPos = allMarkers.map(item => {
        const pos = latLngToVector3(item.lat, item.lng, MARKER_ALTITUDE);
        // Store as a mutable vector for declustering adjustment
        return { ...item, position: pos };
    });

    // 3. De-clustering / Nudging Logic using Connected Components
    // Build Adjacency Graph
    const adj: number[][] = Array.from({ length: itemsWithPos.length }, () => []);
    
    for (let i = 0; i < itemsWithPos.length; i++) {
        for (let j = i + 1; j < itemsWithPos.length; j++) {
             // Check if markers are too close
             if (itemsWithPos[i].position.distanceTo(itemsWithPos[j].position) < CLUSTER_THRESHOLD) {
                 adj[i].push(j);
                 adj[j].push(i);
             }
        }
    }

    const visited = new Set<number>();
    const groups: any[][] = [];
    
    // Find connected components
    for (let i = 0; i < itemsWithPos.length; i++) {
        if (visited.has(i)) continue;
        const group = [];
        const stack = [i];
        visited.add(i);
        
        while(stack.length > 0) {
            const curr = stack.pop()!;
            group.push(itemsWithPos[curr]);
            for(const neighbor of adj[curr]) {
                if(!visited.has(neighbor)) {
                    visited.add(neighbor);
                    stack.push(neighbor);
                }
            }
        }
        groups.push(group);
    }
    
    // Map to store final positions for the RouteLine to access
    const finalPosMap = new Map<string, THREE.Vector3>();

    // Apply displacements
    groups.forEach(group => {
        if (group.length > 1) {
            // Organize: Sort by Latitude (North to South) for deterministic layout
            group.sort((a, b) => b.lat - a.lat);

            // Calculate Center of the cluster
            const center = new THREE.Vector3();
            group.forEach(item => center.add(item.position));
            center.divideScalar(group.length).normalize();
            
            // Tangent Plane Basis
            let up = new THREE.Vector3(0, 1, 0);
            if (Math.abs(up.dot(center)) > 0.99) up = new THREE.Vector3(1, 0, 0);
            const tanX = new THREE.Vector3().crossVectors(center, up).normalize();
            const tanY = new THREE.Vector3().crossVectors(center, tanX).normalize();
            
            // Layout Radius: Tighter clustering
            // 2 items: 0.014 * 2 = 0.028 distance. 
            // Marker size ~0.024 diameter. They will roughly touch.
            const layoutRadius = Math.max(0.014, group.length * 0.005);
            
            group.forEach((item, k) => {
                // Geographic accuracy requirement: Do NOT modify original coordinates or position for scan result markers
                if (item.type === 'marker') {
                    return;
                }

                const angle = (k / group.length) * Math.PI * 2;
                const offsetX = Math.cos(angle) * layoutRadius;
                const offsetY = Math.sin(angle) * layoutRadius;
                
                const shift = tanX.clone().multiplyScalar(offsetX).add(tanY.clone().multiplyScalar(offsetY));
                
                // New position projected back onto sphere radius MARKER_ALTITUDE
                const newPos = center.clone().add(shift).normalize().multiplyScalar(MARKER_ALTITUDE);
                
                item.position.copy(newPos);
            });
        }
        
        // Store finalized positions
        group.forEach(item => finalPosMap.set(item.id, item.position));
    });

    // Telemetry logger removed to avoid React StrictMode log spam

    // 4. Final Processing & Deduplication
    const uniqueMarkers = new Map();
    itemsWithPos.forEach(item => {
        if (!uniqueMarkers.has(item.id)) {
            uniqueMarkers.set(item.id, {
                ...item,
                visualSize: item.baseSize,
                // Reduced hitbox to allow clicking individual items in tight clusters
                hitSize: Math.max(item.baseSize, 0.015)
            });
        }
    });

    return { processedMarkers: Array.from(uniqueMarkers.values()), adjustedPositions: finalPosMap };

  }, [markers, favorites, showFavorites, markerColor, favoriteColor, outlineColor, routeWaypoints, waypointColor]);

  const innerMeshRef = useRef<THREE.Mesh>(null);
  useImperativeHandle(ref, () => innerMeshRef.current!);

  const scanGroupRef = useRef<THREE.Group | null>(null);
  const scanRingsRef = useRef<(THREE.Mesh | null)[]>([]);
  const crosshairRef = useRef<THREE.Group | null>(null);
  const centerPulseRef = useRef<THREE.Mesh | null>(null);

  const renderedLogRef = useRef(false);

  useFrame(({ clock }) => {
     if (props.scanningArea) {
        if (!renderedLogRef.current) {
           console.log("triangulation_rendering");
           renderedLogRef.current = true;
        }
        const time = clock.getElapsedTime();
        
        // 1. Rotate crosshair triangulation lines
        if (crosshairRef.current) {
           crosshairRef.current.rotation.z = time * 0.8;
        }
        
        // 2. Animate center pulse
        if (centerPulseRef.current) {
           const pulse = 0.5 + Math.abs(Math.sin(time * 6.0)) * 0.5;
           centerPulseRef.current.scale.set(pulse, pulse, 1);
           if (centerPulseRef.current.material) {
              (centerPulseRef.current.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1.0 - (pulse - 0.5) / 1.0);
           }
        }
        
        // 3. Animate expanding rings
        for (let i = 0; i < 3; i++) {
           const ring = scanRingsRef.current[i];
           if (ring) {
              const phase = (time * 0.4 + i * 0.33) % 1.0;
              ring.scale.set(phase, phase, 1);
              if (ring.material) {
                 (ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1.0 - phase);
              }
           }
        }
     } else {
        renderedLogRef.current = false;
     }
  });

  const [colorMap, normalMap, specularMap, cloudsMap, displacementMap] = useLoader(TextureLoader, [
    'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
    'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_normal_2048.jpg',
    'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg',
    'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png',
    'https://unpkg.com/three-globe/example/img/earth-topology.png'
  ]);

  // Configure textures for retro feel
  useEffect(() => {
    const filter = isAmber ? THREE.NearestFilter : THREE.LinearFilter;
    
    [colorMap, cloudsMap].forEach(tex => {
        tex.minFilter = filter;
        tex.magFilter = filter;
        tex.needsUpdate = true;
    });
  }, [skin, colorMap, cloudsMap, isAmber]);

  // Brighter colors for High Contrast
  const retroColor = isGreen ? new THREE.Color('#4ade80') : new THREE.Color('#fbbf24'); // Green-400 : Amber-400
  
   // Create shader material for retro mode
   const retroMaterial = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(RetroShader.uniforms),
      vertexShader: RetroShader.vertexShader,
      fragmentShader: RetroShader.fragmentShader
    }) as any;
    mat.flatShading = isGreen;
    mat.uniforms.map.value = colorMap;
    return mat;
  }, [colorMap, isGreen]);

  // Atmosphere Material using custom glow shader
  const atmosphereMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(AtmosphereGlowShader.uniforms),
      vertexShader: AtmosphereGlowShader.vertexShader,
      fragmentShader: AtmosphereGlowShader.fragmentShader,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    });
  }, []);

  useEffect(() => {
    if (atmosphereMaterial) {
       atmosphereMaterial.uniforms.color.value = isModern ? new THREE.Color("#64b5f6") : retroColor;
       // Updated tuning for "gaseous cloud layer" look:
       // Lower power (2.0) creates a softer falloff that is more opaque near the limb (inner part)
       // Higher intensity (3.5) ensures it glows brightly near the Earth
       atmosphereMaterial.uniforms.power.value = 2.0; 
       atmosphereMaterial.uniforms.intensity.value = 3.5;
       atmosphereMaterial.needsUpdate = true;
    }
  }, [isModern, retroColor, atmosphereMaterial]);

  useFrame((state) => {
    if (!isModern && retroMaterial) {
      retroMaterial.uniforms.scanColor.value.lerp(retroColor, 0.1);
    }

    // Dynamic Terrain LOD for Modern Skin
    if (isModern && innerMeshRef.current) {
        const mat = innerMeshRef.current.material as THREE.MeshPhongMaterial;
        if (mat.displacementMap) {
            const dist = state.camera.position.length(); // Camera distance from (0,0,0)
            
            // Map distance 1.2 (close) -> 5.0 (far)
            const minDist = 1.3;
            const maxDist = 4.0;
            const norm = (Math.min(maxDist, Math.max(minDist, dist)) - minDist) / (maxDist - minDist);
            
            // intensity goes from 1.0 (close) to 0.0 (far)
            const intensity = 1.0 - norm;
            
            // Apply exponential curve so it pops in mainly when quite close
            const curvedIntensity = Math.pow(intensity, 2.5);

            // Peak displacement scale reduced to 0.03 to accommodate lower marker altitude (1.015)
            // Bias ensures displacement is centered or slightly inward so markers at 1.015 remain visible
            mat.displacementScale = curvedIntensity * 0.03;
            mat.displacementBias = -mat.displacementScale / 2; // Center the displacement
        }
    }

    // Dynamic screen-space repulsion for region scan markers
    const scanMarkers = processedMarkers.filter(m => m.type === 'marker');
    if (scanMarkers.length > 0 && groupRef.current) {
       const distance = state.camera.position.length();

       // In OSM mode (distance <= 1.55), do not apply artificial globe repulsion
       if (distance <= 1.55) {
          scanMarkers.forEach(m => {
             if (scanOffsetsRef.current[m.id]) {
                scanOffsetsRef.current[m.id].set(0, 0, 0);
             }
          });
          return;
       }

       const parent = groupRef.current;
       const widthHalf = state.size.width * 0.5;
       const heightHalf = state.size.height * 0.5;

       // Project scan result markers to screen coordinates
       const screenCoords = scanMarkers.map(m => {
          const worldPos = new THREE.Vector3().copy(m.position).applyMatrix4(parent.matrixWorld);
          const tempV = worldPos.clone().project(state.camera);
          return {
             id: m.id,
             worldPos: worldPos,
             tempZ: tempV.z,
             x: (tempV.x + 1.0) * widthHalf,
             y: (tempV.y + 1.0) * heightHalf
          };
       });

       const screenOffsetsX = new Float32Array(scanMarkers.length);
       const screenOffsetsY = new Float32Array(scanMarkers.length);

       // Calculate zoom Level and dynamic minPixelDistance
       const zoomLevel = THREE.MathUtils.clamp((8.0 - distance) / (8.0 - 1.2), 0, 1);
       
       const baseDistance = 14; // base distance in pixels
       const factor = 2; // separation factor per zoom level
       const minPixelDistance = baseDistance * (1 + zoomLevel * factor);

       // 2 iterations of relaxation passes to resolve overlaps dynamically
       for (let pass = 0; pass < 2; pass++) {
          for (let i = 0; i < scanMarkers.length; i++) {
             for (let j = i + 1; j < scanMarkers.length; j++) {
                const posIX = screenCoords[i].x + screenOffsetsX[i];
                const posIY = screenCoords[i].y + screenOffsetsY[i];
                const posJX = screenCoords[j].x + screenOffsetsX[j];
                const posJY = screenCoords[j].y + screenOffsetsY[j];
                
                const dx = posJX - posIX;
                const dy = posJY - posIY;
                const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
                
                if (dist < minPixelDistance) {
                   const force = (minPixelDistance - dist) * 0.5;
                   const rx = (dx / dist) * force;
                   const ry = (dy / dist) * force;
                   
                   screenOffsetsX[i] -= rx;
                   screenOffsetsY[i] -= ry;
                   screenOffsetsX[j] += rx;
                   screenOffsetsY[j] += ry;
                }
             }
          }
       }

       // Convert screen space offsets to camera-aligned world space displacements
       scanMarkers.forEach((m, i) => {
          const dx = screenOffsetsX[i];
          const dy = screenOffsetsY[i];
          
          if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
             const resolvedX = screenCoords[i].x + dx;
             const resolvedY = screenCoords[i].y + dy;

             const resolvedNDC = new THREE.Vector3(
                (resolvedX / state.size.width) * 2 - 1,
                (resolvedY / state.size.height) * 2 - 1,
                screenCoords[i].tempZ
             );

             const resolvedWorldPos = resolvedNDC.unproject(state.camera);
             scanOffsetsRef.current[m.id] = new THREE.Vector3().subVectors(resolvedWorldPos, screenCoords[i].worldPos);
          } else {
             if (scanOffsetsRef.current[m.id]) {
                scanOffsetsRef.current[m.id].set(0, 0, 0);
             } else {
                scanOffsetsRef.current[m.id] = new THREE.Vector3(0, 0, 0);
             }
          }
       });
    }
  });

  const pointerDownInfoRef = useRef<{ time: number; x: number; y: number } | null>(null);

  const handleGlobeClick = (e: any) => {
    e.stopPropagation();
    
    // Ignore right click
    if (e.button === 2) return;

    // Verify this was a genuine intentional user pointer-down on the globe
    const pDown = pointerDownInfoRef.current;
    pointerDownInfoRef.current = null;
    if (!pDown) return;

    const clickDuration = Date.now() - pDown.time;
    const moveDist = Math.hypot(e.clientX - pDown.x, e.clientY - pDown.y);

    // Prevent click if user was dragging or held down for a long gesture (> 5px move or > 700ms)
    if (e.delta > 5 || moveDist > 5 || clickDuration > 700) return;

    if (!innerMeshRef.current || !e.point) return;

    // Convert world intersection point to local coordinates of the Earth mesh
    const localPoint = innerMeshRef.current.worldToLocal(e.point.clone());
    
    // Normalize and convert using shared spherical inverse
    const { lat, lng } = vector3ToLatLng(localPoint);

    // Validate coordinates are valid numbers and inside geographic bounds
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

    console.log(`[Globe Click] Coordinate: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);

    props.onLocationClick(lat, lng, e.point);
  };

  const handleMarkerClick = (e: any, marker: MapMarker | FavoriteLocation | Waypoint | any) => {
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }

    // Prevent click if user was dragging (for Three.js pointer events)
    if (e && typeof e.delta === 'number' && e.delta > 5) return;

    // Resolve world position if Object3D is available, or compute from marker coordinates
    let worldPos: THREE.Vector3 | undefined = undefined;
    if (e && e.object && typeof e.object.getWorldPosition === 'function') {
      worldPos = new THREE.Vector3();
      e.object.getWorldPosition(worldPos);
    } else if (e && e.point instanceof THREE.Vector3) {
      worldPos = e.point.clone();
    } else if (marker && typeof marker.lat === 'number' && typeof marker.lng === 'number') {
      worldPos = latLngToVector3(marker.lat, marker.lng, 1.015);
      if (groupRef.current) {
        worldPos.applyMatrix4(groupRef.current.matrixWorld);
      }
    }

    // Marker identity/data is always available and opens the InfoPanel regardless of Three.js object presence
    props.onMarkerClick(marker, worldPos || new THREE.Vector3());
  };

  return (
    <>
    <group ref={groupRef}>
      {/* Route Lines */}
      {routeWaypoints && routeWaypoints.length > 0 && (
          <RouteLine 
            waypoints={routeWaypoints} 
            color={waypointColor} 
            isRetro={!isModern} 
            markerPositions={adjustedPositions}
          />
      )}

      {/* Earth Sphere */}
      <mesh 
        ref={innerMeshRef}
        onClick={handleGlobeClick}
        onPointerDown={(e) => {
          if (e.button === 2) return;
          props.setIsInteracting(true);
          pointerDownInfoRef.current = {
            time: Date.now(),
            x: e.clientX,
            y: e.clientY
          };
        }}
        onPointerUp={(e) => {
          if (e.button === 2) return;
          props.setIsInteracting(false);
        }}
        onPointerOut={(e) => {
          if (e.button === 2) return;
          props.setIsInteracting(false);
          pointerDownInfoRef.current = null;
        }}
      >
        {isGreen ? (
          <sphereGeometry args={[1, 16, 12]} />
        ) : isAmber ? (
          <sphereGeometry args={[1, 32, 24]} />
        ) : (
          /* High segment count for smooth displacement mapping */
          <sphereGeometry args={[1, 128, 128]} />
        )}

        {isModern ? (
          <meshPhongMaterial 
            map={colorMap} 
            normalMap={normalMap} 
            specularMap={specularMap} 
            displacementMap={displacementMap}
            displacementScale={0} // Controlled in useFrame
            shininess={15} 
            specular={new THREE.Color(0x333333)}
          />
        ) : (
          <primitive object={retroMaterial} attach="material" />
        )}
      </mesh>

      {/* OpenStreetMap Geographic Detail Layer (Zoom-dependent) */}
      <OSMMapLayer
        skin={skin}
        isInteracting={isInteracting}
        onCameraChange={props.onCameraChange}
        markers={processedMarkers}
        selectedMarkerId={selectedMarkerId}
        selectedMarkerCoordinates={props.selectedMarkerCoordinates}
        onMarkerClick={handleMarkerClick}
        onMapReady={setIsStreetMapReady}
      />

      {/* Atmospheric Fog Transition Layer (Three-Phase Transition, 1.85 -> 1.35) */}
      <OSMTransitionFog
        skin={skin}
        isMapReady={isStreetMapReady}
        isInteracting={isInteracting}
      />

      {/* Render All Markers */}
      {processedMarkers.map((marker, index) => {
        const markerKey = marker.id ?? `${marker.data?.name}-${marker.lat}-${marker.lng}-${index}`;
        return (
        <UniversalMarker
          key={markerKey}
          position={marker.position}
          color={marker.isAnchor ? (isModern ? '#3b82f6' : '#ffffff') : marker.color}
          outlineColor={outlineColor}
          size={marker.isAnchor ? 0.022 : marker.visualSize}
          hitSize={marker.hitSize}
          isRetro={!isModern}
          isSelected={selectedMarkerId === marker.id}
          isWaypoint={marker.isWaypoint}
          waypointIndex={marker.index}
          waypointRole={marker.role}
          markerData={marker.data}
          skin={skin}
          onClick={(e) => handleMarkerClick(e, marker.data)}
          onMouseEnter={() => setHoveredMarkerId(marker.id)}
          onMouseLeave={() => {
            setHoveredMarkerId((prev) => (prev === marker.id ? null : prev));
          }}
          markerId={marker.id}
          scanOffsetsRef={scanOffsetsRef}
        />
        );
      })}

      {/* Clouds Sphere - Hide for Green */}
      {!isGreen && (
        <mesh scale={[1.02, 1.02, 1.02]}>
            {isAmber ? <sphereGeometry args={[1, 32, 24]} /> : <sphereGeometry args={[1, 64, 64]} />}
            {isModern ? (
            <meshStandardMaterial 
                map={cloudsMap} 
                transparent 
                opacity={0.6} 
                depthWrite={false} 
                side={THREE.DoubleSide}
                blending={THREE.AdditiveBlending}
            />
            ) : (
            <meshBasicMaterial 
                map={cloudsMap}
                transparent
                opacity={0.15}
                color={retroColor}
                depthWrite={false}
                side={THREE.DoubleSide}
                blending={THREE.AdditiveBlending}
            />
            )}
        </mesh>
      )}

      {/* Map Scan Visualization Layer */}
      {scanningArea && (
        <group 
          position={latLngToVector3(scanningArea.lat, scanningArea.lng, 1.015)}
          ref={(group) => {
             if (group) {
                const origin = new THREE.Vector3(0, 0, 0);
                group.lookAt(origin);
             }
          }}
        >
          {/* Inner Glow Center Pulse */}
          <mesh ref={centerPulseRef}>
             <ringGeometry args={[0, 0.015, 32]} />
             <meshBasicMaterial 
               color={isParchment ? "#e8d5b5" : (isAmber ? "#fbbf24" : (isGreen ? "#4ade80" : "#22d3ee"))}
               transparent
               opacity={0.95}
               depthWrite={false}
               side={THREE.DoubleSide}
             />
          </mesh>
          
          {/* Rotating Triangulation Radar Crosshair/Lines */}
          <group ref={crosshairRef}>
             {[0, 120, 240].map((angle, idx) => (
                <line key={idx}>
                   <bufferGeometry attach="geometry">
                      <bufferAttribute
                         attach="attributes-position"
                         args={[new Float32Array([0, 0, 0, 0.12 * Math.cos(angle * Math.PI / 180), 0.12 * Math.sin(angle * Math.PI / 180), 0]), 3]}
                      />
                   </bufferGeometry>
                   <lineBasicMaterial 
                      color={isParchment ? "#e8d5b5" : (isAmber ? "#fbbf24" : (isGreen ? "#4ade80" : "#22d3ee"))} 
                      transparent 
                      opacity={0.75} 
                      depthWrite={false}
                   />
                </line>
             ))}
          </group>

          {/* Expanding rings */}
          {[0, 1, 2].map((i) => (
             <mesh key={i} ref={(el) => { scanRingsRef.current[i] = el; }}>
                <ringGeometry args={[0.08, 0.085, 32]} />
                <meshBasicMaterial 
                  color={isParchment ? "#e8d5b5" : (isAmber ? "#fbbf24" : (isGreen ? "#4ade80" : "#22d3ee"))}
                  transparent
                  depthWrite={false}
                  side={THREE.DoubleSide}
                />
             </mesh>
          ))}
        </group>
      )}
    </group>
    
    {/* Hover Overlay outside the rotating group so it stays oriented to screen */}
    <HoverOverlay 
      isInteracting={props.isInteracting} 
      groupRef={groupRef} 
      skin={props.skin} 
      onMarkerClick={props.onMarkerClick} 
      outlineColor={outlineColor}
      selectedMarkerId={selectedMarkerId}
      hoveredMarkerId={hoveredMarkerId}
      setHoveredMarkerId={setHoveredMarkerId}
    />
    </>
  );
});

export default RotatingEarth;
