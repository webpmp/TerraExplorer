import { ResolvedEntity } from '../domain';
import { isValidCoordinates } from '../types';

export const validateResolvedEntity = (entity: ResolvedEntity | null | undefined): boolean => {
  let failureReason = 'none';
  let coordinatesValid = false;
  let identityValid = false;
  let metadataFieldsPresent: string[] = [];
  let metadataFieldsMissing: string[] = [];
  let valid = true;

  if (!entity) {
    console.log(`[ENTITY VALIDATION]\nvalid: false\nFailure Reason: Entity is null or undefined`);
    return false;
  }

  if (entity.subject?.identity?.canonicalName && entity.subject?.identity?.entityType && entity.subject?.primaryLocation?.label) {
    identityValid = true;
  } else {
    valid = false;
    failureReason = "Invalid identity (missing canonicalName, entityType, or label)";
  }

  const coords = entity.subject?.primaryLocation?.location?.coordinates;
  if (isValidCoordinates(coords)) {
    coordinatesValid = true;
  } else {
    valid = false;
    failureReason = failureReason === 'none' ? "Invalid coordinates" : failureReason + ", Invalid coordinates";
  }

  const metadata = entity.metadata as any || {};

  const hasField = (field: string) => {
    const val = metadata[field];
    if (val === undefined || val === null) return false;
    if (typeof val === 'string' && val.trim() === '') return false;
    if (typeof val === 'number') return true;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'object') {
      if (Object.keys(val).length === 0) return false;
      if (val.text !== undefined && typeof val.text === 'string' && val.text.trim() === '') return false;
    }
    return true;
  };

  const allFields = ['description', 'population', 'climate', 'contextNotes', 'notable', 'news'];
  metadataFieldsPresent = allFields.filter(f => hasField(f));
  metadataFieldsMissing = allFields.filter(f => !hasField(f));

  // The canonical entity contract DOES NOT require metadata fields to be present.
  // Missing description, population, climate, etc., should never invalidate the geographic identity.

  console.log(`[ENTITY VALIDATION]
Coordinates valid: ${coordinatesValid}
Entity identity valid: ${identityValid}
Metadata fields present: ${metadataFieldsPresent.length > 0 ? metadataFieldsPresent.join(', ') : 'none'}
Metadata fields missing: ${metadataFieldsMissing.length > 0 ? metadataFieldsMissing.join(', ') : 'none'}
Valid: ${valid}
Failure Reason: ${failureReason}`);

  return valid;
};
