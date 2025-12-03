
import React, { useRef, useImperativeHandle, forwardRef, useMemo, useEffect, useState, Suspense } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { TextureLoader } from 'three';
import { Decal, useTexture, Line, Text, Billboard } from '@react-three/drei';
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
  routeWaypoints?: Waypoint[];
  currentWaypointIndex?: number;
}

// Helper to convert Lat/Lng to 3D Cartesian coordinates
const latLngToVector3 = (lat: number, lng: number, radius: number = 1) => {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = (radius * Math.sin(phi) * Math.sin(theta));
  const y = (radius * Math.cos(phi));
  return new THREE.Vector3(x, y, z);
};

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
  onClick: (e: any) => void 
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
  onClick 
}) => {
  const meshRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (meshRef.current) {
      if (isSelected) {
        // Pulsate animation - Slowed down frequency from 8 to 3
        const scale = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.3; 
        meshRef.current.scale.setScalar(scale);
      } else {
        meshRef.current.scale.setScalar(1);
      }
    }
  });

  return (
    <group position={position} onClick={onClick} ref={meshRef}>
      {/* Invisible Hitbox - ensures easy clicking even if visual dot is small */}
      <mesh 
        onPointerOver={() => document.body.style.cursor = 'pointer'}
        onPointerOut={() => document.body.style.cursor = 'auto'}
      >
         <sphereGeometry args={[hitSize, 16, 16]} />
         <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Main Dot (Visual) */}
      <mesh pointerEvents="none">
        <sphereGeometry args={[size, 16, 16]} />
        <meshBasicMaterial 
          color={color} 
          toneMapped={false} 
          transparent={true}
          opacity={0.5} 
        />
      </mesh>
      
      {/* Border Outline (Inverted Hull) - Thinner stroke (1.2 instead of 1.4) */}
      <mesh scale={[1.2, 1.2, 1.2]} pointerEvents="none">
           <sphereGeometry args={[size, 16, 16]} />
           <meshBasicMaterial 
              color={outlineColor} 
              side={THREE.BackSide} 
              toneMapped={false} 
              transparent={!isRetro} // Transparent for modern (white halo effect)
              opacity={isRetro ? 1.0 : 0.8}
           />
      </mesh>

      {/* Waypoint Number */}
      {isWaypoint && waypointIndex !== undefined && (
         <Billboard follow={true}>
            <Text
              fontSize={size * 1.6}
              color="white"
              anchorX="center"
              anchorY="middle"
              outlineWidth="5%"
              outlineColor="black"
              fontWeight="bold"
              position={[0, 0, 0]}
            >
              {waypointIndex + 1}
            </Text>
         </Billboard>
      )}
    </group>
  );
};

const RouteLine: React.FC<{ 
  waypoints: Waypoint[], 
  color: string,
  isRetro: boolean,
  markerPositions?: Map<string, THREE.Vector3>
}> = ({ waypoints, color, isRetro, markerPositions }) => {
  const points = useMemo(() => {
    if (waypoints.length < 2) return [];
    
    const curvedPoints: THREE.Vector3[] = [];
    const radius = 1.01; // Slightly above earth
    
    for (let i = 0; i < waypoints.length - 1; i++) {
        // Use displaced positions if available, otherwise calculate from lat/lng
        const start = markerPositions?.get(waypoints[i].id) || latLngToVector3(waypoints[i].lat, waypoints[i].lng, radius);
        const end = markerPositions?.get(waypoints[i+1].id) || latLngToVector3(waypoints[i+1].lat, waypoints[i+1].lng, radius);
        
        // Use a slightly safer radius for the line itself so it doesn't clip
        const lineRadius = 1.045; 

        // Generate points along the great circle arc
        const segmentPoints = 30;
        for (let j = 0; j <= segmentPoints; j++) {
            const t = j / segmentPoints;
            // Interpolate vector and re-normalize to sphere surface
            const v = new THREE.Vector3().copy(start).lerp(end, t).normalize().multiplyScalar(lineRadius);
            curvedPoints.push(v);
        }
    }
    return curvedPoints;
  }, [waypoints, markerPositions]);

  if (points.length === 0) return null;

  return (
    <Line
      points={points}
      color={color}
      lineWidth={isRetro ? 2 : 1.5}
      dashed={true}
      dashScale={20}
      dashSize={0.4}
      gapSize={0.2}
      transparent
      opacity={0.8}
    />
  );
};

