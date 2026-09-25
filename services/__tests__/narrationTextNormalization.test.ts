import { describe, it, expect } from 'vitest';
import {
  normalizeNarrationText,
  formatYearToSpeech,
  formatNumber0to99
} from '../../utils/narrationTextNormalization';

describe('Narration Text Normalization Utility', () => {
  describe('World War Terminology Normalization', () => {
    it('normalizes World War I to World War One', () => {
      expect(normalizeNarrationText('World War I')).toBe('World War One');
    });

    it('normalizes World War II to World War Two', () => {
      expect(normalizeNarrationText('World War II')).toBe('World War Two');
    });

    it('preserves surrounding punctuation and prose with World War I and II', () => {
      const input1 = 'During World War I, the ship was requisitioned.';
      const output1 = normalizeNarrationText(input1);
      expect(output1).toBe('During World War One, the ship was requisitioned.');

      const input2 = 'The site was important during World War II.';
      const output2 = normalizeNarrationText(input2);
      expect(output2).toBe('The site was important during World War Two.');
    });

    it('handles multiple occurrences of World War terms in a single passage', () => {
      const input = 'It served during World War I and later in World War II with distinction.';
      const expected = 'It served during World War One and later in World War Two with distinction.';
      expect(normalizeNarrationText(input)).toBe(expected);
    });

    it('leaves unrelated Roman numerals unchanged', () => {
      expect(normalizeNarrationText('King Henry VIII reigned over England.')).toBe('King Henry VIII reigned over England.');
      expect(normalizeNarrationText('Read Chapter I and Section II before continuing.')).toBe('Read Chapter I and Section II before continuing.');
      expect(normalizeNarrationText('Pope John Paul II visited in 1979.')).toBe('Pope John Paul II visited in 1979.');
      expect(normalizeNarrationText('Louis XIV built Versailles.')).toBe('Louis XIV built Versailles.');
    });
  });

  describe('Calendar Date Normalization', () => {
    it('normalizes historical dates with Month Day, Year format', () => {
      expect(normalizeNarrationText('December 5, 1914')).toBe('December fifth, nineteen fourteen');
      expect(normalizeNarrationText('June 28, 1914')).toBe('June twenty-eighth, nineteen fourteen');
      expect(normalizeNarrationText('July 4, 1776')).toBe('July fourth, seventeen seventy-six');
      expect(normalizeNarrationText('April 15, 1865')).toBe('April fifteenth, eighteen sixty-five');
      expect(normalizeNarrationText('October 14, 1066')).toBe('October fourteenth, ten sixty-six');
      expect(normalizeNarrationText('January 1, 2000')).toBe('January first, two thousand');
      expect(normalizeNarrationText('August 12, 2024')).toBe('August twelfth, twenty twenty-four');
    });

    it('normalizes dates with ordinal suffixes (st, nd, rd, th)', () => {
      expect(normalizeNarrationText('December 5th, 1914')).toBe('December fifth, nineteen fourteen');
      expect(normalizeNarrationText('June 28th, 1914')).toBe('June twenty-eighth, nineteen fourteen');
      expect(normalizeNarrationText('July 21st, 1969')).toBe('July twenty-first, nineteen sixty-nine');
      expect(normalizeNarrationText('November 22nd, 1963')).toBe('November twenty-second, nineteen sixty-three');
      expect(normalizeNarrationText('March 23rd, 1933')).toBe('March twenty-third, nineteen thirty-three');
    });

    it('normalizes all representative day ordinal edge cases', () => {
      expect(normalizeNarrationText('January 1')).toBe('January first');
      expect(normalizeNarrationText('February 2')).toBe('February second');
      expect(normalizeNarrationText('March 3')).toBe('March third');
      expect(normalizeNarrationText('April 4')).toBe('April fourth');
      expect(normalizeNarrationText('May 5')).toBe('May fifth');
      expect(normalizeNarrationText('June 6')).toBe('June sixth');
      expect(normalizeNarrationText('July 7')).toBe('July seventh');
      expect(normalizeNarrationText('August 8')).toBe('August eighth');
      expect(normalizeNarrationText('September 9')).toBe('September ninth');
      expect(normalizeNarrationText('October 10')).toBe('October tenth');
      expect(normalizeNarrationText('November 11')).toBe('November eleventh');
      expect(normalizeNarrationText('December 12')).toBe('December twelfth');
      expect(normalizeNarrationText('January 13')).toBe('January thirteenth');
      expect(normalizeNarrationText('February 14')).toBe('February fourteenth');
      expect(normalizeNarrationText('March 15')).toBe('March fifteenth');
      expect(normalizeNarrationText('April 16')).toBe('April sixteenth');
      expect(normalizeNarrationText('May 17')).toBe('May seventeenth');
      expect(normalizeNarrationText('June 18')).toBe('June eighteenth');
      expect(normalizeNarrationText('July 19')).toBe('July nineteenth');
      expect(normalizeNarrationText('August 20')).toBe('August twentieth');
      expect(normalizeNarrationText('May 21')).toBe('May twenty-first');
      expect(normalizeNarrationText('June 22')).toBe('June twenty-second');
      expect(normalizeNarrationText('July 23')).toBe('July twenty-third');
      expect(normalizeNarrationText('August 24')).toBe('August twenty-fourth');
      expect(normalizeNarrationText('September 25')).toBe('September twenty-fifth');
      expect(normalizeNarrationText('October 26')).toBe('October twenty-sixth');
      expect(normalizeNarrationText('November 27')).toBe('November twenty-seventh');
      expect(normalizeNarrationText('December 28')).toBe('December twenty-eighth');
      expect(normalizeNarrationText('January 29')).toBe('January twenty-ninth');
      expect(normalizeNarrationText('August 30')).toBe('August thirtieth');
      expect(normalizeNarrationText('December 31')).toBe('December thirty-first');
    });

    it('preserves sentence structure and punctuation surrounding dates', () => {
      const input = 'The battle began on December 5, 1914, near the coast.';
      const output = normalizeNarrationText(input);
      expect(output).toBe('The battle began on December fifth, nineteen fourteen, near the coast.');
    });

    it('does not rewrite standalone numbers that are not part of dates', () => {
      expect(normalizeNarrationText('The mountain rises 1914 meters above sea level.')).toBe('The mountain rises 1914 meters above sea level.');
      expect(normalizeNarrationText('There were 500 passengers aboard ship 402.')).toBe('There were 500 passengers aboard ship 402.');
      expect(normalizeNarrationText('Located along Route 66 in 1984.')).toBe('Located along Route 66 in 1984.');
      expect(normalizeNarrationText('Coordinates: 45.1234, -122.5678')).toBe('Coordinates: 45.1234, -122.5678');
      expect(normalizeNarrationText('January 45 is not a valid date.')).toBe('January 45 is not a valid date.');
    });

    it('normalizes abbreviated month calendar dates', () => {
      expect(normalizeNarrationText('Dec. 5, 1914')).toBe('December fifth, nineteen fourteen');
      expect(normalizeNarrationText('Dec 5, 1914')).toBe('December fifth, nineteen fourteen');
      expect(normalizeNarrationText('Jan 1, 2020')).toBe('January first, twenty twenty');
    });
  });

  describe('Year to Spoken Words Formatting Helper', () => {
    it('formats various historical centuries and years correctly', () => {
      expect(formatYearToSpeech(1914)).toBe('nineteen fourteen');
      expect(formatYearToSpeech(1900)).toBe('nineteen hundred');
      expect(formatYearToSpeech(1905)).toBe('nineteen oh five');
      expect(formatYearToSpeech(1865)).toBe('eighteen sixty-five');
      expect(formatYearToSpeech(1776)).toBe('seventeen seventy-six');
      expect(formatYearToSpeech(1492)).toBe('fourteen ninety-two');
      expect(formatYearToSpeech(1066)).toBe('ten sixty-six');
      expect(formatYearToSpeech(1000)).toBe('one thousand');
      expect(formatYearToSpeech(2000)).toBe('two thousand');
      expect(formatYearToSpeech(2005)).toBe('two thousand five');
      expect(formatYearToSpeech(2010)).toBe('twenty ten');
      expect(formatYearToSpeech(2024)).toBe('twenty twenty-four');
      expect(formatYearToSpeech(793)).toBe('seven ninety-three');
      expect(formatYearToSpeech(800)).toBe('eight hundred');
      expect(formatYearToSpeech(44)).toBe('forty-four');
    });
  });

  describe('Combined and Real-World Narration Examples', () => {
    it('normalizes complex historical narrative containing both World War terms and dates', () => {
      const input = 'During World War I, on December 5, 1914, the expedition set sail. Later, in World War II, the port was heavily fortified.';
      const output = normalizeNarrationText(input);
      expect(output).toBe('During World War One, on December fifth, nineteen fourteen, the expedition set sail. Later, in World War Two, the port was heavily fortified.');
    });

    it('preserves the original input string immutably without side effects', () => {
      const original = 'During World War I, on December 5, 1914, the battle began.';
      const originalCopy = original;
      const result = normalizeNarrationText(original);

      expect(original).toBe(originalCopy);
      expect(result).toBe('During World War One, on December fifth, nineteen fourteen, the battle began.');
      expect(result).not.toBe(original);
    });

    it('is safe for repeated calls (idempotent output)', () => {
      const text = 'On June 28, 1914, World War I commenced.';
      const firstPass = normalizeNarrationText(text);
      const secondPass = normalizeNarrationText(firstPass);

      expect(firstPass).toBe('On June twenty-eighth, nineteen fourteen, World War One commenced.');
      expect(secondPass).toBe(firstPass);
    });

    it('handles empty and nullish inputs gracefully', () => {
      expect(normalizeNarrationText('')).toBe('');
      expect(normalizeNarrationText(null as any)).toBe('');
      expect(normalizeNarrationText(undefined as any)).toBe('');
    });
  });
});
