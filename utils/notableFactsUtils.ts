/**
 * Utility functions for parsing, normalizing, and deduplicating notable facts.
 */

export interface ParsedNotableFact {
  title: string;
  description: string;
  name?: string;
  summary?: string;
  text?: string;
  wikipediaUrl?: string;
  [key: string]: any;
}

/**
 * Parses a raw notable fact item (string or object) into structured { title, description }.
 */
export const parseNotableFactItem = (n: any): ParsedNotableFact | null => {
  if (!n) return null;
  if (typeof n === 'string') {
    const text = n.trim();
    if (!text) return null;
    const colonIdx = text.indexOf(':');
    if (colonIdx !== -1 && colonIdx < 50) {
      return { title: text.substring(0, colonIdx).trim(), description: text.substring(colonIdx + 1).trim() };
    }
    const dashIdx = text.indexOf(' — ') !== -1 ? text.indexOf(' — ') : (text.indexOf(' - ') !== -1 ? text.indexOf(' - ') : -1);
    if (dashIdx !== -1 && dashIdx < 50) {
      return { title: text.substring(0, dashIdx).trim(), description: text.substring(dashIdx + 3).trim() };
    }
    const match = text.match(/^([A-Z][A-Za-z0-9\s'-]{2,35}?)\s+(?:is|offers|features|was|has|provides|known for|designated|consists of|contains|serves as|stretches|lies|stands|showcases|serves|attracts)\b\s*(.*)$/i);
    if (match && match[1]) {
      const descPart = text.substring(match[1].length).trim();
      return {
        title: match[1].trim(),
        description: descPart.charAt(0).toUpperCase() + descPart.slice(1)
      };
    }
    if (text.length > 50) {
      return { title: "Notable Feature", description: text };
    }
    return { title: text, description: "" };
  }
  if (typeof n === 'object' && n !== null) {
    const title = (n.title || n.name || (n.text && !n.summary && !n.description ? n.text : "") || "").trim();
    const description = (n.description || n.summary || n.significance || (n.text && n.text !== title ? n.text : "") || "").trim();
    if (!title && description) {
      return parseNotableFactItem(description);
    }
    if (title && !description && title.length > 50) {
      return parseNotableFactItem(title);
    }
    if (!title && !description) return null;
    return {
      ...n,
      title,
      description
    };
  }
  return null;
};

/**
 * Normalizes text for comparison by collapsing repeated whitespace, trimming, and lowercasing.
 */
export const normalizeFactComparisonKey = (text: string): string => {
  return (text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
};

/**
 * Deduplicates notable facts while strictly preserving first-occurrence order.
 * Considers two items duplicate if their normalized titles and descriptions match.
 */
export const deduplicateNotableFacts = <T = any>(facts: T[]): T[] => {
  if (!Array.isArray(facts)) {
    return [];
  }

  const seenKeys = new Set<string>();
  const result: T[] = [];

  for (const item of facts) {
    if (!item) continue;

    const parsed = parseNotableFactItem(item);
    if (!parsed) continue;

    const normTitle = normalizeFactComparisonKey(parsed.title);
    const normDesc = normalizeFactComparisonKey(parsed.description);

    if (!normTitle && !normDesc) continue;

    // Generate comparison key: composite of title + description
    const key = normTitle && normDesc 
      ? `${normTitle}:::${normDesc}` 
      : (normTitle || normDesc);

    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      result.push(item);
    }
  }

  return result;
};
