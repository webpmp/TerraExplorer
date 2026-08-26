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
    supportsNews: true,
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
        { id: "notable", required: false },
        { id: "gallery", required: false },
        { id: "modernContext", required: false },
        { id: "liveNews", required: false },
        { id: "relatedPlaces", required: false }
      ]
    }
  },
  historical_site: {
    capabilities: HistoricalEntity.capabilities!,
    enrichment: {
      overwriteNarrative: false,
      fetchNews: false
    },
    ui: {
      sections: [
        { id: "overview", required: true },
        { id: "notable", required: false },
        { id: "gallery", required: false },
        { id: "modernContext", required: false },
        { id: "liveNews", required: false },
        { id: "relatedPlaces", required: false }
      ]
    }
  },
  historical_event_site: {
    capabilities: HistoricalEntity.capabilities!,
    enrichment: {
      overwriteNarrative: false,
      fetchNews: false
    },
    ui: {
      sections: [
        { id: "overview", required: true },
        { id: "notable", required: false },
        { id: "gallery", required: false },
        { id: "modernContext", required: false },
        { id: "liveNews", required: false },
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
        { id: "notable", required: false },
        { id: "gallery", required: false },
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
        { id: "notable", required: false },
        { id: "gallery", required: false },
        { id: "modernContext", required: true },
        { id: "liveNews", required: false },
        { id: "relatedPlaces", required: false }
      ]
    }
  },
  landmark: {
    capabilities: {
      supportsNews: true,
      supportsPopulation: false,
      supportsClimate: true,
      supportsHistoricalNarrative: true
    },
    enrichment: {
      overwriteNarrative: true,
      fetchNews: true
    },
    ui: {
      sections: [
        { id: "overview", required: true },
        { id: "notable", required: false },
        { id: "gallery", required: false },
        { id: "modernContext", required: true },
        { id: "liveNews", required: false },
        { id: "relatedPlaces", required: false }
      ]
    }
  },
  national_park: {
    capabilities: {
      supportsNews: true,
      supportsPopulation: false,
      supportsClimate: true,
      supportsHistoricalNarrative: true
    },
    enrichment: {
      overwriteNarrative: true,
      fetchNews: true
    },
    ui: {
      sections: [
        { id: "overview", required: true },
        { id: "notable", required: false },
        { id: "gallery", required: false },
        { id: "modernContext", required: true },
        { id: "liveNews", required: false },
        { id: "relatedPlaces", required: false }
      ]
    }
  },
  natural_feature: {
    capabilities: {
      supportsNews: true,
      supportsPopulation: false,
      supportsClimate: true,
      supportsHistoricalNarrative: true
    },
    enrichment: {
      overwriteNarrative: true,
      fetchNews: true
    },
    ui: {
      sections: [
        { id: "overview", required: true },
        { id: "notable", required: false },
        { id: "gallery", required: false },
        { id: "modernContext", required: true },
        { id: "liveNews", required: false },
        { id: "relatedPlaces", required: false }
      ]
    }
  }
};