const RotatingEarth = forwardRef<THREE.Mesh, EarthProps>((props, ref) => {
  const groupRef = useRef<THREE.Group>(null);
  const { autoRotate, isInteracting, skin, markers, favorites, showFavorites, selectedMarkerId, routeWaypoints, currentWaypointIndex } = props;

  // Rotate the entire group
  useFrame((state, delta) => {
    if (autoRotate && !isInteracting && groupRef.current) {
      groupRef.current.rotation.y += delta * 0.05;
    }
  });

  const isModern = skin === 'modern';
  const isGreen = skin === 'retro-green';
  const isAmber = skin === 'retro-amber';

  // Marker Colors
  const markerColor = isModern ? '#ff3333' : isGreen ? '#a3e635' : '#fcd34d';
  const favoriteColor = isModern ? '#d946ef' : '#ffffff'; 
  const waypointColor = isModern ? '#00e5ff' : '#00e5ff'; // Cyan for route waypoints
  
  // Marker Outline Colors
  const outlineColor = isModern ? '#ffffff' : isGreen ? '#4ade80' : '#fbbf24';

  // Memoize positions and declustering logic
  const { processedMarkers, adjustedPositions } = useMemo(() => {
    const allMarkers: any[] = [];

    // 0. Waypoints (High priority)
    if (routeWaypoints && routeWaypoints.length > 0) {
        routeWaypoints.forEach((wp, idx) => {
             allMarkers.push({
                type: 'waypoint',
                data: wp,
                lat: wp.lat,
                lng: wp.lng,
                baseSize: 0.02, // Larger base size for waypoints
                color: waypointColor,
                id: wp.id,
                isWaypoint: true,
                index: idx
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
            baseSize: m.populationClass === 'large' ? 0.015 : 0.008,
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
                    baseSize: 0.015,
                    color: favoriteColor,
                    id: f.id
                });
            }
        });
    }

    // 2. Calculate Initial 3D Positions
    const itemsWithPos = allMarkers.map(item => {
        const r = 1.045; 
        const pos = latLngToVector3(item.lat, item.lng, r);
        // Store as a mutable vector for declustering adjustment
        return { ...item, position: pos };
    });

    // 3. De-clustering / Nudging Logic
    // Detect clusters and arrange them side-by-side
    const groups: any[][] = [];
    const visited = new Set<string>();
    
    // Simple greedy clustering O(N^2) - fine for small N
    for(let i=0; i<itemsWithPos.length; i++) {
        if(visited.has(itemsWithPos[i].id)) continue;
        
        const group = [itemsWithPos[i]];
        visited.add(itemsWithPos[i].id);
        
        for(let j=i+1; j<itemsWithPos.length; j++) {
            if(visited.has(itemsWithPos[j].id)) continue;
            // Check distance (threshold depends on visual size, ~0.035 covers overlap)
            if (itemsWithPos[i].position.distanceTo(itemsWithPos[j].position) < 0.035) {
                group.push(itemsWithPos[j]);
                visited.add(itemsWithPos[j].id);
            }
        }
        groups.push(group);
    }
    
    // Map to store final positions for the RouteLine to access
    const finalPosMap = new Map<string, THREE.Vector3>();

    // Apply displacements
    groups.forEach(group => {
        if (group.length > 1) {
            // Calculate Center of the cluster
            const center = new THREE.Vector3();
            group.forEach(item => center.add(item.position));
            center.divideScalar(group.length).normalize();
            
            // Tangent Plane Basis
            let up = new THREE.Vector3(0, 1, 0);
            if (Math.abs(up.dot(center)) > 0.99) up = new THREE.Vector3(1, 0, 0);
            const tanX = new THREE.Vector3().crossVectors(center, up).normalize();
            const tanY = new THREE.Vector3().crossVectors(center, tanX).normalize();
            
            // Layout Radius (expands with count)
            const layoutRadius = 0.02 + (group.length * 0.006);
            
            group.forEach((item, k) => {
                const angle = (k / group.length) * Math.PI * 2;
                const offsetX = Math.cos(angle) * layoutRadius;
                const offsetY = Math.sin(angle) * layoutRadius;
                
                const shift = tanX.clone().multiplyScalar(offsetX).add(tanY.clone().multiplyScalar(offsetY));
                
                // New position projected back onto sphere radius 1.045
                const newPos = center.clone().add(shift).normalize().multiplyScalar(1.045);
                
                item.position.copy(newPos);
            });
        }
        
        // Store finalized positions
        group.forEach(item => finalPosMap.set(item.id, item.position));
    });

    // 4. Final Processing (Hitbox Size)
    const result = itemsWithPos.map(item => ({
        ...item,
        visualSize: item.baseSize,
        hitSize: Math.max(item.baseSize, 0.02) // Ensure clickable
    }));

    return { processedMarkers: result, adjustedPositions: finalPosMap };

  }, [markers, favorites, showFavorites, markerColor, favoriteColor, outlineColor, routeWaypoints, waypointColor]);

  const innerMeshRef = useRef<THREE.Mesh>(null);
  useImperativeHandle(ref, () => innerMeshRef.current!);

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
      fragmentShader: RetroShader.fragmentShader,
      flatShading: isGreen 
    });
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

            // Peak displacement scale
            mat.displacementScale = curvedIntensity * 0.04;
            mat.displacementBias = -mat.displacementScale / 2; // Center the displacement
        }
    }
  });

  const handleGlobeClick = (e: any) => {
    e.stopPropagation();
    
    // Prevent click if user was dragging (delta is distance in pixels)
    if (e.delta > 5) return;

    const uv = e.uv;
    if (!uv) return;
    const lat = (uv.y - 0.5) * 180;
    const lng = (uv.x - 0.5) * 360;
    props.onLocationClick(lat, lng, e.point);
  };

  const handleMarkerClick = (e: any, marker: MapMarker | FavoriteLocation) => {
    e.stopPropagation();

    // Prevent click if user was dragging
    if (e.delta > 5) return;

    // Get the object's world position to correctly position camera
    // e.object.position is local to the Earth group which is rotating
    const worldPos = new THREE.Vector3();
    e.object.getWorldPosition(worldPos);

    props.onMarkerClick(marker, worldPos);
  }

  return (
    <group ref={groupRef}>
      {/* Route Lines */}
      {routeWaypoints && routeWaypoints.length > 0 && (
          <RouteLine 
            waypoints={routeWaypoints} 
            color={isModern ? "#00ffff" : (isGreen ? "#4ade80" : "#fbbf24")} 
            isRetro={!isModern} 
            markerPositions={adjustedPositions}
          />
      )}

      {/* Earth Sphere */}
      <mesh 
        ref={innerMeshRef}
        onClick={handleGlobeClick}
        onPointerDown={() => props.setIsInteracting(true)}
        onPointerUp={() => props.setIsInteracting(false)}
        onPointerOut={() => props.setIsInteracting(false)}
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

      {/* Render All Markers */}
      {processedMarkers.map((marker) => (
        <UniversalMarker
          key={marker.id}
          position={marker.position}
          color={marker.color}
          outlineColor={outlineColor}
          size={marker.visualSize}
          hitSize={marker.hitSize}
          isRetro={!isModern}
          isSelected={selectedMarkerId === marker.id}
          isWaypoint={marker.isWaypoint}
          waypointIndex={marker.index}
          onClick={(e) => handleMarkerClick(e, marker.data)}
        />
      ))}

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

      {/* Atmosphere Glow - Hide for Green */}
      {!isGreen && (
        <mesh scale={[1.2, 1.2, 1.2]}>
            <sphereGeometry args={[1, 64, 64]} />
            <primitive object={atmosphereMaterial} attach="material" />
        </mesh>
      )}
    </group>
  );
});

export default RotatingEarth;
