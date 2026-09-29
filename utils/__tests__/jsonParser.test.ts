import { describe, it, expect } from 'vitest';
import { parseAndExtract, repairJson } from '../jsonParser';

describe('JSON Parser - Comma-Formatted Numeric Values and Prefix Handling', () => {
  it('Test A: successfully repairs and parses comma-separated numeric values in JSON property position', () => {
    const input = `{
      "name": "Bogota",
      "population": 7,692,330,
      "elevation": 2,640
    }`;

    const result = parseAndExtract(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.value as any;
      expect(data.name).toBe('Bogota');
      expect(data.population).toBe(7692330);
      expect(data.elevation).toBe(2640);
    }
  });

  it('Test B: successfully extracts and parses JSON when preceded by local model prefix tags like -NLSHMKM', () => {
    const input = `-NLSHMKM{
      "@context": "https://schema.org",
      "@type": "Landmark",
      "name": "Bogota",
      "population": 7,692,330,
      "description": "Bogota is the high-altitude capital of Colombia."
    }`;

    const result = parseAndExtract(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.value as any;
      expect(data.name).toBe('Bogota');
      expect(data.population).toBe(7692330);
      expect(data.description).toBe('Bogota is the high-altitude capital of Colombia.');
      // The prefix -NLSHMKM must not be in any field
      expect(JSON.stringify(data)).not.toContain('-NLSHMKM');
    }
  });

  it('Test C: preserves quoted comma-containing text without altering strings', () => {
    const input = `{
      "name": "Bogota",
      "description": "Bogota is a large, historic city with over 1,000 parks and 500,000 trees.",
      "notes": "Founded on August 6, 1538, by Gonzalo Jimenez de Quesada."
    }`;

    const result = parseAndExtract(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.value as any;
      expect(data.description).toBe('Bogota is a large, historic city with over 1,000 parks and 500,000 trees.');
      expect(data.notes).toBe('Founded on August 6, 1538, by Gonzalo Jimenez de Quesada.');
    }
  });

  it('Test D: parses standard JSON with normal commas separating properties and array elements', () => {
    const input = `{
      "name": "Bogota",
      "description": "A city in Colombia",
      "notable": ["Monserrate", "Gold Museum", "La Candelaria"],
      "climate": {
        "name": "Subtropical highland climate",
        "description": "Mild throughout the year"
      }
    }`;

    const result = parseAndExtract(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.value as any;
      expect(data.name).toBe('Bogota');
      expect(data.notable).toEqual(['Monserrate', 'Gold Museum', 'La Candelaria']);
      expect(data.climate.name).toBe('Subtropical highland climate');
    }
  });
});
