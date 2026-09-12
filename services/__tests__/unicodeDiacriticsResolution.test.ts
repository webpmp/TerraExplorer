import { describe, test, expect } from 'vitest';
import { stripDiacritics, getUnicodeNormalizedForms, areEntitiesMatchingWithDiacritics } from '../geographic/geographicNormalization';
import { extractDistinctiveEntityTokens, validateEntityIdentity } from '../geographic/entityIdentityValidator';
import { toCanonicalTitleCase } from '../geographic/historicalCoordinateValidator';
import { determineHistoricalEventScope } from '../geographic/historicalEventScope';
import { recoverCoordinatesFromAi } from '../geminiService';
import { runSearchPipeline } from '../pipeline';

describe('Unicode and Diacritics Resolution Pipeline Tests', () => {

  describe('1. Normalization and Diacritics Utilities', () => {
    test('stripDiacritics removes accents from various international Unicode characters while preserving case', () => {
      expect(stripDiacritics('caldeirão')).toBe('caldeirao');
      expect(stripDiacritics('Caldeirão')).toBe('Caldeirao');
      expect(stripDiacritics('São Paulo')).toBe('Sao Paulo');
      expect(stripDiacritics('São Tomé')).toBe('Sao Tome');
      expect(stripDiacritics('München')).toBe('Munchen');
      expect(stripDiacritics('Zürich')).toBe('Zurich');
      expect(stripDiacritics('Québec')).toBe('Quebec');
      expect(stripDiacritics('Niño')).toBe('Nino');
      expect(stripDiacritics('Ålesund')).toBe('Alesund');
    });

    test('getUnicodeNormalizedForms returns canonical NFC, NFD, and stripped representations', () => {
      const forms = getUnicodeNormalizedForms('Caldeirão');
      expect(forms.original).toBe('Caldeirão');
      expect(forms.originalLower).toBe('caldeirão');
      expect(forms.diacriticStripped).toBe('Caldeirao');
      expect(forms.diacriticStrippedLower).toBe('caldeirao');
    });

    test('areEntitiesMatchingWithDiacritics matches accented and unaccented equivalents', () => {
      expect(areEntitiesMatchingWithDiacritics('caldeirão', 'Caldeirão')).toBe(true);
      expect(areEntitiesMatchingWithDiacritics('caldeirao', 'Caldeirão')).toBe(true);
      expect(areEntitiesMatchingWithDiacritics('São Paulo', 'sao paulo')).toBe(true);
      expect(areEntitiesMatchingWithDiacritics('München', 'Munchen')).toBe(true);
      expect(areEntitiesMatchingWithDiacritics('Zürich', 'Zurich')).toBe(true);
      expect(areEntitiesMatchingWithDiacritics('Québec', 'quebec')).toBe(true);
      expect(areEntitiesMatchingWithDiacritics('Niño', 'nino')).toBe(true);
      expect(areEntitiesMatchingWithDiacritics('Different Place', 'Caldeirão')).toBe(false);
    });
  });

  describe('2. Token Extraction with Diacritics', () => {
    test('extractDistinctiveEntityTokens preserves whole words when removing accents', () => {
      const tokensWithAccent = extractDistinctiveEntityTokens('caldeirão');
      expect(tokensWithAccent).toContain('caldeirao');
      expect(tokensWithAccent).not.toContain('caldeir');

      const tokensSaoPaulo = extractDistinctiveEntityTokens('São Paulo');
      expect(tokensSaoPaulo).toContain('sao');
      expect(tokensSaoPaulo).toContain('paulo');
    });
  });

  describe('3. Entity Identity Validation with Diacritics', () => {
    test('validates identity match between requested query and candidate with diacritics', () => {
      const result1 = validateEntityIdentity('caldeirão', 'Caldeirão', {
        rawQuery: 'caldeirão',
        intent: 'NATURAL_LOCATION',
        candidateEntityType: 'natural_feature'
      });
      expect(result1.matches).toBe(true);
      expect(result1.rejectionReason).toBe('NONE');

      const result2 = validateEntityIdentity('caldeirao', 'Caldeirão', {
        rawQuery: 'caldeirao',
        intent: 'NATURAL_LOCATION',
        candidateEntityType: 'natural_feature'
      });
      expect(result2.matches).toBe(true);
      expect(result2.rejectionReason).toBe('NONE');

      const result3 = validateEntityIdentity('München', 'Munchen', {
        rawQuery: 'München',
        intent: 'SINGLE_LOCATION',
        candidateEntityType: 'city'
      });
      expect(result3.matches).toBe(true);
      expect(result3.rejectionReason).toBe('NONE');
    });
  });

  describe('4. Historical Event Scope vs Natural Location / Feature Intent Routing', () => {
    test('NATURAL_LOCATION intent is not blocked by non-point historical event guards', async () => {
      const nonPointCheck = determineHistoricalEventScope('Great Depression', 'Where did the Great Depression take place?');
      expect(nonPointCheck.singleLocation).toBe(false);

      // Verify that recoverCoordinatesFromAi does not treat NATURAL_LOCATION as a non-point historical event
      // Caldeirão is not rejected at the scope guard level
      const promise = recoverCoordinatesFromAi('caldeirão', 'NATURAL_LOCATION', 'Caldeirão');
      await expect(promise).resolves.not.toThrow();
    });
  });

  describe('5. Canonical Casing and Display Preservation', () => {
    test('toCanonicalTitleCase preserves accented characters correctly', () => {
      const canonical = toCanonicalTitleCase('caldeirão');
      expect(canonical).toBe('Caldeirão');

      const canonicalSao = toCanonicalTitleCase('são paulo');
      expect(canonicalSao).toBe('São Paulo');
    });
  });

  describe('6. Search Pipeline with Diacritics', () => {
    test('search pipeline preserves entity identity and structure for diacritic queries', async () => {
      const result = await runSearchPipeline({ rawQuery: 'São Paulo' });
      expect(result.mode).toBe('location');
      if (result.isValid) {
        expect((result as any).finalData.name).toMatch(/São Paulo/i);
      }
    });
  });

});
