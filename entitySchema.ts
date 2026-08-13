export interface UISection {
  id: string;
  required: boolean;
}

export interface EntitySchema {
  capabilities: {
    supportsNews: boolean;
    supportsPopulation: boolean;
    supportsClimate: boolean;
    supportsHistoricalNarrative: boolean;
  };
  enrichment: {
    overwriteNarrative: boolean;
    fetchNews: boolean;
  };
  ui: {
    sections: UISection[];
  };
}

const ModernPlace: Partial<EntitySchema> = {
  capabilities: {
    supportsNews: true,
    supportsPopulation: true,
    supportsClimate: true,
    supportsHistoricalNarrative: false
  }
};

const HistoricalEntity: Partial<EntitySchema> = {
  capabilities: {
    supportsNews: false,
    supportsPopulation: true,
    supportsClimate: true,
    supportsHistoricalNarrative: true
  }
};

export const ENTITY_SCHEMAS: Record<string, EntitySchema> = {
  historical_waypoint: {
    capabilities: HistoricalEntity.capabilities!,
    enrichment: {
      overwriteNarrative: false,
      fetchNews: false
    },
    ui: {
      sections: [
        { id: "overview", required: true },
        { id: "historicalContext", required: true },
        { id: "historicalPeriod", required: false },
        { id: "keyFigures", required: false },
        { id: "modernContext", required: false },
        { id: "relatedPlaces", required: false }
      ]
    }
  },
  city: {
    capabilities: ModernPlace.capabilities!,
    enrichment: {
      overwriteNarrative: true,
      fetchNews: true
    },
    ui: {
      sections: [
        { id: "overview", required: true },
        { id: "modernContext", required: true },
        { id: "liveNews", required: false },
        { id: "relatedPlaces", required: false }
      ]
    }
  },
  country: {
    capabilities: ModernPlace.capabilities!,
    enrichment: {
      overwriteNarrative: true,
      fetchNews: true
    },
    ui: {
      sections: [
        { id: "overview", required: true },
        { id: "modernContext", required: true },
        { id: "liveNews", required: false },
        { id: "relatedPlaces", required: false }
      ]
    }
  },
  landmark: {
    capabilities: ModernPlace.capabilities!,
    enrichment: {
      overwriteNarrative: true,
      fetchNews: true
    },
    ui: {
      sections: [
        { id: "overview", required: true },
        { id: "modernContext", required: true },
        { id: "liveNews", required: false },
        { id: "relatedPlaces", required: false }
      ]
    }
  }
};
