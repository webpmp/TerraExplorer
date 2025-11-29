
import React, { useRef, useImperativeHandle, forwardRef, useMemo, useEffect, useState, Suspense } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { TextureLoader } from 'three';
import { Decal, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { SkinType, GeoCoordinates, MapMarker, FavoriteLocation } from '../types';

// Fix for React Three Fiber elements not being recognized in JSX
declare global {
  namespace JSX {
    interface IntrinsicElements {
      group: any;
      mesh: any;
      sphereGeometry: any;
      meshBasicMaterial: any;
      meshPhongMaterial: any;
      meshStandardMaterial: any;
      primitive: any;
      directionalLight: any;
      ambientLight: any;
      pointLight: any;
      object3D: any;
    }
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      group: any;
      mesh: any;
      sphereGeometry: any;
      meshBasicMaterial: any;
      meshPhongMaterial: any;
      meshStandardMaterial: any;
      primitive: any;
      directionalLight: any;
      ambientLight: any;
      pointLight: any;
      object3D: any;
    }
  }
}

interface EarthProps {
  onLocationClick: (lat: number, lng: number, point: THREE.Vector3) => void;
  onMarkerClick: (marker: MapMarker | FavoriteLocation, point: THREE.Vector3) => void;
  isInteracting: boolean;
  setIsInteracting: (v: boolean) => void;
  autoRotate: boolean;
  skin: SkinType;
  boundary?: GeoCoordinates[];
  markers: MapMarker[];
  favorites: FavoriteLocation[];
  showFavorites: boolean;
  selectedMarkerId: string | null;
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
  size: number,
  hitSize: number,
  isRetro: boolean,
  isSelected: boolean,
  onClick: (e: any) => void 
}> = ({ 
  position, 
  color, 
  size,
  hitSize,
  isRetro, 
  isSelected,
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
              color={isRetro ? "#000000" : "#ffffff"} 
              side={THREE.BackSide} 
              toneMapped={false} 
              transparent={!isRetro} // Transparent for modern (white halo effect)
              opacity={isRetro ? 1.0 : 0.8}
           />
      </mesh>
    </group>
  );
};

const RotatingEarth = forwardRef<THREE.Mesh, EarthProps>((props, ref) => {
  const groupRef = useRef<THREE.Group>(null);
  const { autoRotate, isInteracting, skin, markers, favorites, showFavorites, selectedMarkerId } = props;

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
  const favoriteColor = isModern ? '#d946ef' : '#ffffff'; // Fuchsia for modern, White for retro

  // Process and scale markers to avoid overlap
  const processedMarkers = useMemo(() => {
    const allMarkers: any[] = [];

    // 1. Combine inputs into a uniform structure
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

    // 2. Calculate 3D Positions
    const itemsWithPos = allMarkers.map(item => {
        // Slightly higher radius to avoid clipping with displacement map (max ~0.04)
        const r = 1.045; 
        const pos = latLngToVector3(item.lat, item.lng, r);
        return { ...item, position: pos };
    });

    // 3. Calculate Dynamic Size based on Proximity
    return itemsWithPos.map((item, i, arr) => {
        let minDist = Infinity;
        for (let j = 0; j < arr.length; j++) {
            if (i === j) continue;
            const dist = item.position.distanceTo(arr[j].position);
            if (dist < minDist) minDist = dist;
        }
        
        let visualSize = item.baseSize;
        const collisionThreshold = item.baseSize * 2.5; // Check neighbors within this range

        if (minDist < collisionThreshold) { 
             // Scale down to fit, with 10% padding
             const maxAllowed = (minDist / 2) * 0.9; 
             // Don't shrink below a microscopic visible size (0.002)
             visualSize = Math.min(item.baseSize, Math.max(0.002, maxAllowed));
        }
        
        return { 
          ...item, 
          visualSize,
          // Keep hitbox at least baseSize, or larger if visual is tiny, to ensure clickability
          hitSize: Math.max(item.baseSize, 0.015) 
        };
    });

  }, [markers, favorites, showFavorites, markerColor, favoriteColor]);

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
          size={marker.visualSize}
          hitSize={marker.hitSize}
          isRetro={!isModern}
          isSelected={selectedMarkerId === marker.id}
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
        <mesh scale={[1.15, 1.15, 1.15]}>
            <sphereGeometry args={[1, 64, 64]} />
            <primitive object={atmosphereMaterial} attach="material" />
        </mesh>
      )}
    </group>
  );
});

export default RotatingEarth;
