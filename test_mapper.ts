import { normalizeInfoPanelData } from './utils/mappers.js';

const mockEntity = {
  id: 'grand-canyon',
  pipelineVersion: 2,
  revision: 1,
  subject: {
    identity: { canonicalName: 'Grand Canyon', entityType: 'natural_feature' },
    primaryLocation: { label: 'Grand Canyon', location: { coordinates: { lat: 36, lng: -112 } } }
  },
  metadata: {
    description: 'The Grand Canyon is a steep-sided canyon carved by the Colorado River in Arizona, United States.',
    population: { current: 'unknown', historical: 'unknown' },
    climate: { name: 'Semi-arid', description: 'Dry and hot', koppenCode: 'BSk' },
    contextNotes: ['Fact 1'],
    news: [],
    relatedEntities: []
  }
};

const result = normalizeInfoPanelData(mockEntity, 'AppRender');
console.log(JSON.stringify(result, null, 2));
