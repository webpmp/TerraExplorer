/**
 * Platform and device detection utilities.
 * Accurately detects iPad / iOS / Mobile / Tablet environments, including iPadOS 13+ desktop-class Safari.
 */
export function isMobileOrTablet(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const platform = (navigator as any).platform || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;

  // iPad on iPadOS 13+ reports platform "MacIntel" with touch points > 1
  const isIPad = /iPad/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
  const isMobile = /iPhone|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isTouchDevice = maxTouchPoints > 1 || 'ontouchstart' in window;

  return isIPad || isMobile || (isTouchDevice && window.innerWidth <= 1366);
}
