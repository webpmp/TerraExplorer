import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { osmMapDataProvider } from '../geographic/osmMapDataProvider';
import { latLngToVector3 } from '../../utils/globeCoordinates';

describe('OSM Street Geometry & Overpass Pipeline Tests', () => {
  it('builds comprehensive street-level Overpass query at CLOSE level', () => {
    const extent = osmMapDataProvider.calculateViewportExtent(32.86, -102.03, 1.3);
    expect(extent).not.toBeNull();
    expect(extent?.detailLevel).toBe('close');

    const query = osmMapDataProvider.buildOverpassQuery(extent!);
    expect(query).toContain('way["highway"]');
    expect(query).toContain('way["waterway"]');
    expect(query).toContain('way["natural"="water"]');
    expect(query).toContain('way["leisure"="park"]');
    expect(query).toContain('node["place"]');
  });

  it('correctly classifies Overpass highway elements into street hierarchy', () => {
    const rawElements = [
      {
        type: 'way',
        id: 101,
        tags: { highway: 'motorway', name: 'Interstate 20' },
        geometry: [{ lat: 32.86, lon: -102.03 }, { lat: 32.87, lon: -102.04 }]
      },
      {
        type: 'way',
        id: 102,
        tags: { highway: 'primary', name: 'Main Street' },
        geometry: [{ lat: 32.86, lon: -102.03 }, { lat: 32.865, lon: -102.035 }]
      },
      {
        type: 'way',
        id: 103,
        tags: { highway: 'secondary', name: 'Oak Avenue' },
        geometry: [{ lat: 32.86, lon: -102.03 }, { lat: 32.862, lon: -102.032 }]
      },
      {
        type: 'way',
        id: 104,
        tags: { highway: 'residential', name: 'Maple Court' },
        geometry: [{ lat: 32.86, lon: -102.03 }, { lat: 32.861, lon: -102.031 }]
      },
      {
        type: 'node',
        id: 201,
        lat: 32.86,
        lon: -102.03,
        tags: { place: 'town', name: 'Lamesa' }
      }
    ];

    const parsed = osmMapDataProvider.parseFeatures(rawElements);
    expect(parsed.length).toBe(5);

    const motorway = parsed.find(f => f.id === 'way-101');
    expect(motorway?.type).toBe('road_motorway');

    const primary = parsed.find(f => f.id === 'way-102');
    expect(primary?.type).toBe('road_primary');

    const secondary = parsed.find(f => f.id === 'way-103');
    expect(secondary?.type).toBe('road_secondary');

    const residential = parsed.find(f => f.id === 'way-104');
    expect(residential?.type).toBe('road_street');

    const town = parsed.find(f => f.id === 'node-201');
    expect(town?.type).toBe('place_town');
  });

  it('converts street geometry accurately to Three.js BufferGeometry above terrain surface (> 1.012)', () => {
    const rawElements = [
      {
        type: 'way',
        id: 104,
        tags: { highway: 'residential', name: 'Maple Court' },
        geometry: [{ lat: 32.86, lon: -102.03 }, { lat: 32.861, lon: -102.031 }]
      }
    ];

    const parsed = osmMapDataProvider.parseFeatures(rawElements);
    const LINE_ALTITUDE = 1.015;
    const lines: THREE.Vector3[] = [];

    for (const f of parsed) {
      if (f.coordinates && f.coordinates.length >= 2) {
        for (let i = 0; i < f.coordinates.length - 1; i++) {
          const p1 = latLngToVector3(f.coordinates[i][0], f.coordinates[i][1], LINE_ALTITUDE);
          const p2 = latLngToVector3(f.coordinates[i + 1][0], f.coordinates[i + 1][1], LINE_ALTITUDE);
          lines.push(p1, p2);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    const arr = new Float32Array(lines.flatMap(v => [v.x, v.y, v.z]));
    geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));

    const pos = geometry.getAttribute('position');
    expect(pos.count).toBe(2);

    const firstPt = new THREE.Vector3(pos.getX(0), pos.getY(0), pos.getZ(0));
    expect(firstPt.length()).toBeCloseTo(1.015, 3);
  });
});
