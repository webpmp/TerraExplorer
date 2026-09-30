import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runSearchPipeline } from '../pipeline';
import {
  evaluateEnrichmentCompleteness,
  logEnrichmentCompleteness,
  hasCodeOrUiArtifacts,
  isUnsupportedMajorEventHostClaim,
  extractDescriptionText,
  validateResolvedEntity
} from '../entityValidation';
import * as geminiService from '../geminiService';
import * as geographicResolver from '../geographic/geographicResolver';
import { fetchWikipediaLeadExtract } from '../geographic/geographicResolver';
import {
  deriveEntityAliases,
  classifyImageEvidence,
  validateImageCandidate,
  resolveImageIntent,
  ImageCandidate
} from '../imageService';

const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: vi.fn((key: string) => storageMap.get(key) || null),
  setItem: vi.fn((key: string, value: string) => { storageMap.set(key, value); }),
  removeItem: vi.fn((key: string) => { storageMap.delete(key); }),
  clear: vi.fn(() => { storageMap.clear(); }),
  key: vi.fn(() => null),
  length: 0
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true
});

describe('Landmark Enrichment Completeness, Metadata Recovery, and Image Relationship Regression', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    storageMap.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    storageMap.clear();
  });

  describe('A. Partial Deterministic Landmark Enrichment', () => {
    it('evaluates status as PARTIAL and triggers metadata recovery when notable and contextNotes are empty', async () => {
      const partialData = {
        name: 'Pyramids of Giza',
        canonicalName: 'Pyramids of Giza',
        entityType: 'archaeological_site',
        description: 'The Pyramids of Giza are an ancient Egyptian necropolis complex comprising three major pyramid structures.',
        climate: {
          name: 'Hot Desert Climate (BWh)',
          koppenCode: 'BWh',
          description: 'Hot desert climate with minimal precipitation.'
        },
        notable: [],
        contextNotes: [],
        news: []
      };

      const completeness = evaluateEnrichmentCompleteness(partialData, 'Pyramids of Giza', 'archaeological_site');

      expect(completeness.status).toBe('PARTIAL');
      expect(completeness.recoveryRequired).toBe(true);
      expect(completeness.missingFields).toContain('notable');
      expect(completeness.missingFields).toContain('contextNotes');
      expect(completeness.newsStatus).toBe('optional/empty');

      // Test recovery behavior in pipeline
      const recoverSpy = vi.spyOn(geminiService, 'recoverLocationMetadata').mockResolvedValue({
        description: 'The Pyramids of Giza are iconic ancient monuments situated on the Giza Plateau.',
        notable: [
          { name: 'Great Pyramid of Khufu', significance: 'Oldest and largest of the Giza pyramids.' }
        ],
        contextNotes: [
          'Constructed during the Fourth Dynasty of the Old Kingdom of Egypt.'
        ],
        climate: {
          name: 'Hot Desert Climate (BWh)',
          koppenCode: 'BWh',
          description: 'Hot desert climate with minimal precipitation.'
        }
      });

      const result = await runSearchPipeline({
        rawQuery: 'Pyramids of Giza'
      });

      expect(result.isValid).toBe(true);
      expect(recoverSpy).toHaveBeenCalled();
      expect(result.entity?.metadata.notable?.length).toBeGreaterThan(0);
      expect(result.entity?.metadata.contextNotes?.length).toBeGreaterThan(0);
      expect(result.entity?.subject.primaryLocation.coordinateSource).toBe('deterministic');
    });
  });

  describe('B. Complete Enrichment', () => {
    it('evaluates status as COMPLETE and does NOT trigger metadata recovery when all core fields are populated, even if news is empty', async () => {
      const completeData = {
        name: 'Pyramids of Giza',
        canonicalName: 'Pyramids of Giza',
        entityType: 'archaeological_site',
        coordinates: { lat: 29.9792, lng: 31.1342 },
        country: 'Egypt',
        state: 'Giza Governorate',
        city: 'Giza',
        description: 'The Pyramids of Giza are an ancient Egyptian necropolis complex comprising three major pyramid structures.',
        climate: {
          name: 'Hot Desert Climate (BWh)',
          koppenCode: 'BWh',
          description: 'Hot desert climate with minimal precipitation.'
        },
        notable: [
          { name: 'Great Pyramid of Khufu', significance: 'Oldest and largest of the Giza pyramids.' }
        ],
        contextNotes: [
          'Constructed during the Fourth Dynasty of the Old Kingdom of Egypt.'
        ],
        news: []
      };

      const completeness = evaluateEnrichmentCompleteness(completeData, 'Pyramids of Giza', 'archaeological_site');

      expect(completeness.status).toBe('COMPLETE');
      expect(completeness.recoveryRequired).toBe(false);
      expect(completeness.missingFields.length).toBe(0);
      expect(completeness.newsStatus).toBe('optional/empty');

      // Test in pipeline: mock resolveLocationQuery to return complete data
      vi.spyOn(geminiService, 'resolveLocationQuery').mockResolvedValue({
        locationInfo: completeData as any,
        suggestedZoom: 10,
        aiUsed: false
      });

      const recoverSpy = vi.spyOn(geminiService, 'recoverLocationMetadata');

      const result = await runSearchPipeline({
        rawQuery: 'Pyramids of Giza'
      });

      expect(result.isValid).toBe(true);
      expect(recoverSpy).not.toHaveBeenCalled();
      expect(result.entity?.metadata.notable?.length).toBe(1);
      expect(result.entity?.metadata.contextNotes?.length).toBe(1);
    });
  });

  describe('C. Natural-Language End-to-End Regression', () => {
    it('resolves "where are the pyramids of gaza?" to deterministic Pyramids of Giza with substantive enrichment and NO AI coordinate resolution', async () => {
      const aiCoordinateRecoverySpy = vi.spyOn(geminiService, 'recoverCoordinatesFromAi');
      const recoverMetadataSpy = vi.spyOn(geminiService, 'recoverLocationMetadata').mockResolvedValue({
        description: 'The Pyramids of Giza stand on the Giza Plateau on the outskirts of Cairo, Egypt, as the most famous monumental tombs of ancient Egyptian civilization.',
        notable: [
          { name: 'Great Pyramid of Khufu', significance: 'The only surviving wonder of the ancient world.' },
          { name: 'Pyramid of Khafre', significance: 'Second-tallest pyramid retaining its original polished casing stones at the apex.' }
        ],
        contextNotes: [
          'Built during Egypt\'s Fourth Dynasty (c. 2575–c. 2465 BCE).',
          'Adjacent to the Great Sphinx and associated mortuary temples.'
        ],
        climate: {
          name: 'Hot Desert Climate (BWh)',
          koppenCode: 'BWh',
          description: 'Hot desert climate with minimal precipitation.'
        }
      });

      const result = await runSearchPipeline({
        rawQuery: 'where are the pyramids of gaza?'
      });

      expect(result.isValid).toBe(true);
      expect(result.entity).toBeDefined();

      // Canonical name & deterministic coordinates
      expect(result.entity?.subject.identity.canonicalName).toMatch(/Pyramids of Giza/i);
      expect(result.entity?.subject.primaryLocation.location.coordinates.lat).toBeCloseTo(29.9792, 3);
      expect(result.entity?.subject.primaryLocation.location.coordinates.lng).toBeCloseTo(31.1342, 3);
      expect(result.entity?.subject.primaryLocation.coordinateSource).toBe('deterministic');
      expect(result.entity?.subject.primaryLocation.identityStatus).toBe('verified');
      expect(result.entity?.subject.identity.entityType).toBe('archaeological_site');

      // Substantive enrichment
      expect(result.entity?.metadata.description).toBeTruthy();
      expect(result.entity?.metadata.description?.length).toBeGreaterThan(30);
      expect(result.entity?.metadata.notable?.length).toBeGreaterThan(0);
      expect(result.entity?.metadata.contextNotes?.length).toBeGreaterThan(0);

      // AI coordinate resolution must NOT have been called
      expect(aiCoordinateRecoverySpy).not.toHaveBeenCalled();
    });
  });

  describe('D. Image Identity and Relationship Regression', () => {
    const entity = {
      name: 'Pyramids of Giza',
      canonicalName: 'Pyramids of Giza',
      entityType: 'archaeological_site',
      aliases: ['pyramids of gaza'],
      country: 'Egypt'
    };

    it('classifies "Pyramids of Gaza" as an ALIAS of Pyramids of Giza', () => {
      const candidate: ImageCandidate = {
        url: 'https://images.example.com/pyramids-gaza.jpg',
        title: 'Pyramids of Gaza',
        description: 'Ancient pyramids at the Giza Plateau'
      };

      const evidence = classifyImageEvidence(candidate, entity);
      expect(evidence.entityMatchLevel).toBe('ALIAS');
      expect(evidence.evidenceType).toBe('KNOWN_ALIAS');
    });

    it('does NOT classify Great Sphinx of Giza as an alias, but as COMPONENT', () => {
      const candidate: ImageCandidate = {
        url: 'https://images.example.com/sphinx.jpg',
        title: 'Great Sphinx of Giza',
        description: 'Limestone statue of a reclining sphinx at the Giza Plateau'
      };

      const evidence = classifyImageEvidence(candidate, entity);
      expect(evidence.entityMatchLevel).toBe('COMPONENT');
      expect(evidence.entityMatchLevel).not.toBe('ALIAS');
      expect(evidence.evidenceType).toBe('COMPONENT');
      expect(evidence.evidenceType).not.toBe('KNOWN_ALIAS');
    });

    it('does NOT classify Pyramid of Khafre as an alias, but as COMPONENT', () => {
      const candidate: ImageCandidate = {
        url: 'https://images.example.com/khafre.jpg',
        title: 'Pyramid of Khafre',
        description: 'Second-tallest pyramid of the Giza pyramid complex'
      };

      const evidence = classifyImageEvidence(candidate, entity);
      expect(evidence.entityMatchLevel).toBe('COMPONENT');
      expect(evidence.entityMatchLevel).not.toBe('ALIAS');
      expect(evidence.evidenceType).toBe('COMPONENT');
      expect(evidence.evidenceType).not.toBe('KNOWN_ALIAS');
    });

    it('does NOT classify Pyramid of Menkaure as an alias, but as COMPONENT', () => {
      const candidate: ImageCandidate = {
        url: 'https://images.example.com/menkaure.jpg',
        title: 'Pyramid of Menkaure',
        description: 'Smallest of the three main pyramids at the Giza complex'
      };

      const evidence = classifyImageEvidence(candidate, entity);
      expect(evidence.entityMatchLevel).toBe('COMPONENT');
      expect(evidence.entityMatchLevel).not.toBe('ALIAS');
      expect(evidence.evidenceType).toBe('COMPONENT');
      expect(evidence.evidenceType).not.toBe('KNOWN_ALIAS');
    });

    it('accepts COMPONENT candidates as Tier 2 supporting gallery images under LANDMARK_ENTITY policy without falsely labeling them as alias matches', () => {
      const landmarkIntent = resolveImageIntent(entity);
      expect(landmarkIntent.policy).toBe('LANDMARK_ENTITY');

      const sphinxCandidate: ImageCandidate = {
        url: 'https://images.example.com/sphinx.jpg',
        title: 'Great Sphinx of Giza',
        description: 'Limestone statue of a reclining sphinx at the Giza Plateau',
        coordinates: { lat: 29.9753, lng: 31.1376 }
      };

      const validation = validateImageCandidate(sphinxCandidate, entity, landmarkIntent);
      expect(validation.decision).toBe('ACCEPT');
      expect(validation.tier).toBe(2);
      expect(validation.reason).toBe('COMPONENT_LANDMARK_MATCH');
    });
  });

  describe('E. Structured Description Formats & Recovery Completeness Regression', () => {
    const baseCompleteData = {
      name: 'Plymouth',
      canonicalName: 'Plymouth',
      entityType: 'landmark',
      coordinates: { lat: 50.3714, lng: -4.1424 },
      country: 'United Kingdom',
      climate: {
        name: 'Oceanic Climate (Cfb)',
        koppenCode: 'Cfb',
        description: 'Temperate oceanic climate.'
      },
      notable: [
        { title: 'Plymouth Hoe', description: 'Promontory with historic lighthouse Smeaton\'s Tower.' }
      ],
      contextNotes: [
        { text: 'Historic departure port for major maritime expeditions including the Mayflower and Endurance.' }
      ],
      news: []
    };

    it('1. Primitive String: evaluateEnrichmentCompleteness treats substantive primitive string as COMPLETE', () => {
      const data = {
        ...baseCompleteData,
        description: 'Plymouth is a historic port city in Devon, England, renowned for its extensive naval history and maritime heritage.'
      };

      const completeness = evaluateEnrichmentCompleteness(data, 'Plymouth', 'landmark');
      expect(completeness.status).toBe('COMPLETE');
      expect(completeness.recoveryRequired).toBe(false);
      expect(completeness.missingFields).not.toContain('description');
    });

    it('2. Structured Text: evaluateEnrichmentCompleteness treats { text, provenance } as COMPLETE', () => {
      const data = {
        ...baseCompleteData,
        description: {
          text: 'Plymouth is a historic port city and unitary authority in South West England, situated between the mouths of the rivers Plym and Tamar. It has a rich maritime heritage and served as a naval base for centuries.',
          provenance: { provider: 'LMStudio', timestamp: Date.now(), cache: false }
        }
      };

      const completeness = evaluateEnrichmentCompleteness(data, 'Plymouth', 'landmark');
      expect(completeness.status).toBe('COMPLETE');
      expect(completeness.recoveryRequired).toBe(false);
      expect(completeness.missingFields).not.toContain('description');
    });

    it('3. Paragraph Structure: evaluateEnrichmentCompleteness treats { paragraphs: [...] } as COMPLETE', () => {
      const data = {
        ...baseCompleteData,
        description: {
          paragraphs: [
            'Plymouth is a port city and unitary authority in Devon, England.',
            'The city has a long history as a center for naval operations and transatlantic exploration.'
          ],
          provenance: { provider: 'LMStudio', timestamp: Date.now(), cache: false }
        }
      };

      const completeness = evaluateEnrichmentCompleteness(data, 'Plymouth', 'landmark');
      expect(completeness.status).toBe('COMPLETE');
      expect(completeness.recoveryRequired).toBe(false);
      expect(completeness.missingFields).not.toContain('description');
    });

    it('4. Placeholder Enforcement: "Information on Plymouth." is identified as insufficient for both primitive string and structured text', () => {
      const primitivePlaceholderData = {
        ...baseCompleteData,
        description: 'Information on Plymouth.'
      };

      const primCompleteness = evaluateEnrichmentCompleteness(primitivePlaceholderData, 'Plymouth', 'landmark');
      expect(primCompleteness.missingFields).toContain('description');
      expect(primCompleteness.recoveryRequired).toBe(true);

      const structuredPlaceholderData = {
        ...baseCompleteData,
        description: {
          text: 'Information on Plymouth.',
          provenance: { provider: 'fallback', timestamp: Date.now(), cache: false }
        }
      };

      const structCompleteness = evaluateEnrichmentCompleteness(structuredPlaceholderData, 'Plymouth', 'landmark');
      expect(structCompleteness.missingFields).toContain('description');
      expect(structCompleteness.recoveryRequired).toBe(true);
    });

    it('5. Pipeline Recovery Regression: Placeholder description triggers recovery, receives structured { text, provenance }, and passes post-recovery completeness', async () => {
      vi.spyOn(geminiService, 'resolveLocationQuery').mockResolvedValue({
        locationInfo: {
          name: 'Plymouth',
          canonicalName: 'Plymouth',
          entityType: 'landmark',
          coordinates: { lat: 50.3714, lng: -4.1424 },
          country: 'United Kingdom',
          city: 'Plymouth',
          description: 'Information on Plymouth.',
          notable: [],
          contextNotes: [],
          climate: {
            name: 'Oceanic Climate (Cfb)',
            koppenCode: 'Cfb',
            description: 'Temperate oceanic climate.'
          }
        } as any,
        suggestedZoom: 12,
        aiUsed: false
      });

      const recoverSpy = vi.spyOn(geminiService, 'recoverLocationMetadata').mockResolvedValue({
        description: 'Plymouth is a port city located on the south coast of Devon, England. It is famous for its maritime history, including being the departure point for the Pilgrim Fathers in 1620.',
        notable: [
          { name: 'Plymouth Hoe', significance: 'Spacious public park overlooking Plymouth Sound.' }
        ],
        contextNotes: [
          'Major Royal Navy base at HMNB Devonport.'
        ],
        climate: {
          name: 'Oceanic Climate (Cfb)',
          koppenCode: 'Cfb',
          description: 'Temperate oceanic climate.'
        }
      });

      const result = await runSearchPipeline({
        rawQuery: 'plymouth, england'
      });

      expect(result.isValid).toBe(true);
      expect(recoverSpy).toHaveBeenCalled();
      expect(result.entity).toBeDefined();

      const finalDesc = typeof result.entity?.metadata.description === 'string'
        ? result.entity?.metadata.description
        : (result.entity?.metadata.description as any)?.text;

      expect(finalDesc).toContain('Plymouth is a port city');
      expect(finalDesc).not.toBe('Information on Plymouth.');

      const finalEval = evaluateEnrichmentCompleteness(
        result.entity?.metadata,
        result.entity?.subject.identity.canonicalName,
        result.entity?.subject.identity.entityType
      );

      expect(finalEval.status).toBe('COMPLETE');
      expect(finalEval.missingFields).not.toContain('description');
      expect(finalEval.recoveryRequired).toBe(false);
    });
  });

  describe('F. Factual-Quality Safeguards and Code-Token Leakage Prevention', () => {
    describe('1. Code and UI Artifact Detection (hasCodeOrUiArtifacts)', () => {
      it('detects FontAwesome and Lucide icon tokens', () => {
        expect(hasCodeOrUiArtifacts('National Memorial to theFontAwesomeSolidPlaneService HMS Raleigh')).toBe(true);
        expect(hasCodeOrUiArtifacts('Contains a fa-anchor icon next to the harbor.')).toBe(true);
        expect(hasCodeOrUiArtifacts('Rendered using LucideNavigation and lucide-map-pin.')).toBe(true);
        expect(hasCodeOrUiArtifacts('Displays a FontAwesomeCompass badge.')).toBe(true);
      });

      it('detects leaked React, service, and UI component identifiers', () => {
        expect(hasCodeOrUiArtifacts('Uses React.useState to manage local coordinates.')).toBe(true);
        expect(hasCodeOrUiArtifacts('Managed by PlaneService and IconService.')).toBe(true);
        expect(hasCodeOrUiArtifacts('Registered under ComponentService for rendering.')).toBe(true);
        expect(hasCodeOrUiArtifacts('<div className="historic-dock">Millbay Docks</div>')).toBe(true);
        expect(hasCodeOrUiArtifacts('```\nconst x = 1;\n```')).toBe(true);
      });

      it('preserves legitimate historical names, proper nouns, and military designations', () => {
        expect(hasCodeOrUiArtifacts('Smeaton\'s Tower stands prominently on Plymouth Hoe.')).toBe(false);
        expect(hasCodeOrUiArtifacts('HMNB Devonport is the largest naval base in Western Europe.')).toBe(false);
        expect(hasCodeOrUiArtifacts('Ramsay MacDonald served as Prime Minister.')).toBe(false);
        expect(hasCodeOrUiArtifacts('HMS Raleigh is a major Royal Navy training facility.')).toBe(false);
        expect(hasCodeOrUiArtifacts('Designated as a UNESCO World Heritage site.')).toBe(false);
        expect(hasCodeOrUiArtifacts('The Royal Navy Submarine Museum preserves historic vessels.')).toBe(false);
      });
    });

    describe('2. Major International Mega-Event Guardrail (isUnsupportedMajorEventHostClaim)', () => {
      it('rejects unsupported Olympic Games host claims', () => {
        expect(isUnsupportedMajorEventHostClaim(
          'Plymouth hosted the first modern Olympic Games outside of Athens in 1908.',
          'Plymouth',
          'United Kingdom'
        )).toBe(true);
      });

      it('rejects unsupported Commonwealth Games host claims', () => {
        expect(isUnsupportedMajorEventHostClaim(
          'The city hosted the 2024 Commonwealth Games along its waterfront.',
          'Plymouth',
          'United Kingdom'
        )).toBe(true);
      });

      it('rejects unsupported World Expo host claims', () => {
        expect(isUnsupportedMajorEventHostClaim(
          'Plymouth was the host city for the 1900 World Expo.',
          'Plymouth',
          'United Kingdom'
        )).toBe(true);
      });

      it('permits documented, legitimate Olympic, Commonwealth, and Expo hosts', () => {
        expect(isUnsupportedMajorEventHostClaim(
          'London hosted the 1908 and 2012 Olympic Games.',
          'London',
          'United Kingdom'
        )).toBe(false);

        expect(isUnsupportedMajorEventHostClaim(
          'Birmingham hosted the 2022 Commonwealth Games.',
          'Birmingham',
          'United Kingdom'
        )).toBe(false);

        expect(isUnsupportedMajorEventHostClaim(
          'Paris hosted the 1900 World Expo.',
          'Paris',
          'France'
        )).toBe(false);
      });

      it('permits non-mega-event historical statements and expedition departure claims', () => {
        expect(isUnsupportedMajorEventHostClaim(
          'Plymouth served as the departure port for the Mayflower in 1620 and Shackleton\'s Endurance in 1914.',
          'Plymouth',
          'United Kingdom'
        )).toBe(false);
      });
    });

    describe('3. validateResolvedEntity Description Quality Gate', () => {
      it('rejects an entity if the description contains code/UI artifacts', () => {
        const entity: any = {
          subject: {
            identity: { canonicalName: 'Plymouth', entityType: 'landmark', identityStatus: 'verified' },
            primaryLocation: {
              label: 'Plymouth, Devon, England',
              location: { coordinates: { lat: 50.3714, lng: -4.1424 } },
              identityStatus: 'verified'
            }
          },
          metadata: {
            description: 'Plymouth is a naval port city featuring the National Memorial to theFontAwesomeSolidPlaneService HMS Raleigh.',
            climate: { name: 'Oceanic', koppenCode: 'Cfb' }
          }
        };

        expect(validateResolvedEntity(entity)).toBe(false);
      });

      it('accepts an entity with clean, verified educational description', () => {
        const entity: any = {
          subject: {
            identity: { canonicalName: 'Plymouth', entityType: 'landmark', identityStatus: 'verified' },
            primaryLocation: {
              label: 'Plymouth, Devon, England',
              location: { coordinates: { lat: 50.3714, lng: -4.1424 } },
              identityStatus: 'verified'
            }
          },
          metadata: {
            description: 'Plymouth is a historic port city on the south coast of Devon, England, renowned for its maritime heritage and naval base at HMNB Devonport.',
            climate: { name: 'Oceanic', koppenCode: 'Cfb' }
          }
        };

        expect(validateResolvedEntity(entity)).toBe(true);
      });
    });

    describe('4. Metadata Recovery Filtering and Provenance', () => {
      it('filters contaminated items while keeping valid notes and reflects configured LMStudio provider in provenance', async () => {
        localStorage.setItem('terraExplorerSettings', JSON.stringify({
          aiProvider: 'lmstudio',
          lmStudioUrl: 'http://localhost:1234/v1',
          lmStudioModel: 'local-model'
        }));

        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    name: 'Plymouth',
                    locationString: 'Plymouth, England, United Kingdom',
                    description: 'Plymouth is a historic port city in Devon, England, with centuries of maritime exploration and naval tradition.',
                    population: null,
                    climate: {
                      name: 'Oceanic Climate',
                      description: 'Temperate oceanic climate with mild winters and cool summers.',
                      koppenCode: 'Cfb'
                    },
                    contextNotes: [
                      'Historic departure port for the Mayflower in 1620 and Shackleton in 1914.',
                      'The city hosted the 2024 Commonwealth Games along the seafront.', // Contaminated (false mega-event)
                      'Features the memorial to theFontAwesomeSolidPlaneService on the Hoe.' // Contaminated (code token)
                    ],
                    notable: [
                      {
                        title: 'Plymouth Hoe',
                        description: 'A large south-facing public park overlooking Plymouth Sound with Smeaton\'s Tower.'
                      },
                      {
                        title: 'Olympic Legacy',
                        description: 'Plymouth hosted the first modern Olympic Games outside Athens in 1908.' // Contaminated
                      },
                      {
                        title: 'FontAwesome Memorial', // Contaminated
                        description: 'A monument styled with LucideIcon tokens.'
                      }
                    ]
                  })
                }
              }
            ]
          }),
          text: async () => ''
        } as any);

        const recovered = await geminiService.recoverLocationMetadata(
          'Plymouth',
          { lat: 50.3714, lng: -4.1424 },
          {
            canonicalName: 'Plymouth',
            entityType: 'landmark',
            country: 'United Kingdom',
            state: 'England',
            city: 'Plymouth'
          }
        );

        expect(recovered).not.toBeNull();
        expect(recovered?.description?.provenance?.provider).toBe('LMStudio');

        // Context notes: Contaminated items filtered out, valid one preserved
        expect(recovered?.contextNotes?.length).toBe(1);
        expect(recovered?.contextNotes?.[0]?.text).toContain('departure port for the Mayflower');

        // Notable: Contaminated items filtered out, valid one preserved
        expect(recovered?.notable?.length).toBe(1);
        expect(recovered?.notable?.[0]?.title).toBe('Plymouth Hoe');
        expect(recovered?.notable?.[0]?.provenance?.provider).toBe('LMStudio');
      });

      it('rejects description contaminated with code artifacts during recovery merge', async () => {
        vi.spyOn(geminiService.ai.models, 'generateContent').mockResolvedValue({
          text: JSON.stringify({
            name: 'Plymouth',
            locationString: 'Plymouth, England, United Kingdom',
            description: 'Plymouth is home to the National Memorial to theFontAwesomeSolidPlaneService HMS Raleigh.',
            population: null,
            climate: {
              name: 'Oceanic Climate',
              description: 'Temperate oceanic climate.',
              koppenCode: 'Cfb'
            },
            contextNotes: [],
            notable: []
          })
        } as any);

        const recovered = await geminiService.recoverLocationMetadata(
          'Plymouth',
          { lat: 50.3714, lng: -4.1424 },
          {
            canonicalName: 'Plymouth',
            entityType: 'landmark',
            country: 'United Kingdom',
            state: 'England'
          }
        );

        // Description was rejected due to code artifacts, so description field is undefined on result
        expect(recovered?.description).toBeUndefined();
      });

      it('accepts recovery response with empty contextNotes and notable arrays without error', async () => {
        vi.spyOn(geminiService.ai.models, 'generateContent').mockResolvedValue({
          text: JSON.stringify({
            name: 'Plymouth',
            locationString: 'Plymouth, England, United Kingdom',
            description: 'Plymouth is a coastal city in South West England known for its maritime heritage.',
            population: null,
            climate: {
              name: 'Oceanic Climate',
              description: 'Temperate oceanic climate.',
              koppenCode: 'Cfb'
            },
            contextNotes: [],
            notable: []
          })
        } as any);

        const recovered = await geminiService.recoverLocationMetadata(
          'Plymouth',
          { lat: 50.3714, lng: -4.1424 },
          {
            canonicalName: 'Plymouth',
            entityType: 'landmark',
            country: 'United Kingdom',
            state: 'England'
          }
        );

        expect(recovered).not.toBeNull();
        expect(recovered?.description?.text).toContain('Plymouth is a coastal city');
        expect(recovered?.contextNotes).toEqual([]);
        expect(recovered?.notable).toEqual([]);
      });
    });
  });

  describe('G. Source-Grounded Synthesis and Wikipedia Grounding Layer', () => {
    describe('1. Wikipedia Lead Extract Fetcher (fetchWikipediaLeadExtract)', () => {
      it('fetches and normalizes Wikipedia lead extract for clean and prefixed article titles', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            query: {
              pages: {
                '43382': {
                  pageid: 43382,
                  title: 'Plymouth',
                  extract: 'Plymouth is a port city and unitary authority in Devon, South West England. It is located on the south coast of Devon, approximately 190 miles south-west of London. It is home to HMNB Devonport, the largest operational naval base in Western Europe.',
                  thumbnail: {
                    source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Plymouth_Hoe.jpg/400px-Plymouth_Hoe.jpg'
                  }
                }
              }
            }
          })
        } as any);

        const result = await fetchWikipediaLeadExtract('en:Plymouth');
        expect(result).not.toBeNull();
        expect(result?.title).toBe('Plymouth');
        expect(result?.extract).toContain('largest operational naval base in Western Europe');
        expect(result?.thumbnailUrl).toContain('Plymouth_Hoe.jpg');
        expect(result?.pageUrl).toBe('https://en.wikipedia.org/wiki/Plymouth');
      });

      it('returns null gracefully when Wikipedia API returns no page or encounters network error', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            query: {
              pages: {
                '-1': { missing: '' }
              }
            }
          })
        } as any);

        const missingResult = await fetchWikipediaLeadExtract('en:NonExistentPlaceXYZ123');
        expect(missingResult).toBeNull();

        vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network offline'));
        const errorResult = await fetchWikipediaLeadExtract('en:Plymouth');
        expect(errorResult).toBeNull();
      });
    });

    describe('2. Pipeline Grounding Integration and Synthesis', () => {
      it('retrieves Wikipedia lead extract and executes SOURCE_GROUNDED_SYNTHESIS with provenance.source = "Wikipedia"', async () => {
        // Mock Nominatim resolution returning Wikipedia tag "en:Plymouth"
        vi.spyOn(geographicResolver, 'resolveGeographicEntity').mockResolvedValueOnce({
          name: 'Plymouth, Devon, England, United Kingdom',
          coordinates: { lat: 50.3714, lng: -4.1424, source: 'geocoder' },
          entityType: 'city',
          source: 'nominatim' as any,
          identityStatus: 'verified',
          confidence: 1.0,
          suggestedZoom: 12,
          normalizedQuery: 'plymouth, england',
          wikipedia: 'en:Plymouth',
          wikidataId: 'Q43382',
          context: {
            country: 'United Kingdom',
            state: 'England',
            city: 'Plymouth'
          },
          diagnostics: {
            resolverVersion: 1,
            matchedName: 'Plymouth',
            confidenceAdjustments: [],
            warnings: [],
            ambiguity: { detected: false, candidates: [] }
          }
        } as any);

        // Mock Wikipedia lead extract
        vi.spyOn(geographicResolver, 'fetchWikipediaLeadExtract').mockResolvedValueOnce({
          title: 'Plymouth',
          extract: 'Plymouth is a port city and unitary authority in Devon, South West England. It has a rich maritime history, having served as the departure point for the Mayflower in 1620. The city is home to HMNB Devonport, the largest operational naval base in Western Europe.',
          pageUrl: 'https://en.wikipedia.org/wiki/Plymouth',
          lang: 'en'
        });

        let capturedPrompt = '';
        vi.spyOn(geminiService.ai.models, 'generateContent').mockImplementation(async (params: any) => {
          capturedPrompt = params.contents;
          return {
            text: JSON.stringify({
              name: 'Plymouth',
              locationString: 'Plymouth, Devon, England, United Kingdom',
              description: 'Plymouth is a prominent port city on the south coast of Devon, England. Renowned for its rich naval heritage, the city served as the historic departure point for the Mayflower in 1620 and remains home to HMNB Devonport, Western Europe\'s largest operational naval base.',
              population: null,
              climate: {
                name: 'Oceanic Climate',
                description: 'Temperate maritime climate.',
                koppenCode: 'Cfb'
              },
              contextNotes: [
                'Historic departure port for the Mayflower in 1620.',
                'Home to HMNB Devonport, Western Europe\'s largest operational naval base.'
              ],
              notable: [
                {
                  title: 'HMNB Devonport',
                  description: 'The largest active naval base in Western Europe, supporting Royal Navy operations.'
                },
                {
                  title: 'Mayflower Departure',
                  description: 'Historic port from which the Pilgrim Fathers sailed for the New World in 1620.'
                }
              ]
            })
          } as any;
        });

        const result = await runSearchPipeline({
          rawQuery: 'plymouth, england'
        });

        expect(result.isValid).toBe(true);
        expect(result.entity).toBeDefined();

        // Verify prompt receives the authoritative Wikipedia source text
        expect(capturedPrompt).toContain('AUTHORITATIVE SOURCE TEXT (Wikipedia extract for "Plymouth")');
        expect(capturedPrompt).toContain('largest operational naval base in Western Europe');
        expect(capturedPrompt).toContain('CRITICAL SOURCE-GROUNDING AND ACCURACY RULES');

        // Verify recovered description and provenance
        const descObj = result.entity?.metadata.description as any;
        expect(typeof descObj).toBe('object');
        expect(descObj.text).toContain('Plymouth is a prominent port city');
        expect(descObj.provenance.source).toBe('Wikipedia');

        // Verify contextNotes and notable
        expect(result.entity?.metadata.contextNotes?.length).toBe(2);
        expect(result.entity?.metadata.notable?.length).toBe(2);
      });

      it('degrades to CONSERVATIVE_FALLBACK with provenance.source = "GeographicResolver" when Wikipedia is unavailable', async () => {
        // Mock Nominatim resolution without Wikipedia extract
        vi.spyOn(geographicResolver, 'resolveGeographicEntity').mockResolvedValueOnce({
          name: 'Remote Settlement, Remote Region, Country',
          coordinates: { lat: 10.0, lng: 20.0, source: 'geocoder' },
          entityType: 'village',
          source: 'nominatim' as any,
          identityStatus: 'verified',
          confidence: 1.0,
          suggestedZoom: 12,
          normalizedQuery: 'remote settlement',
          context: { country: 'Country', state: 'Remote Region', city: 'Remote Settlement' },
          diagnostics: { resolverVersion: 1, matchedName: 'Remote Settlement', confidenceAdjustments: [], warnings: [], ambiguity: { detected: false, candidates: [] } }
        } as any);

        // Mock Wikipedia lead fetch failing
        vi.spyOn(geographicResolver, 'fetchWikipediaLeadExtract').mockResolvedValueOnce(null);

        let capturedPrompt = '';
        vi.spyOn(geminiService.ai.models, 'generateContent').mockImplementation(async (params: any) => {
          capturedPrompt = params.contents;
          return {
            text: JSON.stringify({
              name: 'Remote Settlement',
              locationString: 'Remote Settlement, Remote Region, Country',
              description: 'Remote Settlement is a rural locality situated in Remote Region, Country.',
              population: null,
              climate: {
                name: 'Tropical Climate',
                description: 'Tropical climate.',
                koppenCode: 'Af'
              },
              contextNotes: [],
              notable: []
            })
          } as any;
        });

        const result = await runSearchPipeline({
          rawQuery: 'remote settlement'
        });

        expect(result.isValid).toBe(true);

        // Verify prompt is conservative without fictitious historical narrative demands
        expect(capturedPrompt).toContain('CRITICAL CONSERVATIVE RULES (NO SOURCE TEXT AVAILABLE)');
        expect(capturedPrompt).toContain('No authoritative encyclopedic text is available for this location');

        // Verify recovered description and provenance
        const descObj = result.entity?.metadata.description as any;
        expect(descObj.provenance.source).toBe('GeographicResolver');
        expect(result.entity?.metadata.contextNotes).toEqual([]);
        expect(result.entity?.metadata.notable).toEqual([]);
      });
    });

    describe('3. Source-Grounded Hallucination Protection', () => {
      it('enforces synthesis strictly grounded in supplied source without accepting unsupported closure or mega-event claims', async () => {
        const sourceText = 'Plymouth is a port city in Devon, England. It has a long naval history and is home to HMNB Devonport. The city was the departure point for the Mayflower in 1620.';

        vi.spyOn(geminiService.ai.models, 'generateContent').mockResolvedValueOnce({
          text: JSON.stringify({
            name: 'Plymouth',
            locationString: 'Plymouth, Devon, England, United Kingdom',
            description: 'Plymouth is a historic port city in Devon, England, home to HMNB Devonport and known as the 1620 departure port for the Mayflower.',
            population: null,
            climate: {
              name: 'Oceanic Climate',
              description: 'Temperate oceanic climate.',
              koppenCode: 'Cfb'
            },
            contextNotes: [
              'Departure point for the Mayflower in 1620.'
            ],
            notable: [
              {
                title: 'HMNB Devonport',
                description: 'Historic and active naval base located in Plymouth.'
              }
            ]
          })
        } as any);

        const recovered = await geminiService.recoverLocationMetadata(
          'Plymouth',
          { lat: 50.3714, lng: -4.1424 },
          {
            canonicalName: 'Plymouth',
            entityType: 'landmark',
            country: 'United Kingdom',
            state: 'England',
            city: 'Plymouth',
            sourceText,
            sourceTitle: 'Plymouth'
          }
        );

        expect(recovered).not.toBeNull();
        expect(recovered?.description?.provenance?.source).toBe('Wikipedia');
        expect(recovered?.description?.text).not.toContain('closure in 2014');
        expect(recovered?.description?.text).not.toContain('Olympic Games');
        expect(recovered?.contextNotes?.length).toBe(1);
        expect(recovered?.notable?.length).toBe(1);
      });
    });
  });
});


