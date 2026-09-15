import React from 'react';

export const ParchmentGlobeMarkerArtwork: React.FC<{ markerId: string }> = ({ markerId }) => {
  const bronzeId = `globeBronzeHead-${markerId}`;
  const emeraldId = `globeEmerald-${markerId}`;
  const shadowId = `globeShadow-${markerId}`;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%" style={{ position: 'absolute', background: 'transparent', backgroundColor: 'transparent', transform: 'translateZ(0)' }}>
      <defs>
        {/* Aged Bronze */}
        <radialGradient id={bronzeId} cx="35%" cy="28%" r="70%">
          <stop offset="0%" stopColor="#d6b56a"/>
          <stop offset="35%" stopColor="#a77b32"/>
          <stop offset="72%" stopColor="#76501f"/>
          <stop offset="100%" stopColor="#4b3215"/>
        </radialGradient>
        {/* Emerald Inset */}
        <radialGradient id={emeraldId} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#2a8a5b"/>
          <stop offset="45%" stopColor="#115E3B"/>
          <stop offset="100%" stopColor="#061F13"/>
        </radialGradient>
        {/* Soft Shadow */}
        <filter id={shadowId} x="-40%" y="-40%" width="180%" height="200%">
          <feDropShadow
            dx="1"
            dy="3"
            stdDeviation="2.5"
            floodColor="#000000"
            floodOpacity="0.45"
          />
        </filter>
      </defs>
      {/* Pin Head Only */}
      <g filter={`url(#${shadowId})`}>
        {/* Bronze pin head */}
        <circle cx="50" cy="43" r="25" fill={`url(#${bronzeId})`} stroke="#4b3215" strokeWidth="2" />
        {/* Raised bronze inner rim */}
        <circle cx="50" cy="43" r="19" fill="none" stroke="#c39a4d" strokeWidth="2" opacity="0.7" />
        {/* Emerald inset */}
        <circle cx="50" cy="43" r="11" fill={`url(#${emeraldId})`} stroke="#6e5427" strokeWidth="1.5" />
        {/* Subtle highlight */}
        <ellipse cx="44" cy="36" rx="5" ry="3" fill="#ffffff" opacity="0.16" />
      </g>
    </svg>
  );
};
