import { GeographicResolution } from "./geographicResolver";
import { LOW_CONFIDENCE_THRESHOLD } from "./geographicConfidence";

export interface GeographicValidationResult {
  valid: boolean;
  warnings: string[];
}

export function validateGeographicResolution(
  resolution: GeographicResolution
): GeographicValidationResult {
  const warnings: string[] = [];
  let valid = true;

  // 1. Required field validation
  if (
    !resolution ||
    !resolution.name ||
    !resolution.coordinates ||
    typeof resolution.coordinates.lat !== 'number' ||
    typeof resolution.coordinates.lng !== 'number'
  ) {
    return { valid: false, warnings: ["Missing required geographic fields"] };
  }

  // 2. Coordinate bounds validation
  const { lat, lng } = resolution.coordinates;
  if (lat > 90 || lat < -90 || lng > 180 || lng < -180) {
    valid = false;
    warnings.push("Invalid coordinate bounds");
  }

  // 3. Entity type validation (reject impossible generic types)
  const invalidEntityTypes = ['building', 'address', 'house', 'yes'];
  if (resolution.entityType && invalidEntityTypes.includes(resolution.entityType.toLowerCase())) {
    valid = false;
    warnings.push("Non-geographic entity type rejected");
  }

  // 4. Confidence validation
  // Only reject for low confidence if it's not from the cache
  if (resolution.source !== "cache" && resolution.confidence !== undefined) {
    if (resolution.confidence < LOW_CONFIDENCE_THRESHOLD) {
      valid = false;
      warnings.push("Confidence below geographic threshold");
    }
  }

  return { valid, warnings };
}
