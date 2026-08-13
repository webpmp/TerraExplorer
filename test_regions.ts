import { getRegionalGuidance } from './services/geminiService';

const testCases = [
  { name: 'Florida', lat: 28, lng: -81 },
  { name: 'Hawaii', lat: 21, lng: -157 },
  { name: 'Costa Rica', lat: 9.5, lng: -84 },
  { name: 'Panama', lat: 8.5, lng: -80 },
  { name: 'Tokyo', lat: 35.6, lng: 139.6 },
  { name: 'Paris', lat: 48.8, lng: 2.3 },
  { name: 'Antarctica', lat: -82, lng: 0 }
];

for (const tc of testCases) {
  const result = getRegionalGuidance(tc.lat, tc.lng);
  console.log(`${tc.name.padEnd(12)} -> ${result ? `"${result.substring(0, 15)}..."` : 'None'}`);
}
