import React, { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { SkinType } from '../types';
import { vector3ToLatLng } from '../utils/globeCoordinates';

export const MIN_TRANSITION_DURATION = 900;
export const MAX_TRANSITION_WAIT = 8000;
export const CLOUD_MOTION_DURATION = 14000; // 14-second smooth organic continuous period

export interface OSMTransitionFogProps {
  skin: SkinType;
  isMapReady?: boolean;
  isInteracting?: boolean;
}

export interface FogThemePalette {
  coreColor: string;
  cloudPrimary: string;
  cloudSecondary: string;
  cloudAccent: string;
  cloudWisp: string;
  maxOpacity: number;
}

export interface FogState {
  phase: 1 | 2 | 3 | 0; // 0 = inactive, 1 = fade-in over globe, 2 = full fog hold, 3 = clear & reveal OSM
  opacity: number;
  radialOutwardFactor: number;
  expansionScale: number;
  phase3Progress: number;
  isActive: boolean;
}

export interface FogSyncOptions {
  isMapReady?: boolean;
  transitionStartTime?: number | null;
  minDuration?: number;
  maxWait?: number;
  now?: number;
  forceReveal?: boolean;
}

export interface AnimatedNoiseParams {
  far: { baseFrequency: string; scale: number };
  mid: { baseFrequency: string; scale: number };
  near: { baseFrequency: string; scale: number };
}

/**
 * Calculates continuous, subtle procedural SVG turbulence & displacement parameters
 * over a 14-second organic loop to simulate living atmospheric vapor without React re-renders.
 */
export const getAnimatedNoiseParams = (timeMs: number): AnimatedNoiseParams => {
  const phaseAngle = ((timeMs % CLOUD_MOTION_DURATION) / CLOUD_MOTION_DURATION) * Math.PI * 2;

  // Far layer (subtle, large-scale atmospheric deformation)
  const farFx = (0.0035 + 0.00035 * Math.sin(phaseAngle)).toFixed(5);
  const farFy = (0.0040 + 0.00030 * Math.cos(phaseAngle * 0.85)).toFixed(5);
  const farScale = Math.round(65 + 6 * Math.sin(phaseAngle * 0.7));

  // Mid layer (flowing cumulus/stratus contours)
  const midFx = (0.0080 + 0.00060 * Math.sin(phaseAngle * 1.1 + 1.2)).toFixed(5);
  const midFy = (0.0090 + 0.00055 * Math.cos(phaseAngle * 0.95 + 0.5)).toFixed(5);
  const midScale = Math.round(90 + 8 * Math.cos(phaseAngle * 0.8));

  // Near layer (closer volumetric cloud bank motion)
  const nearFx = (0.0060 + 0.00050 * Math.sin(phaseAngle * 0.9 + 2.4)).toFixed(5);
  const nearFy = (0.0070 + 0.00045 * Math.cos(phaseAngle * 1.05 + 1.8)).toFixed(5);
  const nearScale = Math.round(130 + 10 * Math.sin(phaseAngle * 0.6 + 0.9));

  return {
    far: { baseFrequency: `${farFx} ${farFy}`, scale: farScale },
    mid: { baseFrequency: `${midFx} ${midFy}`, scale: midScale },
    near: { baseFrequency: `${nearFx} ${nearFy}`, scale: nearScale }
  };
};

export interface CloudDriftOffset {
  x: number;
  y: number;
  scale: number;
}

/**
 * Calculates continuous physical spatial drift for an individual cloud formation
 * across Far, Mid, and Near atmospheric tiers to create visible parallax and real translation.
 */
export const getCloudDriftOffset = (
  cloud: { tier: 'core' | 'mid' | 'wisp'; outwardBiasX?: number; outwardBiasY?: number },
  timeSec: number,
  index: number = 0
): CloudDriftOffset => {
  const seed = (index + 1) * 1.37;
  if (cloud.tier === 'core') {
    // Near volumetric bank: larger, more dynamic foreground drift (~100px amplitude)
    const x = Math.sin(timeSec * 0.18 + seed) * 75 + Math.cos(timeSec * 0.08 + seed * 0.5) * 45;
    const y = Math.cos(timeSec * 0.15 + seed * 1.2) * 50 + Math.sin(timeSec * 0.07 + seed) * 30;
    const scale = 1.0 + Math.sin(timeSec * 0.12 + seed) * 0.04;
    return { x, y, scale };
  } else if (cloud.tier === 'mid') {
    // Mid layer: moderate drift with distinct angle and speed (~75px amplitude)
    const x = Math.cos(timeSec * 0.13 + seed * 1.5) * 55 + Math.sin(timeSec * 0.06 + seed) * 30;
    const y = Math.sin(timeSec * 0.11 + seed * 0.8) * 40 + Math.cos(timeSec * 0.05 + seed * 1.1) * 20;
    const scale = 1.0 + Math.cos(timeSec * 0.09 + seed) * 0.03;
    return { x, y, scale };
  } else {
    // Far haze / wisps: slow, expansive background drift (~45px amplitude)
    const x = Math.sin(timeSec * 0.09 + seed * 0.9) * 35 + Math.cos(timeSec * 0.04 + seed * 1.4) * 18;
    const y = Math.cos(timeSec * 0.08 + seed * 1.1) * 25 + Math.sin(timeSec * 0.03 + seed * 0.7) * 12;
    const scale = 1.0 + Math.sin(timeSec * 0.06 + seed) * 0.02;
    return { x, y, scale };
  }
};

/**
 * Synchronized Three-Phase Atmospheric Transition State Model:
 * Phase 1: Fade In Over Globe (distance 1.90 -> 1.70) - opacity 0.00 -> 0.90
 * Phase 2: Full Fog Hold & Visible Cloud Motion (distance 1.70 -> 1.55) - opacity 0.90 -> 1.00
 * Holding: Holds Phase 2 dense clouds if distance <= 1.55 but street map is not ready or minDuration not met
 * Phase 3: Fog Clears & Center Opens while OSM Appears (distance 1.55 -> 1.35) - opacity 0.95 -> 0.00
 */
export const getFogStateForDistance = (
  distance: number,
  maxOpacity: number = 0.92,
  syncOptions?: FogSyncOptions
): FogState => {
  if (distance >= 1.90 || isNaN(distance) || distance <= 0) {
    return {
      phase: 0,
      opacity: 0,
      radialOutwardFactor: 1,
      expansionScale: 1,
      phase3Progress: 0,
      isActive: false
    };
  }

  // Phase 1: Fade In Over Globe (1.90 -> 1.70)
  if (distance > 1.70) {
    const p1 = (1.90 - distance) / (1.90 - 1.70); // 0 -> 1
    const easedP1 = p1 * p1 * (3 - 2 * p1);
    const opacity = maxOpacity * 0.92 * easedP1;
    return {
      phase: 1,
      opacity,
      radialOutwardFactor: 1.0,
      expansionScale: 1.0 + p1 * 0.08,
      phase3Progress: 0,
      isActive: true
    };
  }

  // Phase 2: Full Fog Hold & Living Cloud Motion (1.70 -> 1.55)
  if (distance > 1.55) {
    const p2 = (1.70 - distance) / (1.70 - 1.55); // 0 -> 1
    const opacity = maxOpacity * (0.92 + 0.08 * Math.sin(p2 * Math.PI));
    return {
      phase: 2,
      opacity,
      radialOutwardFactor: 1.0 + p2 * 0.12,
      expansionScale: 1.08 + p2 * 0.08,
      phase3Progress: 0,
      isActive: true
    };
  }

  // Phase 3 / Gate Evaluation (distance <= 1.55)
  const isMapReady = syncOptions?.isMapReady ?? true;
  const minDuration = syncOptions?.minDuration ?? 0;
  const maxWait = syncOptions?.maxWait ?? MAX_TRANSITION_WAIT;
  const startTime = syncOptions?.transitionStartTime ?? null;
  const now = syncOptions?.now ?? Date.now();
  const elapsed = startTime ? now - startTime : minDuration;

  const isTimedOut = elapsed >= maxWait;
  const isMinDurationSatisfied = elapsed >= minDuration;
  const canReveal = (isMapReady && isMinDurationSatisfied) || isTimedOut || (syncOptions?.forceReveal ?? false);

  // If map is not ready or minimum duration is not satisfied, hold dense Phase 2 fog!
  if (!canReveal) {
    return {
      phase: 2,
      opacity: maxOpacity * 0.92,
      radialOutwardFactor: 1.12,
      expansionScale: 1.16,
      phase3Progress: 0,
      isActive: true
    };
  }

  // If at and below 1.35 and canReveal, inactive (street level reached)
  if (distance <= 1.35) {
    return {
      phase: 0,
      opacity: 0,
      radialOutwardFactor: 4.72,
      expansionScale: 1.81,
      phase3Progress: 1.0,
      isActive: false
    };
  }

  // Phase 3: Fog Clears Organically & Center Parts while OSM Emerges (1.55 -> 1.35)
  const p3 = (1.55 - distance) / (1.55 - 1.35); // 0 -> 1
  const nonLinearFade = 1 - Math.pow(p3, 1.5);
  const opacity = maxOpacity * Math.max(0, Math.min(1, nonLinearFade));
  const radialOutwardFactor = 1.12 + Math.pow(p3, 0.85) * 3.6;
  const expansionScale = 1.16 + p3 * 0.65;

  return {
    phase: 3,
    opacity,
    radialOutwardFactor,
    expansionScale,
    phase3Progress: p3,
    isActive: opacity > 0.001
  };
};

/**
 * Returns theme-appropriate palette for the atmospheric fog.
 * Parchment uses neutral white/light-gray atmospheric tones.
 */
export const getFogPalette = (skin: SkinType): FogThemePalette => {
  switch (skin) {
    case 'parchment':
      return {
        coreColor: 'rgba(245, 247, 248, 0.76)',
        cloudPrimary: 'rgba(238, 241, 243, 0.68)',
        cloudSecondary: 'rgba(218, 222, 225, 0.54)',
        cloudAccent: 'rgba(198, 203, 207, 0.42)',
        cloudWisp: 'rgba(228, 232, 235, 0.22)',
        maxOpacity: 0.90
      };
    case 'retro-green':
      return {
        coreColor: 'rgba(74, 222, 128, 0.65)',
        cloudPrimary: 'rgba(34, 197, 94, 0.52)',
        cloudSecondary: 'rgba(22, 163, 74, 0.40)',
        cloudAccent: 'rgba(21, 128, 61, 0.30)',
        cloudWisp: 'rgba(74, 222, 128, 0.16)',
        maxOpacity: 0.82
      };
    case 'retro-amber':
      return {
        coreColor: 'rgba(251, 191, 36, 0.65)',
        cloudPrimary: 'rgba(245, 158, 11, 0.52)',
        cloudSecondary: 'rgba(217, 119, 6, 0.40)',
        cloudAccent: 'rgba(180, 83, 9, 0.30)',
        cloudWisp: 'rgba(251, 191, 36, 0.16)',
        maxOpacity: 0.82
      };
    case 'modern':
    default:
      return {
        coreColor: 'rgba(255, 255, 255, 0.78)',
        cloudPrimary: 'rgba(242, 248, 255, 0.70)',
        cloudSecondary: 'rgba(228, 238, 254, 0.56)',
        cloudAccent: 'rgba(214, 228, 250, 0.42)',
        cloudWisp: 'rgba(235, 244, 255, 0.22)',
        maxOpacity: 0.92
      };
  }
};

export interface CloudMassConfig {
  id: string;
  tier: 'core' | 'mid' | 'wisp';
  filterType: 'near' | 'mid' | 'far';
  baseOffsetX: number;
  baseOffsetY: number;
  widthPx: number;
  heightPx: number;
  borderRadius: string;
  blurPx: number;
  driftAnimation: string;
  colorType: 'core' | 'primary' | 'secondary' | 'accent' | 'wisp';
  baseOpacity: number;
  outwardBiasX: number; // Directional bias when expanding in Phase 3
  outwardBiasY: number;
}

/**
 * 17 Asymmetric Procedural Cloud Formations across 3 Atmospheric Spatial Scales:
 * - Tier 1 (Near / Core Cloud Bank): 5 dense volumetric cloud masses with deep procedural displacement.
 * - Tier 2 (Mid Cloud Layer): 6 intermediate cumulus/stratus cloud formations with medium frequency turbulence and gaps.
 * - Tier 3 (Far Atmospheric Wisps): 6 broad atmospheric haze wisps with low-frequency soft turbulence.
 */
export const CLOUD_MASSES: CloudMassConfig[] = [
  // --- TIER 1: NEAR VOLUMETRIC CLOUD BANK (Dense, high-displacement core volume) ---
  {
    id: 'core-cloud-nw',
    tier: 'core',
    filterType: 'near',
    baseOffsetX: -40,
    baseOffsetY: -28,
    widthPx: 540,
    heightPx: 360,
    borderRadius: '58% 42% 64% 36% / 46% 56% 44% 54%',
    blurPx: 16,
    driftAnimation: 'osm-fog-drift-1 26s ease-in-out infinite alternate',
    colorType: 'core',
    baseOpacity: 0.76,
    outwardBiasX: -1.2,
    outwardBiasY: -1.0
  },
  {
    id: 'core-cloud-ne',
    tier: 'core',
    filterType: 'near',
    baseOffsetX: 48,
    baseOffsetY: -22,
    widthPx: 510,
    heightPx: 340,
    borderRadius: '44% 56% 38% 62% / 58% 42% 60% 40%',
    blurPx: 15,
    driftAnimation: 'osm-fog-drift-2 30s ease-in-out infinite alternate',
    colorType: 'primary',
    baseOpacity: 0.72,
    outwardBiasX: 1.3,
    outwardBiasY: -0.9
  },
  {
    id: 'core-cloud-sw',
    tier: 'core',
    filterType: 'near',
    baseOffsetX: -32,
    baseOffsetY: 42,
    widthPx: 530,
    heightPx: 370,
    borderRadius: '62% 38% 54% 46% / 42% 62% 38% 58%',
    blurPx: 16,
    driftAnimation: 'osm-fog-drift-3 24s ease-in-out infinite alternate',
    colorType: 'primary',
    baseOpacity: 0.74,
    outwardBiasX: -1.1,
    outwardBiasY: 1.2
  },
  {
    id: 'core-cloud-se',
    tier: 'core',
    filterType: 'near',
    baseOffsetX: 38,
    baseOffsetY: 36,
    widthPx: 500,
    heightPx: 330,
    borderRadius: '48% 52% 60% 40% / 54% 44% 56% 46%',
    blurPx: 14,
    driftAnimation: 'osm-fog-drift-4 28s ease-in-out infinite alternate',
    colorType: 'core',
    baseOpacity: 0.70,
    outwardBiasX: 1.2,
    outwardBiasY: 1.1
  },
  {
    id: 'core-cloud-ctr',
    tier: 'core',
    filterType: 'near',
    baseOffsetX: 8,
    baseOffsetY: 5,
    widthPx: 480,
    heightPx: 320,
    borderRadius: '52% 48% 45% 55% / 48% 54% 46% 52%',
    blurPx: 15,
    driftAnimation: 'osm-fog-drift-5 22s ease-in-out infinite alternate',
    colorType: 'secondary',
    baseOpacity: 0.65,
    outwardBiasX: 0.4,
    outwardBiasY: -0.5
  },

  // --- TIER 2: MID CLOUD FORMATIONS (Asymmetric formations with transparent gaps) ---
  {
    id: 'mid-cloud-top',
    tier: 'mid',
    filterType: 'mid',
    baseOffsetX: -15,
    baseOffsetY: -190,
    widthPx: 600,
    heightPx: 380,
    borderRadius: '65% 35% 58% 42% / 42% 62% 38% 58%',
    blurPx: 18,
    driftAnimation: 'osm-fog-drift-2 29s ease-in-out infinite alternate 1s',
    colorType: 'secondary',
    baseOpacity: 0.54,
    outwardBiasX: -0.2,
    outwardBiasY: -1.8
  },
  {
    id: 'mid-cloud-right',
    tier: 'mid',
    filterType: 'mid',
    baseOffsetX: 220,
    baseOffsetY: -35,
    widthPx: 570,
    heightPx: 390,
    borderRadius: '46% 54% 39% 61% / 56% 42% 58% 44%',
    blurPx: 17,
    driftAnimation: 'osm-fog-drift-6 27s ease-in-out infinite alternate',
    colorType: 'accent',
    baseOpacity: 0.50,
    outwardBiasX: 1.9,
    outwardBiasY: -0.3
  },
  {
    id: 'mid-cloud-bottom-right',
    tier: 'mid',
    filterType: 'mid',
    baseOffsetX: 180,
    baseOffsetY: 175,
    widthPx: 580,
    heightPx: 370,
    borderRadius: '54% 46% 62% 38% / 44% 58% 42% 56%',
    blurPx: 19,
    driftAnimation: 'osm-fog-drift-7 31s ease-in-out infinite alternate',
    colorType: 'secondary',
    baseOpacity: 0.52,
    outwardBiasX: 1.6,
    outwardBiasY: 1.5
  },
  {
    id: 'mid-cloud-bottom-left',
    tier: 'mid',
    filterType: 'mid',
    baseOffsetX: -190,
    baseOffsetY: 165,
    widthPx: 590,
    heightPx: 400,
    borderRadius: '42% 58% 48% 52% / 60% 40% 60% 40%',
    blurPx: 20,
    driftAnimation: 'osm-fog-drift-3 25s ease-in-out infinite alternate 2s',
    colorType: 'accent',
    baseOpacity: 0.50,
    outwardBiasX: -1.7,
    outwardBiasY: 1.4
  },
  {
    id: 'mid-cloud-left',
    tier: 'mid',
    filterType: 'mid',
    baseOffsetX: -230,
    baseOffsetY: -25,
    widthPx: 560,
    heightPx: 380,
    borderRadius: '60% 40% 55% 45% / 48% 58% 42% 52%',
    blurPx: 18,
    driftAnimation: 'osm-fog-drift-1 28s ease-in-out infinite alternate 1.5s',
    colorType: 'primary',
    baseOpacity: 0.54,
    outwardBiasX: -1.9,
    outwardBiasY: -0.2
  },
  {
    id: 'mid-cloud-top-left',
    tier: 'mid',
    filterType: 'mid',
    baseOffsetX: -160,
    baseOffsetY: -170,
    widthPx: 540,
    heightPx: 360,
    borderRadius: '50% 50% 44% 56% / 54% 46% 54% 46%',
    blurPx: 18,
    driftAnimation: 'osm-fog-drift-4 32s ease-in-out infinite alternate',
    colorType: 'secondary',
    baseOpacity: 0.48,
    outwardBiasX: -1.4,
    outwardBiasY: -1.5
  },

  // --- TIER 3: FAR ATMOSPHERIC WISPS (Broad, low-frequency soft atmospheric haze) ---
  {
    id: 'wisp-top-left',
    tier: 'wisp',
    filterType: 'far',
    baseOffsetX: -440,
    baseOffsetY: -280,
    widthPx: 800,
    heightPx: 500,
    borderRadius: '62% 38% 56% 44% / 46% 60% 40% 54%',
    blurPx: 26,
    driftAnimation: 'osm-fog-drift-5 36s ease-in-out infinite alternate',
    colorType: 'wisp',
    baseOpacity: 0.35,
    outwardBiasX: -2.4,
    outwardBiasY: -2.0
  },
  {
    id: 'wisp-top-right',
    tier: 'wisp',
    filterType: 'far',
    baseOffsetX: 460,
    baseOffsetY: -260,
    widthPx: 770,
    heightPx: 480,
    borderRadius: '44% 56% 62% 38% / 56% 42% 58% 44%',
    blurPx: 25,
    driftAnimation: 'osm-fog-drift-2 34s ease-in-out infinite alternate 2s',
    colorType: 'wisp',
    baseOpacity: 0.32,
    outwardBiasX: 2.3,
    outwardBiasY: -1.9
  },
  {
    id: 'wisp-bottom-right',
    tier: 'wisp',
    filterType: 'far',
    baseOffsetX: 450,
    baseOffsetY: 290,
    widthPx: 780,
    heightPx: 490,
    borderRadius: '58% 42% 48% 52% / 40% 64% 36% 60%',
    blurPx: 27,
    driftAnimation: 'osm-fog-drift-7 35s ease-in-out infinite alternate 1s',
    colorType: 'wisp',
    baseOpacity: 0.34,
    outwardBiasX: 2.2,
    outwardBiasY: 2.2
  },
  {
    id: 'wisp-bottom-left',
    tier: 'wisp',
    filterType: 'far',
    baseOffsetX: -450,
    baseOffsetY: 280,
    widthPx: 810,
    heightPx: 510,
    borderRadius: '48% 52% 42% 58% / 62% 38% 62% 38%',
    blurPx: 28,
    driftAnimation: 'osm-fog-drift-6 33s ease-in-out infinite alternate',
    colorType: 'wisp',
    baseOpacity: 0.36,
    outwardBiasX: -2.3,
    outwardBiasY: 2.1
  },
  {
    id: 'wisp-top-center',
    tier: 'wisp',
    filterType: 'far',
    baseOffsetX: 40,
    baseOffsetY: -360,
    widthPx: 840,
    heightPx: 470,
    borderRadius: '55% 45% 60% 40% / 48% 58% 42% 52%',
    blurPx: 29,
    driftAnimation: 'osm-fog-drift-1 38s ease-in-out infinite alternate',
    colorType: 'wisp',
    baseOpacity: 0.30,
    outwardBiasX: 0.3,
    outwardBiasY: -2.5
  },
  {
    id: 'wisp-bottom-center',
    tier: 'wisp',
    filterType: 'far',
    baseOffsetX: -30,
    baseOffsetY: 350,
    widthPx: 860,
    heightPx: 480,
    borderRadius: '46% 54% 40% 60% / 54% 44% 56% 46%',
    blurPx: 30,
    driftAnimation: 'osm-fog-drift-3 37s ease-in-out infinite alternate 2s',
    colorType: 'wisp',
    baseOpacity: 0.30,
    outwardBiasX: -0.4,
    outwardBiasY: 2.5
  }
];

export interface AtmosphericFilterDefsProps {
  turbFarRef?: React.RefObject<SVGFETurbulenceElement>;
  turbMidRef?: React.RefObject<SVGFETurbulenceElement>;
  turbNearRef?: React.RefObject<SVGFETurbulenceElement>;
  dispFarRef?: React.RefObject<SVGFEDisplacementMapElement>;
  dispMidRef?: React.RefObject<SVGFEDisplacementMapElement>;
  dispNearRef?: React.RefObject<SVGFEDisplacementMapElement>;
}

/**
 * Procedural Atmospheric Noise & Displacement Filters for three distinct spatial tiers
 * (Far haze, Mid cloud masses, Near volumetric fog bank) with userSpaceOnUse coordinate alignment.
 */
export const AtmosphericFilterDefs: React.FC<AtmosphericFilterDefsProps> = ({
  turbFarRef,
  turbMidRef,
  turbNearRef,
  dispFarRef,
  dispMidRef,
  dispNearRef
}) => (
  <svg
    width="0"
    height="0"
    style={{ position: 'absolute', pointerEvents: 'none', width: 0, height: 0, overflow: 'hidden' }}
    aria-hidden="true"
  >
    <defs>
      {/* 1. FAR LAYER: Very low frequency, smooth atmospheric haze structure */}
      <filter
        id="fog-filter-far"
        x="-30%"
        y="-30%"
        width="160%"
        height="160%"
        filterUnits="userSpaceOnUse"
        primitiveUnits="userSpaceOnUse"
      >
        <feTurbulence
          ref={turbFarRef}
          id="fog-turb-far"
          type="fractalNoise"
          baseFrequency="0.0035 0.004"
          numOctaves={3}
          seed={101}
          result="farNoise"
        />
        <feDisplacementMap
          ref={dispFarRef}
          id="fog-disp-far"
          in="SourceGraphic"
          in2="farNoise"
          scale={65}
          xChannelSelector="R"
          yChannelSelector="G"
          result="farDisplaced"
        />
        <feGaussianBlur in="farDisplaced" stdDeviation={18} result="farBlurred" />
      </filter>

      {/* 2. MID LAYER: Medium frequency, organic cumulus/stratus cloud formations with gaps */}
      <filter
        id="fog-filter-mid"
        x="-30%"
        y="-30%"
        width="160%"
        height="160%"
        filterUnits="userSpaceOnUse"
        primitiveUnits="userSpaceOnUse"
      >
        <feTurbulence
          ref={turbMidRef}
          id="fog-turb-mid"
          type="fractalNoise"
          baseFrequency="0.008 0.009"
          numOctaves={3}
          seed={202}
          result="midNoise"
        />
        <feDisplacementMap
          ref={dispMidRef}
          id="fog-disp-mid"
          in="SourceGraphic"
          in2="midNoise"
          scale={90}
          xChannelSelector="R"
          yChannelSelector="G"
          result="midDisplaced"
        />
        <feGaussianBlur in="midDisplaced" stdDeviation={12} result="midBlurred" />
      </filter>

      {/* 3. NEAR LAYER: Low-to-mid frequency, high displacement amplitude for volumetric cloud descent */}
      <filter
        id="fog-filter-near"
        x="-35%"
        y="-35%"
        width="170%"
        height="170%"
        filterUnits="userSpaceOnUse"
        primitiveUnits="userSpaceOnUse"
      >
        <feTurbulence
          ref={turbNearRef}
          id="fog-turb-near"
          type="fractalNoise"
          baseFrequency="0.006 0.007"
          numOctaves={3}
          seed={303}
          result="nearNoise"
        />
        <feDisplacementMap
          ref={dispNearRef}
          id="fog-disp-near"
          in="SourceGraphic"
          in2="nearNoise"
          scale={130}
          xChannelSelector="R"
          yChannelSelector="G"
          result="nearDisplaced"
        />
        <feGaussianBlur in="nearDisplaced" stdDeviation={14} result="nearBlurred" />
      </filter>
    </defs>
  </svg>
);

export const OSMTransitionFog: React.FC<OSMTransitionFogProps> = ({ skin, isMapReady = false, isInteracting = false }) => {
  const rootGroupRef = useRef<THREE.Group>(null);
  const [fogState, setFogState] = useState<FogState>(() => getFogStateForDistance(4.5));
  const fogStateRef = useRef<FogState>(fogState);
  const lastLoggedPhaseRef = useRef<number>(-1);
  const lastGlobeGeoRef = useRef<{ lat: number; lng: number }>({ lat: 0, lng: 0 });

  // SVG Filter Animation Refs (direct DOM mutation, zero React re-renders)
  const turbFarRef = useRef<SVGFETurbulenceElement>(null);
  const turbMidRef = useRef<SVGFETurbulenceElement>(null);
  const turbNearRef = useRef<SVGFETurbulenceElement>(null);
  const dispFarRef = useRef<SVGFEDisplacementMapElement>(null);
  const dispMidRef = useRef<SVGFEDisplacementMapElement>(null);
  const dispNearRef = useRef<SVGFEDisplacementMapElement>(null);
  const cloudDomRefs = useRef<(HTMLDivElement | null)[]>([]);
  const motionTimeRef = useRef<number>(0);

  // Transition Lifecycle Synchronization Refs
  const hasStartedRef = useRef<boolean>(false);
  const transitionStartTimeRef = useRef<number | null>(null);
  const cloudCompleteRef = useRef<boolean>(false);
  const streetMapReadyLoggedRef = useRef<boolean>(false);
  const revealLoggedRef = useRef<boolean>(false);
  const revealStartTimeRef = useRef<number | null>(null);

  useFrame((state, delta) => {
    if (!rootGroupRef.current) return;
    const localCamPos = rootGroupRef.current.worldToLocal(state.camera.position.clone());
    const dist = localCamPos.length();
    const currentGeo = vector3ToLatLng(localCamPos);
    const now = Date.now();

    // Subtle continuous procedural cloud motion and physical spatial translation
    if (fogStateRef.current.isActive || dist <= 1.90) {
      motionTimeRef.current += delta;
      const t = motionTimeRef.current;
      const noise = getAnimatedNoiseParams(t * 1000);

      if (turbFarRef.current) turbFarRef.current.setAttribute('baseFrequency', noise.far.baseFrequency);
      if (dispFarRef.current) dispFarRef.current.setAttribute('scale', String(noise.far.scale));

      if (turbMidRef.current) turbMidRef.current.setAttribute('baseFrequency', noise.mid.baseFrequency);
      if (dispMidRef.current) dispMidRef.current.setAttribute('scale', String(noise.mid.scale));

      if (turbNearRef.current) turbNearRef.current.setAttribute('baseFrequency', noise.near.baseFrequency);
      if (dispNearRef.current) dispNearRef.current.setAttribute('scale', String(noise.near.scale));

      // Physically translate each individual cloud formation through screen space
      for (let i = 0; i < CLOUD_MASSES.length; i++) {
        const el = cloudDomRefs.current[i];
        if (el) {
          const drift = getCloudDriftOffset(CLOUD_MASSES[i], t, i);
          el.style.transform = `translate(-50%, -50%) translate(${drift.x.toFixed(1)}px, ${drift.y.toFixed(1)}px) scale(${drift.scale.toFixed(3)})`;
        }
      }
    }

    // 1. Reset / Cancel lifecycle when in Globe navigation mode:
    // Distance > 1.85 (in space) OR (distance > 1.55 while user drags/rotates globe or changes sub-camera geography)
    const dLat = Math.abs(currentGeo.lat - lastGlobeGeoRef.current.lat);
    const dLng = Math.abs(currentGeo.lng - lastGlobeGeoRef.current.lng);
    const hasGlobeShifted = hasStartedRef.current && (dLat > 0.5 || (dLng > 0.5 && dLng < 359.5));
    const isGlobeNavigating = dist > 1.85 || (dist > 1.55 && (isInteracting || hasGlobeShifted));

    if (isGlobeNavigating) {
      if (hasStartedRef.current) {
        hasStartedRef.current = false;
        transitionStartTimeRef.current = null;
        cloudCompleteRef.current = false;
        streetMapReadyLoggedRef.current = false;
        revealLoggedRef.current = false;
        revealStartTimeRef.current = null;
        lastLoggedPhaseRef.current = -1;
      }
      lastGlobeGeoRef.current = currentGeo;
      const resetState = getFogStateForDistance(dist);
      fogStateRef.current = resetState;
      if (fogState.isActive !== resetState.isActive || Math.abs(fogState.opacity - resetState.opacity) >= 0.05) {
        setFogState(resetState);
      }
      return;
    }

    // 2. Transition Started event (distance <= 1.85 and descending toward new destination)
    if (!hasStartedRef.current && dist <= 1.85 && !isInteracting) {
      hasStartedRef.current = true;
      transitionStartTimeRef.current = now;
      lastGlobeGeoRef.current = currentGeo;
      console.log('[Transition] started');
    }

    // 3. Street Map Ready event (logged when map signals readiness during transition)
    if (isMapReady && !streetMapReadyLoggedRef.current && hasStartedRef.current) {
      streetMapReadyLoggedRef.current = true;
      console.log('[Transition] street map ready');
    }

    // 4. Cloud Obscuration Complete event (camera reached full fog density <= 1.55)
    if (dist <= 1.55 && !cloudCompleteRef.current && hasStartedRef.current) {
      cloudCompleteRef.current = true;
      console.log('[Transition] cloud complete');
    }

    const elapsed = transitionStartTimeRef.current ? now - transitionStartTimeRef.current : 0;
    const isMinDurationSatisfied = elapsed >= MIN_TRANSITION_DURATION;
    const isTimedOut = elapsed >= MAX_TRANSITION_WAIT;
    const canReveal = (isMapReady && isMinDurationSatisfied) || isTimedOut;

    // 5. Final Reveal event (satisfies both cloudComplete and streetMapReady)
    if (dist <= 1.55 && canReveal && !revealLoggedRef.current && hasStartedRef.current) {
      revealLoggedRef.current = true;
      console.log('[Transition] reveal');
      if (!revealStartTimeRef.current) {
        revealStartTimeRef.current = now;
      }
    }

    let nextState = getFogStateForDistance(dist, 0.92, {
      isMapReady,
      transitionStartTime: transitionStartTimeRef.current,
      minDuration: MIN_TRANSITION_DURATION,
      maxWait: MAX_TRANSITION_WAIT,
      now
    });

    // Smooth organic reveal if camera arrived at street level (dist <= 1.35) during a hold
    if (canReveal && dist <= 1.35 && revealStartTimeRef.current) {
      const revealProgress = Math.min(1, (now - revealStartTimeRef.current) / 450);
      if (revealProgress < 1) {
        const nonLinearFade = 1 - Math.pow(revealProgress, 1.5);
        nextState = {
          phase: 3,
          opacity: 0.92 * Math.max(0, nonLinearFade),
          radialOutwardFactor: 1.12 + Math.pow(revealProgress, 0.85) * 3.6,
          expansionScale: 1.16 + revealProgress * 0.65,
          phase3Progress: revealProgress,
          isActive: nonLinearFade > 0.001
        };
      }
    }

    fogStateRef.current = nextState;

    if (nextState.phase !== lastLoggedPhaseRef.current) {
      lastLoggedPhaseRef.current = nextState.phase;
      const phaseLabel =
        nextState.phase === 1
          ? 'Phase 1: Fade In Over Globe (1.90 -> 1.70)'
          : nextState.phase === 2
          ? 'Phase 2: Full Fog Hold & Motion (1.70 -> 1.55)'
          : nextState.phase === 3
          ? 'Phase 3: Fog Clears Organically for OSM (1.55 -> 1.35)'
          : 'Inactive';
      console.log(
        `[OSM Atmospheric Fog] PHASE: ${phaseLabel} | distance=${dist.toFixed(4)} | opacity=${nextState.opacity.toFixed(2)}`
      );
    }

    const curr = fogState;
    if (
      curr.isActive !== nextState.isActive ||
      curr.phase !== nextState.phase ||
      Math.abs(curr.opacity - nextState.opacity) >= 0.02 ||
      Math.abs(curr.radialOutwardFactor - nextState.radialOutwardFactor) >= 0.05
    ) {
      setFogState(nextState);
    }
  });

  const palette = useMemo(() => getFogPalette(skin), [skin]);

  if (!fogState.isActive) {
    return <group ref={rootGroupRef} />;
  }

  const getColorForType = (type: 'core' | 'primary' | 'secondary' | 'accent' | 'wisp') => {
    switch (type) {
      case 'core':
        return palette.coreColor;
      case 'primary':
        return palette.cloudPrimary;
      case 'secondary':
        return palette.cloudSecondary;
      case 'accent':
        return palette.cloudAccent;
      case 'wisp':
        return palette.cloudWisp;
    }
  };

  return (
    <group ref={rootGroupRef}>
      <Html
        fullscreen
        zIndexRange={[15, 0]}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          zIndex: 15,
          touchAction: 'none'
        }}
      >
        <AtmosphericFilterDefs
          turbFarRef={turbFarRef}
          turbMidRef={turbMidRef}
          turbNearRef={turbNearRef}
          dispFarRef={dispFarRef}
          dispMidRef={dispMidRef}
          dispNearRef={dispNearRef}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            userSelect: 'none',
            overflow: 'hidden',
            opacity: fogState.opacity,
            willChange: 'opacity'
          }}
        >
          {/* 17 Procedural Organic Cloud Formations across 3 Atmospheric Spatial Scales */}
          {CLOUD_MASSES.map((cloud, idx) => {
            // Radial outward dispersion during Phase 3
            const p3 = fogState.phase3Progress;
            const outwardDispersion = Math.pow(p3, 0.85) * 240;
            const posX = cloud.baseOffsetX + cloud.outwardBiasX * outwardDispersion;
            const posY = cloud.baseOffsetY + cloud.outwardBiasY * outwardDispersion;

            // In Phase 3, core clouds clear faster than peripheral clouds to open the center view
            let cloudOpacity = cloud.baseOpacity;
            if (fogState.phase === 3) {
              if (cloud.tier === 'core') {
                cloudOpacity *= Math.max(0, 1.0 - Math.pow(p3 * 1.25, 1.3));
              } else if (cloud.tier === 'mid') {
                cloudOpacity *= Math.max(0, 1.0 - Math.pow(p3, 1.5));
              } else {
                cloudOpacity *= Math.max(0, 1.0 - Math.pow(p3, 1.8));
              }
            }

            if (cloudOpacity <= 0.005) return null;

            const color = getColorForType(cloud.colorType);
            const filterUrl = `url(#fog-filter-${cloud.filterType})`;

            return (
              <div
                key={cloud.id}
                ref={(el) => {
                  cloudDomRefs.current[idx] = el;
                }}
                style={{
                  position: 'absolute',
                  top: `calc(50% + ${posY}px)`,
                  left: `calc(50% + ${posX}px)`,
                  width: `${cloud.widthPx * fogState.expansionScale}px`,
                  height: `${cloud.heightPx * fogState.expansionScale}px`,
                  borderRadius: cloud.borderRadius,
                  background: `radial-gradient(ellipse at center, ${color} 0%, ${color.replace(/[\d\.]+\)$/, '0.35)')} 55%, transparent 80%)`,
                  filter: `${filterUrl} blur(${cloud.blurPx}px)`,
                  opacity: cloudOpacity,
                  transform: 'translate(-50%, -50%)',
                  transformOrigin: 'center center',
                  pointerEvents: 'none',
                  willChange: 'transform'
                }}
              />
            );
          })}
        </div>
      </Html>
    </group>
  );
};

export default OSMTransitionFog;

