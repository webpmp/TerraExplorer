/**
 * Browser-compatible UUID v4 generator.
 * Works seamlessly across:
 * - Desktop Chrome / Firefox / Safari (secure context)
 * - iPad / iPadOS Safari (both secure context and non-secure LAN/HTTP contexts)
 * - Node.js / Vitest test environments
 */
export function generateUUID(): string {
  // 1. Native crypto.randomUUID (Available in secure contexts: HTTPS or localhost)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Fall through if randomUUID fails for any reason
    }
  }

  // 2. crypto.getRandomValues (RFC 4122 compliant UUID v4)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    try {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      // Set version (4) and RFC 4122 variant
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;

      const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    } catch {
      // Fall through to standard fallback
    }
  }

  // 3. Fallback for non-secure HTTP / WebKit contexts without window.crypto
  let d = Date.now();
  let d2 = (typeof performance !== 'undefined' && performance.now && Math.floor(performance.now() * 1000)) || 0;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    let r = Math.random() * 16;
    if (d > 0) {
      r = (d + r) % 16 | 0;
      d = Math.floor(d / 16);
    } else if (d2 > 0) {
      r = (d2 + r) % 16 | 0;
      d2 = Math.floor(d2 / 16);
    } else {
      r = r | 0;
    }
    const val = c === 'x' ? (r | 0) : ((r | 0) & 0x3 | 0x8);
    return val.toString(16);
  });
}
