import * as THREE from 'three';

/**
 * Converts Latitude and Longitude to a 3D Vector on a sphere.
 * Uses the exact same spherical transform for both marker placement and click extraction.
 */
export const latLngToVector3 = (lat: number, lng: number, radius: number = 1): THREE.Vector3 => {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = (radius * Math.sin(phi) * Math.sin(theta));
  const y = (radius * Math.cos(phi));
  return new THREE.Vector3(x, y, z);
};

/**
 * Converts a 3D Vector on a sphere to Latitude and Longitude.
 * Must perfectly reverse the latLngToVector3 transformation.
 */
export const vector3ToLatLng = (position: THREE.Vector3): { lat: number, lng: number } => {
  const p = position.clone().normalize();
  
  // y = cos(phi) => phi = acos(y)
  const phi = Math.acos(p.y);
  const lat = 90 - (phi * 180 / Math.PI);
  
  // x = -sin(phi) * cos(theta)
  // z = sin(phi) * sin(theta)
  // atan2(z, -x) = theta
  const theta = Math.atan2(p.z, -p.x);
  let lng = (theta * 180 / Math.PI) - 180;
  
  // Normalize longitude to [-180, 180]
  while(lng < -180) lng += 360;
  while(lng > 180) lng -= 360;
  
  return { lat, lng };
};

/**
 * Formats decimal coordinates into a human-readable string (e.g., "28.22° S, 112.25° W").
 */
export const formatCoordinates = (lat: number, lng: number): string => {
  const latStr = `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lngStr = `${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? 'E' : 'W'}`;
  return `${latStr}, ${lngStr}`;
};
