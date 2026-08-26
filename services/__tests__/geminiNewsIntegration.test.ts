import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchLiveNews } from '../newsService';
import { fetchAndValidateLocationNews } from '../locationService';
import * as geminiProvider from '../providers/geminiNewsProvider';
import * as nytProvider from '../providers/nytNewsProvider';
import * as newsApiProvider from '../providers/newsApiProvider';
import * as newsDataProvider from '../providers/newsDataProvider';
import * as geminiService from '../geminiService';
import { newsCache } from '../cacheService';

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

describe('Gemini News Integration & News Service Suite', () => {
  beforeEach(() => {
    newsCache.clear();
    vi.restoreAllMocks();
    storageMap.clear();
  });

  afterEach(() => {
    newsCache.clear();
    vi.restoreAllMocks();
    storageMap.clear();
  });

  it('1. newsProvider === "gemini" invokes fetchGeminiGroundedNews()', async () => {
    storageMap.set(
      'terraExplorerSettings',
      JSON.stringify({
        newsProvider: 'gemini',
        showNews: true
      })
    );

    const mockGroundedNews = [
      {
        title: 'Tokyo Tech Summit 2026',
        summary: 'Major robotics and AI summit held in Tokyo.',
        source: 'Japan Times',
        url: 'https://japantimes.co.jp/news/2026/tech-summit'
      }
    ];

    const geminiSpy = vi.spyOn(geminiProvider, 'fetchGeminiGroundedNews').mockResolvedValue(mockGroundedNews);

    const results = await fetchLiveNews('Tokyo');

    expect(geminiSpy).toHaveBeenCalledWith('Tokyo');
    expect(results).toEqual(mockGroundedNews);
  });

  it('2. Gemini does not require NYT, NewsAPI, or NewsData API keys to fetch and validate news', async () => {
    storageMap.set(
      'terraExplorerSettings',
      JSON.stringify({
        newsProvider: 'gemini',
        nytApiKey: '',
        newsApiKey: '',
        newsDataApiKey: '',
        showNews: true
      })
    );

    process.env.API_KEY = 'test-gemini-key-12345';

    const mockArticles = [
      {
        title: 'Paris Cultural Festival Launches in Grand Palais',
        summary: 'Annual arts and culture event opens across Paris museums.',
        source: 'Le Monde',
        url: 'https://lemonde.fr/culture/paris-festival-2026'
      }
    ];

    vi.spyOn(geminiProvider, 'fetchGeminiGroundedNews').mockResolvedValue(mockArticles);

    const validated = await fetchAndValidateLocationNews('Paris');

    expect(validated).toHaveLength(1);
    expect(validated[0].title).toBe('Paris Cultural Festival Launches in Grand Palais');
  });

  it('3. Missing Gemini API configuration throws an appropriate error rather than invalid API call', async () => {
    storageMap.set(
      'terraExplorerSettings',
      JSON.stringify({
        newsProvider: 'gemini',
        showNews: true
      })
    );

    const originalKey = process.env.API_KEY;
    const originalGeminiKey = process.env.GEMINI_API_KEY;
    delete process.env.API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      await expect(fetchAndValidateLocationNews('Rome')).rejects.toThrow('Gemini API key is not configured');
    } finally {
      process.env.API_KEY = originalKey;
      process.env.GEMINI_API_KEY = originalGeminiKey;
    }
  });

  it('4. NYT provider is invoked when newsProvider === "nyt"', async () => {
    storageMap.set(
      'terraExplorerSettings',
      JSON.stringify({
        newsProvider: 'nyt',
        nytApiKey: 'test-nyt-key',
        showNews: true
      })
    );

    const mockNYTNews = [
      {
        title: 'London Infrastructure Project Expands',
        summary: 'New transit connections completed across central London.',
        source: 'The New York Times',
        url: 'https://nytimes.com/2026/london-transit'
      }
    ];

    const nytSpy = vi.spyOn(nytProvider, 'fetchNYTNews').mockResolvedValue(mockNYTNews);

    const results = await fetchLiveNews('London');

    expect(nytSpy).toHaveBeenCalledWith('London', 'test-nyt-key');
    expect(results).toEqual(mockNYTNews);
  });

  it('5. NewsAPI provider is invoked when newsProvider === "newsapi"', async () => {
    storageMap.set(
      'terraExplorerSettings',
      JSON.stringify({
        newsProvider: 'newsapi',
        newsApiKey: 'test-newsapi-key',
        showNews: true
      })
    );

    const mockNewsApiArticles = [
      {
        title: 'Berlin Green Energy Initiative',
        summary: 'Solar installations expand across Berlin public buildings.',
        source: 'Reuters',
        url: 'https://reuters.com/world/europe/berlin-energy-2026'
      }
    ];

    const newsApiSpy = vi.spyOn(newsApiProvider, 'fetchNewsApiNews').mockResolvedValue(mockNewsApiArticles);

    const results = await fetchLiveNews('Berlin');

    expect(newsApiSpy).toHaveBeenCalledWith('Berlin', 'test-newsapi-key');
    expect(results).toEqual(mockNewsApiArticles);
  });

  it('6. NewsData provider is invoked when newsProvider === "newsdata"', async () => {
    storageMap.set(
      'terraExplorerSettings',
      JSON.stringify({
        newsProvider: 'newsdata',
        newsDataApiKey: 'test-newsdata-key',
        showNews: true
      })
    );

    const mockNewsDataArticles = [
      {
        title: 'Sydney Harbor Restoration Complete',
        summary: 'Marine conservation program concludes in Sydney harbor.',
        source: 'Sydney Morning Herald',
        url: 'https://smh.com.au/environment/sydney-harbor-2026'
      }
    ];

    const newsDataSpy = vi.spyOn(newsDataProvider, 'fetchNewsDataNews').mockResolvedValue(mockNewsDataArticles);

    const results = await fetchLiveNews('Sydney');

    expect(newsDataSpy).toHaveBeenCalledWith('Sydney', 'test-newsdata-key');
    expect(results).toEqual(mockNewsDataArticles);
  });

  it('7. New/default settings initialize newsProvider to gemini', () => {
    storageMap.clear();
    const defaults = geminiService.getUserSettings();
    expect(defaults.newsProvider).toBe('gemini');
  });

  it('8. Existing saved preferences (nyt, newsapi, newsdata, gemini) are preserved', () => {
    // NYT
    storageMap.set('terraExplorerSettings', JSON.stringify({ newsProvider: 'nyt' }));
    expect(geminiService.getUserSettings().newsProvider).toBe('nyt');

    // NewsAPI
    storageMap.set('terraExplorerSettings', JSON.stringify({ newsProvider: 'newsapi' }));
    expect(geminiService.getUserSettings().newsProvider).toBe('newsapi');

    // NewsData
    storageMap.set('terraExplorerSettings', JSON.stringify({ newsProvider: 'newsdata' }));
    expect(geminiService.getUserSettings().newsProvider).toBe('newsdata');

    // Gemini
    storageMap.set('terraExplorerSettings', JSON.stringify({ newsProvider: 'gemini' }));
    expect(geminiService.getUserSettings().newsProvider).toBe('gemini');
  });

  it('9. Gemini provider specifies Google Search grounding tools: [{ googleSearch: {} }]', async () => {
    let capturedParams: any = null;
    vi.spyOn(geminiService, 'generateContentWithRetry').mockImplementation(async (params: any) => {
      capturedParams = params;
      return {
        text: JSON.stringify([
          {
            title: 'Kyoto Cultural Preservation',
            summary: 'Ancient shrines undergo restoration in Kyoto.',
            source: 'NHK World',
            url: 'https://nhk.or.jp/kyoto-restoration'
          }
        ])
      };
    });

    const articles = await geminiProvider.fetchGeminiGroundedNews('Kyoto');

    expect(capturedParams).not.toBeNull();
    expect(capturedParams.config).toBeDefined();
    expect(capturedParams.config.tools).toEqual([{ googleSearch: {} }]);
    expect(articles).toHaveLength(1);
    expect(articles[0].url).toBe('https://nhk.or.jp/kyoto-restoration');
  });

  it('10. Dallas Texas news query succeeds end-to-end through fetchAndValidateLocationNews', async () => {
    storageMap.set(
      'terraExplorerSettings',
      JSON.stringify({
        newsProvider: 'gemini',
        showNews: true
      })
    );

    process.env.API_KEY = 'test-gemini-api-key';

    const dallasArticles = [
      {
        title: 'Dallas Arts District Announces New Public Exhibit',
        summary: 'Major contemporary outdoor installations opening across downtown Dallas.',
        source: 'The Dallas Morning News',
        url: 'https://dallasnews.com/arts/2026/exhibit'
      },
      {
        title: 'Dallas Transit Expansion Project Approved',
        summary: 'City council approves funding for upgraded light rail connections in Dallas.',
        source: 'WFAA Dallas',
        url: 'https://wfaa.com/news/dallas-transit-2026'
      },
      {
        title: 'Dallas Tech Hub Welcomes Clean Energy Startups',
        summary: 'Several renewable technology companies establish headquarters in Dallas.',
        source: 'Dallas Innovates',
        url: 'https://dallasinnovates.com/clean-tech-2026'
      }
    ];

    vi.spyOn(geminiProvider, 'fetchGeminiGroundedNews').mockResolvedValue(dallasArticles);

    const locationData = {
      name: 'Dallas, Texas, United States',
      waypoint: {
        canonicalName: 'Dallas',
        name: 'Dallas',
        state: 'Texas',
        country: 'United States'
      }
    };

    const results = await fetchAndValidateLocationNews('Dallas, Texas, United States', locationData);

    expect(results).toHaveLength(3);
    expect(results[0].title).toBe('Dallas Arts District Announces New Public Exhibit');
    expect(results[1].title).toBe('Dallas Transit Expansion Project Approved');
    expect(results[2].title).toBe('Dallas Tech Hub Welcomes Clean Energy Startups');
  });

  it('11. Regression: Gemini request taking 9 to 14 seconds successfully reaches caller and articles are not discarded', async () => {
    storageMap.set(
      'terraExplorerSettings',
      JSON.stringify({
        newsProvider: 'gemini',
        showNews: true
      })
    );

    const dallasArticles = [
      {
        title: 'Dallas Medical District Expands Research Facilities',
        summary: 'New bioscience labs open in Dallas.',
        source: 'Dallas Morning News',
        url: 'https://dallasnews.com/business/2026/biotech'
      },
      {
        title: 'Dallas Symphony Orchestra Season Announced',
        summary: 'New classical performances scheduled in Dallas arts district.',
        source: 'Dallas Culture',
        url: 'https://dallasculture.org/symphony-2026'
      },
      {
        title: 'Dallas Urban Park Project Breaks Ground',
        summary: 'Construction begins on downtown Dallas green space.',
        source: 'WFAA Dallas',
        url: 'https://wfaa.com/news/dallas-park-2026'
      }
    ];

    // Simulate a grounded Gemini search taking 11.5 seconds (which previously timed out at 8000ms)
    vi.useFakeTimers();
    try {
      vi.spyOn(geminiProvider, 'fetchGeminiGroundedNews').mockImplementation(async () => {
        await new Promise(r => setTimeout(r, 11500));
        return dallasArticles;
      });

      const fetchPromise = fetchLiveNews('Dallas');
      await vi.advanceTimersByTimeAsync(12000);
      const results = await fetchPromise;

      expect(results).toHaveLength(3);
      expect(results).toEqual(dallasArticles);
    } finally {
      vi.useRealTimers();
    }
  });

  describe('Geographic Relevance Validation Suite', () => {
    const setupGemini = () => {
      storageMap.set(
        'terraExplorerSettings',
        JSON.stringify({ newsProvider: 'gemini', showNews: true })
      );
      process.env.API_KEY = 'test-gemini-key';
    };

    it('12. Actual Dallas Texas runtime articles: valid articles survive and are returned', async () => {
      setupGemini();

      const articles = [
        {
          title: "Dallas estimates $1.8M security cost for the upcoming Republican National Convention.",
          summary: "City officials in Dallas review financial projections for convention security.",
          source: "Dallas Morning News",
          url: "https://dallasnews.com/news/2026/rnc-security"
        },
        {
          title: "H-E-B becomes exclusive grocery partner of Dallas Cowboys starting this season.",
          summary: "Supermarket chain signs multi-year partnership with the NFL team.",
          source: "Dallas Business Journal",
          url: "https://bizjournals.com/dallas/news/2026/heb-cowboys"
        },
        {
          title: "Austin Metcalf's dad reacts to \"gentlemen's agreement\" discussed at Karmelo Anthony appeal hearing.",
          summary: "Appeal hearing concludes without additional locality details.",
          source: "Texas Tribune",
          url: "https://texastribune.org/2026/appeal-hearing"
        }
      ];

      vi.spyOn(geminiProvider, 'fetchGeminiGroundedNews').mockResolvedValue(articles);

      const results = await fetchAndValidateLocationNews('Dallas Texas');

      // Articles 1 and 2 MUST be accepted; article 3 has no geographic context and is rejected
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.some(a => a.title.includes('Dallas estimates $1.8M security cost'))).toBe(true);
      expect(results.some(a => a.title.includes('H-E-B becomes exclusive grocery partner'))).toBe(true);
    });

    it('13. Exact location match is accepted', async () => {
      setupGemini();
      vi.spyOn(geminiProvider, 'fetchGeminiGroundedNews').mockResolvedValue([
        {
          title: 'Dallas City Hall Announces New Green Initiative',
          summary: 'Solar panels to be installed across municipal buildings in Dallas.',
          source: 'WFAA',
          url: 'https://wfaa.com/news/dallas-green'
        }
      ]);

      const results = await fetchAndValidateLocationNews('Dallas');
      expect(results).toHaveLength(1);
    });

    it('14. City-only match is accepted when query is "City, State"', async () => {
      setupGemini();
      vi.spyOn(geminiProvider, 'fetchGeminiGroundedNews').mockResolvedValue([
        {
          title: 'Dallas Tech Hub Welcomes New Startups',
          summary: 'Downtown coworking spaces expand.',
          source: 'Dallas Morning News',
          url: 'https://dallasnews.com/tech-hub'
        }
      ]);

      const results = await fetchAndValidateLocationNews('Dallas, Texas');
      expect(results).toHaveLength(1);
    });

    it('15. City + state match is accepted', async () => {
      setupGemini();
      vi.spyOn(geminiProvider, 'fetchGeminiGroundedNews').mockResolvedValue([
        {
          title: 'New High Speed Rail Line Planned Between Dallas and Houston',
          summary: 'Texas transportation commission discusses Dallas, Texas rail corridor.',
          source: 'Texas Rail Journal',
          url: 'https://texasrail.org/dallas-houston'
        }
      ]);

      const results = await fetchAndValidateLocationNews('Dallas, Texas');
      expect(results).toHaveLength(1);
    });

    it('16. County associated with queried city is accepted', async () => {
      setupGemini();
      vi.spyOn(geminiProvider, 'fetchGeminiGroundedNews').mockResolvedValue([
        {
          title: 'Dallas County Health Department Issues Spring Advisory',
          summary: 'Annual public health guidelines published for local residents.',
          source: 'NBC DFW',
          url: 'https://nbcdfw.com/news/county-health'
        }
      ]);

      const results = await fetchAndValidateLocationNews('Dallas Texas');
      expect(results).toHaveLength(1);
    });

    it('17. Recognized nearby/regional location or DFW alias is accepted', async () => {
      setupGemini();
      vi.spyOn(geminiProvider, 'fetchGeminiGroundedNews').mockResolvedValue([
        {
          title: 'DFW International Airport Opens Sixth Terminal',
          summary: 'Major expansion enhances international travel capacity.',
          source: 'Dallas Innovates',
          url: 'https://dallasinnovates.com/dfw-terminal'
        },
        {
          title: 'Frisco Stadium Upgrades Completed Ahead of Championship',
          summary: 'North Texas sports facility ready for summer matches.',
          source: 'Fort Worth Star-Telegram',
          url: 'https://star-telegram.com/sports/frisco-stadium'
        }
      ]);

      const results = await fetchAndValidateLocationNews('Dallas Texas');
      expect(results).toHaveLength(2);
    });

    it('18. Strong local institution/entity associated with location causes acceptance', async () => {
      setupGemini();
      vi.spyOn(geminiProvider, 'fetchGeminiGroundedNews').mockResolvedValue([
        {
          title: 'Dallas ISD Approves Next Year School Calendar',
          summary: 'Trustees vote on instructional schedule.',
          source: 'KERA News',
          url: 'https://kera.org/dallas-isd'
        }
      ]);

      const results = await fetchAndValidateLocationNews('Dallas Texas');
      expect(results).toHaveLength(1);
    });

    it('19. Same-state but unrelated article is rejected', async () => {
      setupGemini();
      vi.spyOn(geminiProvider, 'fetchGeminiGroundedNews').mockResolvedValue([
        {
          title: 'Houston Port Records Highest Cargo Volume in History',
          summary: 'Gulf Coast shipping hub reports strong quarterly growth.',
          source: 'Houston Chronicle',
          url: 'https://chron.com/business/houston-port'
        }
      ]);

      const results = await fetchAndValidateLocationNews('Dallas Texas');
      expect(results).toHaveLength(0);
    });

    it('20. National article merely mentioning the state is rejected', async () => {
      setupGemini();
      vi.spyOn(geminiProvider, 'fetchGeminiGroundedNews').mockResolvedValue([
        {
          title: 'Federal Highway Funding Allocated to Texas and Florida',
          summary: 'Interstate maintenance grants announced by Department of Transportation.',
          source: 'Washington Post',
          url: 'https://washingtonpost.com/national/highway-funding'
        }
      ]);

      const results = await fetchAndValidateLocationNews('Dallas, Texas');
      expect(results).toHaveLength(0);
    });

    it('21. Person-name-only association without geographic evidence is rejected', async () => {
      setupGemini();
      vi.spyOn(geminiProvider, 'fetchGeminiGroundedNews').mockResolvedValue([
        {
          title: 'John Smith Announces Retirement from Corporate Board',
          summary: 'Executive steps down after 20 years in financial sector.',
          source: 'Bloomberg',
          url: 'https://bloomberg.com/news/john-smith'
        }
      ]);

      const results = await fetchAndValidateLocationNews('Dallas Texas');
      expect(results).toHaveLength(0);
    });

    it('22. One rejected article does not discard valid articles', async () => {
      setupGemini();
      vi.spyOn(geminiProvider, 'fetchGeminiGroundedNews').mockResolvedValue([
        {
          title: 'Dallas Museum of Art Unveils New Wing',
          summary: 'Renovation complete in downtown arts district.',
          source: 'Dallas Morning News',
          url: 'https://dallasnews.com/arts/dma'
        },
        {
          title: 'San Antonio River Walk Hosts Culinary Festival',
          summary: 'South Texas food event draws visitors.',
          source: 'San Antonio Express-News',
          url: 'https://expressnews.com/riverwalk'
        }
      ]);

      const results = await fetchAndValidateLocationNews('Dallas Texas');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Dallas Museum of Art Unveils New Wing');
    });

    it('23. Multiple valid Dallas articles are returned', async () => {
      setupGemini();
      vi.spyOn(geminiProvider, 'fetchGeminiGroundedNews').mockResolvedValue([
        {
          title: 'Dallas City Council Votes on New Park',
          summary: 'Downtown park proposal moves forward.',
          source: 'Dallas Observer',
          url: 'https://dallasobserver.com/park'
        },
        {
          title: 'Dallas Symphony Orchestra Opens Spring Series',
          summary: 'Performances scheduled at Meyerson Symphony Center.',
          source: 'KERA',
          url: 'https://kera.org/dso-spring'
        }
      ]);

      const results = await fetchAndValidateLocationNews('Dallas Texas');
      expect(results).toHaveLength(2);
    });

    it('24. Genuinely unrelated article is rejected', async () => {
      setupGemini();
      vi.spyOn(geminiProvider, 'fetchGeminiGroundedNews').mockResolvedValue([
        {
          title: 'Tokyo Transit Strike Ends with New Agreement',
          summary: 'Subway services resume normal operation across Tokyo.',
          source: 'The Japan Times',
          url: 'https://japantimes.co.jp/tokyo-transit'
        }
      ]);

      const results = await fetchAndValidateLocationNews('Dallas Texas');
      expect(results).toHaveLength(0);
    });

    it('25. If all articles are unrelated, returns []', async () => {
      setupGemini();
      vi.spyOn(geminiProvider, 'fetchGeminiGroundedNews').mockResolvedValue([
        {
          title: 'Paris Art Exhibit Opens',
          summary: 'Museums in Paris unveil French impressionist collection.',
          source: 'Le Figaro',
          url: 'https://lefigaro.fr/art'
        },
        {
          title: 'Seattle Tech Conference Begins',
          summary: 'Software developers gather in Washington state.',
          source: 'Seattle Times',
          url: 'https://seattletimes.com/tech'
        }
      ]);

      const results = await fetchAndValidateLocationNews('Dallas Texas');
      expect(results).toEqual([]);
    });
  });
});
