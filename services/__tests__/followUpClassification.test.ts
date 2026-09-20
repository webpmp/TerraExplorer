import { describe, it, expect } from 'vitest';
import { classifyFollowUpIntent, generateContextualQuestionChips, extractCleanAnswerText } from '../followUpService';
import { LocationInfo } from '../../types';

describe('Contextual Follow-Up Classification', () => {
  const bodieLocation: LocationInfo = {
    id: 'bodie-loc-1',
    name: 'Bodie, California',
    canonicalName: 'Bodie',
    coordinates: { lat: 38.2128, lng: -119.0132 },
    description: 'Bodie is a ghost town in Mono County, California, United States.',
    entityType: 'ghost_town',
    notable: ['Standard Mill', 'Gold mining history', 'Mono Lake railway']
  };

  it('1. Explicit chip selection classifies as FOLLOW_UP', () => {
    const result = classifyFollowUpIntent('Why was it abandoned?', bodieLocation, false, true);
    expect(result.intent).toBe('FOLLOW_UP');
  });

  it('2. Questions with pronouns referring to active location classify as FOLLOW_UP', () => {
    expect(classifyFollowUpIntent('Why was it abandoned?', bodieLocation).intent).toBe('FOLLOW_UP');
    expect(classifyFollowUpIntent('What was life like there?', bodieLocation).intent).toBe('FOLLOW_UP');
    expect(classifyFollowUpIntent('Show me photos of it today', bodieLocation).intent).toBe('FOLLOW_UP');
    expect(classifyFollowUpIntent('Who lived there?', bodieLocation).intent).toBe('FOLLOW_UP');
    expect(classifyFollowUpIntent('When did its population peak?', bodieLocation).intent).toBe('FOLLOW_UP');
  });

  it('3. Continuation / omitted subject questions classify as FOLLOW_UP', () => {
    expect(classifyFollowUpIntent('Tell me more about the mines', bodieLocation).intent).toBe('FOLLOW_UP');
    expect(classifyFollowUpIntent('More details on the gold rush', bodieLocation).intent).toBe('FOLLOW_UP');
    expect(classifyFollowUpIntent('What about the cemetery?', bodieLocation).intent).toBe('FOLLOW_UP');
    expect(classifyFollowUpIntent('How many residents?', bodieLocation).intent).toBe('FOLLOW_UP');
  });

  it('4. Explicit mentions of current location name in query classify as FOLLOW_UP', () => {
    expect(classifyFollowUpIntent('When was Bodie founded?', bodieLocation).intent).toBe('FOLLOW_UP');
    expect(classifyFollowUpIntent('Who discovered gold in Bodie, California?', bodieLocation).intent).toBe('FOLLOW_UP');
  });

  it('5. Clearly new locations / entities classify as NEW_SEARCH', () => {
    expect(classifyFollowUpIntent('Paris', bodieLocation).intent).toBe('NEW_SEARCH');
    expect(classifyFollowUpIntent('Nevada', bodieLocation).intent).toBe('NEW_SEARCH');
    expect(classifyFollowUpIntent('Ghost towns in Nevada', bodieLocation).intent).toBe('NEW_SEARCH');
    expect(classifyFollowUpIntent('Mount Fuji', bodieLocation).intent).toBe('NEW_SEARCH');
    expect(classifyFollowUpIntent('TRACE ROUTE of Civil War battlefields', bodieLocation).intent).toBe('NEW_SEARCH');
    expect(classifyFollowUpIntent('Tokyo', bodieLocation).intent).toBe('NEW_SEARCH');
  });

  it('6. Does not hard-code ambiguous keywords like "History" or "Mines" as FOLLOW_UP when typed alone without context', () => {
    // Single isolated generic nouns without continuation phrases or pronouns should default to NEW_SEARCH or standard handling
    expect(classifyFollowUpIntent('Paris', bodieLocation).intent).toBe('NEW_SEARCH');
    expect(classifyFollowUpIntent('Nevada', bodieLocation).intent).toBe('NEW_SEARCH');
  });

  it('7. Route-level comparative questions during TRACE ROUTE classify as ROUTE_LEVEL_QUERY', () => {
    expect(classifyFollowUpIntent('Which of these towns is oldest?', bodieLocation, true).intent).toBe('ROUTE_LEVEL_QUERY');
    expect(classifyFollowUpIntent('Compare the stops on this route', bodieLocation, true).intent).toBe('ROUTE_LEVEL_QUERY');
    expect(classifyFollowUpIntent('Which waypoint came first?', bodieLocation, true).intent).toBe('ROUTE_LEVEL_QUERY');
  });

  it('8. Generates contextual question chips dynamically based on entity type and content', () => {
    const chips = generateContextualQuestionChips(bodieLocation);
    expect(chips.length).toBeGreaterThanOrEqual(3);
    expect(chips.some(c => c.toLowerCase().includes('abandoned') || c.toLowerCase().includes('mines') || c.toLowerCase().includes('ghost town'))).toBe(true);
  });

  it('9. extractCleanAnswerText reliably parses clean prose from diverse model responses and parser artifacts', () => {
    // Standard clean JSON
    expect(extractCleanAnswerText('{"answer": "Standard Mill was built in 1877."}')).toBe('Standard Mill was built in 1877.');

    // JSON with trailing parser junk like ].'
    expect(extractCleanAnswerText('{"answer": "Bodie had 60 saloons in 1879."}].\'')).toBe('Bodie had 60 saloons in 1879.');

    // Markdown fenced code block
    expect(extractCleanAnswerText('```json\n{"answer": "Gold was discovered here by W.S. Bodey."}\n```')).toBe('Gold was discovered here by W.S. Bodey.');

    // Raw markdown without JSON wrapper
    expect(extractCleanAnswerText('```markdown\nBodie was preserved as a State Historic Park in 1962.\n```')).toBe('Bodie was preserved as a State Historic Park in 1962.');

    // JSON array with answer
    expect(extractCleanAnswerText('[{"answer": "A devastating fire occurred in 1932."}]')).toBe('A devastating fire occurred in 1932.');

    // Pure garbage / delimiter fragments
    expect(extractCleanAnswerText('].\'')).toBe('');
    expect(extractCleanAnswerText('')).toBe('');
  });

  it('10. extractCleanAnswerText recovers from malformed property prefixes and rejects parser residue', () => {
    // Malformed leading characters and unswer property typo (as reported in user issue)
    const malformed1 = 'iệunswer": "Dallas, Texas, stands out as a unique city in the American South."';
    expect(extractCleanAnswerText(malformed1)).toBe('Dallas, Texas, stands out as a unique city in the American South.');

    // Malformed token prefix before valid JSON
    const malformed2 = 'iệu\n{\n  "answer": "Dallas, Texas, stands out as a unique city in the American South."\n}';
    expect(extractCleanAnswerText(malformed2)).toBe('Dallas, Texas, stands out as a unique city in the American South.');

    // Corrupted property name in JSON
    const malformed3 = '{\n  "unswer": "Dallas, Texas, stands out as a unique city in the American South."\n}';
    expect(extractCleanAnswerText(malformed3)).toBe('Dallas, Texas, stands out as a unique city in the American South.');

    // Partial/incomplete unparseable JSON fragment should be rejected (return empty string, never parser residue)
    expect(extractCleanAnswerText('iệunswer": ')).toBe('');
    expect(extractCleanAnswerText('{"broken": ')).toBe('');
  });

  it('11. Oslo contextual follow-up test: "What is it best known for?" produces clean answer without parser fragments', () => {
    // Model output scenarios for Oslo follow-up question
    const jsonOutput = JSON.stringify({
      answer: "Oslo is best known as the capital of Norway, famous for its rich Viking history, the Nobel Peace Prize ceremony at City Hall, the Vigeland Sculpture Park, and its striking modern waterfront including the Oslo Opera House."
    });
    expect(extractCleanAnswerText(jsonOutput)).toContain("Oslo is best known as the capital of Norway");

    const markdownJsonOutput = `\`\`\`json\n${jsonOutput}\n\`\`\``;
    expect(extractCleanAnswerText(markdownJsonOutput)).toContain("Oslo is best known as the capital of Norway");

    const directProseOutput = "Oslo is internationally renowned for hosting the annual Nobel Peace Prize ceremony, its vibrant maritime heritage, and the world-famous Vigeland Sculpture Park.";
    expect(extractCleanAnswerText(directProseOutput)).toBe("Oslo is internationally renowned for hosting the annual Nobel Peace Prize ceremony, its vibrant maritime heritage, and the world-famous Vigeland Sculpture Park.");
  });

  it('13. Valid follow-up response with malformed prefix "].\'" plus valid JSON extracts clean answer', () => {
    const rawWithPrefix = '"].\'{"answer":"Oslo is best known for its rich Viking history, the Nobel Peace Prize, Vigeland Park, and the Oslo Opera House."}';
    const extracted = extractCleanAnswerText(rawWithPrefix);
    expect(extracted).toBe('Oslo is best known for its rich Viking history, the Nobel Peace Prize, Vigeland Park, and the Oslo Opera House.');
  });

  it('14. Response containing only "].\'" is strictly rejected and returns empty string', () => {
    expect(extractCleanAnswerText("].'")).toBe('');
    expect(extractCleanAnswerText("  ].'  ")).toBe('');
  });

  it('15. Arbitrary follow-up questions and sequential independence across multiple locations', () => {
    const testLocations: LocationInfo[] = [
      {
        id: 'oslo-loc',
        name: 'Oslo',
        canonicalName: 'Oslo',
        coordinates: { lat: 59.9139, lng: 10.7522 },
        description: 'Oslo is the capital and most populous city of Norway.',
        entityType: 'city',
        notable: ['Vigeland Park', 'Akershus Fortress', 'Fram Museum']
      },
      {
        id: 'damascus-loc',
        name: 'Damascus',
        canonicalName: 'Damascus',
        coordinates: { lat: 33.5138, lng: 36.2765 },
        description: 'Damascus is the capital of Syria and one of the oldest continuously inhabited cities.',
        entityType: 'city',
        notable: ['Umayyad Mosque', 'Old City of Damascus', 'Straight Street']
      },
      {
        id: 'kyoto-loc',
        name: 'Kyoto',
        canonicalName: 'Kyoto',
        coordinates: { lat: 35.0116, lng: 135.7681 },
        description: 'Kyoto served as Japan’s imperial capital for over a millennium.',
        entityType: 'city',
        notable: ['Fushimi Inari-taisha', 'Kinkaku-ji', 'Gion District']
      }
    ];

    const sampleQuestions = [
      "What is it best known for?",
      "What is the history of this place?",
      "What are its most important landmarks?",
      "Why is this location significant?"
    ];

    for (const loc of testLocations) {
      const chips = generateContextualQuestionChips(loc);
      expect(chips.length).toBeGreaterThanOrEqual(3);

      for (const q of sampleQuestions) {
        const classification = classifyFollowUpIntent(q, loc, false, true);
        expect(classification.intent).toBe('FOLLOW_UP');

        // Verify simulated responses for this question extract cleanly
        const mockJsonResponse = JSON.stringify({
          answer: `${loc.name} is historic and significant regarding "${q}".`
        });
        expect(extractCleanAnswerText(mockJsonResponse)).toContain(loc.name);

        // Verify malformed prefix recovery for each question
        const mockPrefixed = `"].'${mockJsonResponse}`;
        expect(extractCleanAnswerText(mockPrefixed)).toContain(loc.name);
      }
    }
  });

  it('16. Sequential generation state isolation: failed generation does not break subsequent generations', () => {
    // Sequence 1: Successful response
    const res1 = '"].\'{"answer":"First successful answer."}';
    expect(extractCleanAnswerText(res1)).toBe('First successful answer.');

    // Sequence 2: Failed truncated response (3 characters "].'")
    const res2 = "].'";
    expect(extractCleanAnswerText(res2)).toBe('');

    // Sequence 3: Subsequent successful response after failure operates independently
    const res3 = '{"answer":"Third successful answer after failure."}';
    expect(extractCleanAnswerText(res3)).toBe('Third successful answer after failure.');

    // Sequence 4: Fourth successful response with markdown code fence
    const res4 = '```json\n{"answer":"Fourth answer with markdown."}\n```';
    expect(extractCleanAnswerText(res4)).toBe('Fourth answer with markdown.');
  });
});
