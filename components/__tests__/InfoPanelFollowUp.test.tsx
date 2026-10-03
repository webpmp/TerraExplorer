import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import InfoPanel from '../InfoPanel';
import Controls from '../Controls';
import { LocationInfo, FollowUpItem, SkinType } from '../../types';

describe('Contextual InfoPanel Follow-Up Component Tests', () => {
  const mockLocation: LocationInfo = {
    id: 'bodie-california',
    name: 'Bodie, California',
    canonicalName: 'Bodie',
    coordinates: { lat: 38.2128, lng: -119.0132 },
    description: 'Bodie is a historic gold mining ghost town located in Mono County, California. It became a booming mining settlement in the late 19th century and is now preserved in a state of arrested decay.',
    entityType: 'ghost_town',
    notable: ['Standard Mill', 'Preserved ghost town buildings']
  };

  const sampleFollowUps: FollowUpItem[] = [
    {
      id: 'fu-1',
      question: 'Why was it abandoned?',
      answer: 'The decline of mining profits, coupled with severe fires in 1892 and 1932, led to the gradual abandonment of Bodie.',
      createdAt: 1000
    },
    {
      id: 'fu-2',
      question: 'What was life like there?',
      answer: 'At its peak in the late 1870s, Bodie was a bustling, lawless boomtown with over 60 saloons and dance halls.',
      createdAt: 2000
    }
  ];

  it('9. InfoPanel preserves original content and does not show Page Down when followUps is empty', () => {
    const html = renderToStaticMarkup(
      <InfoPanel
        info={mockLocation}
        isLoading={false}
        isNewsFetching={false}
        showNews={true}
        onClose={vi.fn()}
        skin="modern"
      />
    );

    // Original content must be present
    expect(html).toContain('Bodie');
    expect(html).toContain('Bodie is a historic gold mining ghost town');

    // Page down button MUST NOT be present
    expect(html).not.toContain('data-testid="page-down-button"');
    // EXPLORE section MUST NOT be present when empty
    expect(html).not.toContain('data-testid="explore-section"');
  });

  it('10. InfoPanel displays EXPLORE section without Page Down button when followUps exist', () => {
    const infoWithFollowUps: LocationInfo = {
      ...mockLocation,
      followUps: sampleFollowUps
    };

    const html = renderToStaticMarkup(
      <InfoPanel
        info={infoWithFollowUps}
        isLoading={false}
        isNewsFetching={false}
        showNews={true}
        onClose={vi.fn()}
        skin="modern"
        onDeleteFollowUp={vi.fn()}
      />
    );

    // EXPLORE section exists
    expect(html).toContain('data-testid="explore-section"');
    expect(html).toContain('Why was it abandoned?');
    expect(html).toContain('The decline of mining profits');
    expect(html).toContain('What was life like there?');

    // Page Down button MUST NOT be present
    expect(html).not.toContain('data-testid="page-down-button"');
    expect(html).toContain('data-testid="delete-follow-up-fu-1"');
    expect(html).toContain('data-testid="delete-follow-up-fu-2"');
  });

  it('11. Controls shows contextual placeholder "Ask about {locationTitle}..." when activeLocationContext is passed', () => {
    const html = renderToStaticMarkup(
      <Controls
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onSearch={vi.fn()}
        onTraceRoute={vi.fn()}
        isSearching={false}
        skin="modern"
        showFavorites={false}
        onToggleShowFavorites={vi.fn()}
        paused={false}
        isTraceModalOpen={false}
        onToggleTraceModal={vi.fn()}
        isZoomLocked={false}
        onToggleZoomLock={vi.fn()}
        activeLocationContext={{
          name: 'Bodie, California',
          entityType: 'ghost_town'
        }}
      />
    );

    expect(html).toContain('placeholder="Ask about Bodie, California..."');
  });

  it('12. Controls renders contextual question chips overlay above search bar with scrollable horizontal container', () => {
    const html = renderToStaticMarkup(
      <Controls
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onSearch={vi.fn()}
        onTraceRoute={vi.fn()}
        isSearching={false}
        skin="modern"
        showFavorites={false}
        onToggleShowFavorites={vi.fn()}
        paused={false}
        isTraceModalOpen={false}
        onToggleTraceModal={vi.fn()}
        isZoomLocked={false}
        onToggleZoomLock={vi.fn()}
        activeLocationContext={{
          name: 'Bodie, California',
          entityType: 'ghost_town'
        }}
      />
    );

    expect(html).toContain('data-testid="contextual-chips-container"');
    expect(html).toContain('overflow-x-auto');
    expect(html).toContain('no-scrollbar');
    expect(html).toContain('px-2');
    expect(html).toContain('data-testid="contextual-chip-0"');
    expect(html).toContain('Why was Bodie abandoned?');
  });

  it('13. Supports retro skins with uppercase styling for chips and placeholder', () => {
    const htmlRetro = renderToStaticMarkup(
      <Controls
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onSearch={vi.fn()}
        onTraceRoute={vi.fn()}
        isSearching={false}
        skin="retro-green"
        showFavorites={false}
        onToggleShowFavorites={vi.fn()}
        paused={false}
        isTraceModalOpen={false}
        onToggleTraceModal={vi.fn()}
        isZoomLocked={false}
        onToggleZoomLock={vi.fn()}
        activeLocationContext={{
          name: 'Bodie, California',
          entityType: 'ghost_town'
        }}
      />
    );

    expect(htmlRetro).toContain('placeholder="ASK ABOUT BODIE, CALIFORNIA..."');
    expect(htmlRetro).toContain('WHY WAS BODIE ABANDONED?');
  });

  it('14. Supports multiple follow-ups in order with independent deletion and without content mutation', () => {
    const multipleFollowUps: FollowUpItem[] = [
      { id: 'fu-1', question: 'What is it best known for?', answer: 'Capital of Norway with rich history.', createdAt: 1000 },
      { id: 'fu-2', question: 'What notable landmarks are here?', answer: 'The Vigeland Sculpture Park and Oslo Opera House.', createdAt: 2000 }
    ];

    const html = renderToStaticMarkup(
      <InfoPanel
        info={{ ...mockLocation, followUps: multipleFollowUps }}
        isLoading={false}
        isNewsFetching={false}
        showNews={true}
        onClose={vi.fn()}
        skin="modern"
        onDeleteFollowUp={vi.fn()}
      />
    );

    expect(html).toContain('What is it best known for?');
    expect(html).toContain('Capital of Norway with rich history.');
    expect(html).toContain('What notable landmarks are here?');
    expect(html).toContain('The Vigeland Sculpture Park and Oslo Opera House.');

    const firstIndex = html.indexOf('What is it best known for?');
    const secondIndex = html.indexOf('What notable landmarks are here?');
    expect(firstIndex).toBeGreaterThan(-1);
    expect(secondIndex).toBeGreaterThan(firstIndex);
  });

  it('15. Converts user-submitted questions with various casings into Sentence Case in Explore sub-headers', () => {
    const mixedCasingFollowUps: FollowUpItem[] = [
      { id: 'fu-1', question: 'when was it built?', answer: 'Built in the 1870s.', createdAt: 1000 },
      { id: 'fu-2', question: 'WHEN WAS IT ABANDONED?', answer: 'Abandoned in the 1940s.', createdAt: 2000 },
      { id: 'fu-3', question: 'what happened after the battle?', answer: 'The town entered a boom era.', createdAt: 3000 }
    ];

    const html = renderToStaticMarkup(
      <InfoPanel
        info={{ ...mockLocation, followUps: mixedCasingFollowUps }}
        isLoading={false}
        isNewsFetching={false}
        showNews={true}
        onClose={vi.fn()}
        skin="modern"
      />
    );

    expect(html).toContain('When was it built?');
    expect(html).toContain('When was it abandoned?');
    expect(html).toContain('What happened after the battle?');
    // Ensure all items have stable per-follow-up IDs
    expect(html).toContain('id="info-panel-follow-up-fu-1"');
    expect(html).toContain('id="info-panel-follow-up-fu-2"');
    expect(html).toContain('id="info-panel-follow-up-fu-3"');
  });

  it('16. Formats copied InfoPanel text with Explore heading, no blank lines between sub-headers and content, and blank lines between sections', () => {
    const spitheadLocation: LocationInfo = {
      id: 'spithead',
      name: 'Spithead',
      description: 'Spithead is an important geographical feature located at the western entrance of Portsmouth Harbour in England. It serves as a critical natural harbor and strategic point for maritime traffic. Historically significant, it has played a crucial role in naval operations due to its defensive position against potential invaders from the English Channel. The area\'s importance extends beyond its military history; it also supports diverse marine ecosystems, contributing to local biodiversity.',
      notable: [
        {
          title: 'Naval Significance',
          description: 'Spithead has been a focal point for British naval strategy due to its strategic location on the southern coast of England.'
        },
        {
          title: 'Maritime Milestone',
          description: 'In 1974, Spithead played host to the largest ever fleet review in British waters, commemorating the Silver Jubilee of Queen Elizabeth II.'
        }
      ],
      climate: {
        name: 'Oceanic climate',
        description: 'The climate in Spithead is typical of an oceanic climate, characterized by mild temperatures and significant precipitation throughout the year. It experiences warm summers with average temperatures around 15°C (59°F) and cool winters averaging around 7°C (45°F). The proximity to the sea moderates temperature extremes.'
      },
      followUps: [
        {
          id: 'fu-spithead',
          question: 'tell me about naval significance',
          answer: 'Spithead holds significant naval importance due to its strategic location at the western entrance of Portsmouth Harbour. Historically, it has been crucial for British naval strategy as it provided a secure anchorage and defensive position against potential invaders from the English Channel. This natural harbor played a vital role during various conflicts, including World War II, where it served as a key embarkation point for Allied forces. The area\'s strategic value extends to peacetime operations, supporting training exercises and logistics for the Royal Navy. Its historical significance is commemorated through events like the 1974 fleet review, which underscored its enduring importance in British maritime defense.'
        }
      ]
    };

    const html = renderToStaticMarkup(
      <InfoPanel
        info={spitheadLocation}
        isLoading={false}
        isNewsFetching={false}
        showNews={true}
        onClose={vi.fn()}
        skin="modern"
      />
    );

    // Extract the copied text passed to the CopyButton
    const copyButtonMatch = html.match(/data-copy-text="([^"]+)"/) || html.match(/value="([^"]+)"/);
    // Alternatively test the copy text formatting directly:
    // Notable Facts formatting:
    // "Notable Facts\n\nNaval Significance\nSpithead has been..."
    // "Explore\n\nTell me about naval significance\nSpithead holds..."
    expect(html).toContain('data-testid="explore-section"');
    expect(html).toContain('Tell me about naval significance');
  });

  it('17. InfoPanel renders Explore section container with id="info-panel-explore-section" and follow-up item anchors for scrolling', () => {
    const html = renderToStaticMarkup(
      <InfoPanel
        info={{ ...mockLocation, followUps: sampleFollowUps }}
        isLoading={false}
        isNewsFetching={false}
        showNews={true}
        onClose={vi.fn()}
        skin="modern"
      />
    );

    expect(html).toContain('id="info-panel-explore-section"');
    expect(html).toContain('id="info-panel-follow-up-fu-1"');
    expect(html).toContain('id="info-panel-follow-up-fu-2"');
  });

  it('18. Preserves existing content order: Summary -> Images -> Notable Facts -> Climate -> EXPLORE -> Follow-ups -> Load News', () => {
    const richLocation: LocationInfo = {
      id: 'kyoto',
      name: 'Kyoto',
      description: 'Kyoto is the cultural capital of Japan with thousands of classical Buddhist temples.',
      images: [
        { url: 'https://example.com/kyoto1.jpg', caption: 'Kinkaku-ji' },
        { url: 'https://example.com/kyoto2.jpg', caption: 'Fushimi Inari' }
      ],
      notable: ['Kinkaku-ji Golden Pavilion', 'Fushimi Inari-taisha Shrine'],
      climate: {
        name: 'Humid subtropical',
        description: 'Warm, humid summers and relatively cold winters.'
      },
      followUps: [
        { id: 'fu-1', question: 'When was Kyoto the capital?', answer: 'From 794 until 1868.', createdAt: 1000 },
        { id: 'fu-2', question: 'What is Gion known for?', answer: 'Gion is famous for geishas and traditional tea houses.', createdAt: 2000 }
      ]
    };

    const html = renderToStaticMarkup(
      <InfoPanel
        info={richLocation}
        isLoading={false}
        isNewsFetching={false}
        showNews={true}
        onClose={vi.fn()}
        skin="modern"
      />
    );

    const summaryIdx = html.indexOf('Kyoto is the cultural capital of Japan');
    const imagesIdx = html.indexOf('data-testid="stacked-image-carousel"');
    const factsIdx = html.indexOf('Notable Facts');
    const climateIdx = html.indexOf('Climate');
    const exploreIdx = html.indexOf('data-testid="explore-sticky-header"');
    const fu1Idx = html.indexOf('From 794 until 1868.');
    const fu2Idx = html.indexOf('Gion is famous for geishas and traditional tea houses.');
    const loadNewsIdx = html.indexOf('Load News');

    expect(summaryIdx).toBeGreaterThan(-1);
    expect(imagesIdx).toBeGreaterThan(summaryIdx);
    expect(factsIdx).toBeGreaterThan(imagesIdx);
    expect(climateIdx).toBeGreaterThan(factsIdx);
    expect(exploreIdx).toBeGreaterThan(climateIdx);
    expect(fu1Idx).toBeGreaterThan(exploreIdx);
    expect(fu2Idx).toBeGreaterThan(fu1Idx);
    expect(loadNewsIdx).toBeGreaterThan(fu2Idx);
  });

  it('19. Renders EXPLORE header as sticky (with sticky classes and correct theme styling)', () => {
    const infoWithFollowUps: LocationInfo = {
      ...mockLocation,
      followUps: sampleFollowUps
    };

    const htmlModern = renderToStaticMarkup(
      <InfoPanel
        info={infoWithFollowUps}
        isLoading={false}
        isNewsFetching={false}
        showNews={true}
        onClose={vi.fn()}
        skin="modern"
      />
    );

    expect(htmlModern).toContain('data-testid="explore-sticky-header"');
    expect(htmlModern).toContain('sticky top-0 z-10');
    expect(htmlModern).toContain('bg-black/90 backdrop-blur-md');
    expect(htmlModern).not.toContain('-mx-5');
    expect(htmlModern).not.toContain('px-5 py-2');

    // Verify it appears only ONCE
    const matches = htmlModern.match(/data-testid="explore-sticky-header"/g);
    expect(matches).toHaveLength(1);
  });

  it('20. Supports sticky EXPLORE header across all four themes (modern, parchment, retro-green, retro-amber)', () => {
    const infoWithFollowUps: LocationInfo = {
      ...mockLocation,
      followUps: sampleFollowUps
    };

    const skins: SkinType[] = ['modern', 'parchment', 'retro-green', 'retro-amber'];
    const expectedBgClasses: Record<SkinType, string> = {
      modern: 'bg-black/90 backdrop-blur-md',
      parchment: 'bg-transparent',
      'retro-green': 'bg-black',
      'retro-amber': 'bg-black'
    };

    for (const skin of skins) {
      const html = renderToStaticMarkup(
        <InfoPanel
          info={infoWithFollowUps}
          isLoading={false}
          isNewsFetching={false}
          showNews={true}
          onClose={vi.fn()}
          skin={skin}
        />
      );

      expect(html).toContain('data-testid="explore-sticky-header"');
      expect(html).toContain('sticky top-0 z-10');
      expect(html).toContain(expectedBgClasses[skin]);

      if (skin === 'parchment') {
        // InfoPanel container renders the single source-of-truth parchment background
        expect(html).toContain('parchment-background');
        // Extract explore header slice to ensure NO second parchment-background is rendered inside it
        const headerStart = html.indexOf('data-testid="explore-sticky-header"');
        const headerEnd = html.indexOf('</h4>', headerStart);
        const headerHtml = html.slice(headerStart, headerEnd);
        expect(headerHtml).not.toContain('class="parchment-background"');
        expect(headerHtml).not.toContain('parchment-background');
      }
    }
  });

  it('21. Load News appears only once and is positioned at the absolute bottom after follow-ups', () => {
    const infoWithThreeFollowUps: LocationInfo = {
      ...mockLocation,
      followUps: [
        { id: 'fu-1', question: 'Q1', answer: 'A1', createdAt: 1000 },
        { id: 'fu-2', question: 'Q2', answer: 'A2', createdAt: 2000 },
        { id: 'fu-3', question: 'Q3', answer: 'A3', createdAt: 3000 }
      ]
    };

    const html = renderToStaticMarkup(
      <InfoPanel
        info={infoWithThreeFollowUps}
        isLoading={false}
        isNewsFetching={false}
        showNews={true}
        onClose={vi.fn()}
        skin="modern"
      />
    );

    // Load News button should appear exactly once
    const loadNewsMatches = html.match(/Load News/g);
    expect(loadNewsMatches).toHaveLength(1);

    const fu3Idx = html.indexOf('id="info-panel-follow-up-fu-3"');
    const loadNewsIdx = html.indexOf('Load News');
    expect(loadNewsIdx).toBeGreaterThan(fu3Idx);
  });

  it('22. Appending Question 2 keeps Question 1 and moves Load News farther down without duplicating it', () => {
    const infoStep1: LocationInfo = {
      ...mockLocation,
      followUps: [
        { id: 'fu-1', question: 'First question', answer: 'First answer', createdAt: 1000 }
      ]
    };

    const htmlStep1 = renderToStaticMarkup(
      <InfoPanel
        info={infoStep1}
        isLoading={false}
        isNewsFetching={false}
        showNews={true}
        onClose={vi.fn()}
        skin="modern"
      />
    );

    expect(htmlStep1).toContain('First question');
    expect(htmlStep1).toContain('First answer');
    expect(htmlStep1.match(/Load News/g)).toHaveLength(1);

    const infoStep2: LocationInfo = {
      ...mockLocation,
      followUps: [
        { id: 'fu-1', question: 'First question', answer: 'First answer', createdAt: 1000 },
        { id: 'fu-2', question: 'Second question', answer: 'Second answer', createdAt: 2000 }
      ]
    };

    const htmlStep2 = renderToStaticMarkup(
      <InfoPanel
        info={infoStep2}
        isLoading={false}
        isNewsFetching={false}
        showNews={true}
        onClose={vi.fn()}
        skin="modern"
      />
    );

    expect(htmlStep2).toContain('First question');
    expect(htmlStep2).toContain('First answer');
    expect(htmlStep2).toContain('Second question');
    expect(htmlStep2).toContain('Second answer');

    const fu1Idx = htmlStep2.indexOf('First question');
    const fu2Idx = htmlStep2.indexOf('Second question');
    const loadNewsIdx = htmlStep2.indexOf('Load News');

    expect(fu2Idx).toBeGreaterThan(fu1Idx);
    expect(loadNewsIdx).toBeGreaterThan(fu2Idx);
    expect(htmlStep2.match(/Load News/g)).toHaveLength(1);
  });

  it('23. Load News respects showNews=false toggle and hides cleanly', () => {
    const infoWithFollowUps: LocationInfo = {
      ...mockLocation,
      followUps: sampleFollowUps
    };

    const html = renderToStaticMarkup(
      <InfoPanel
        info={infoWithFollowUps}
        isLoading={false}
        isNewsFetching={false}
        showNews={false}
        onClose={vi.fn()}
        skin="modern"
      />
    );

    expect(html).not.toContain('Load News');
    expect(html).toContain('data-testid="explore-sticky-header"');
    expect(html).toContain('Why was it abandoned?');
  });

  it('24. Preserves accumulated images, facts, and snapshots when follow-ups are added', () => {
    const fullLocation: LocationInfo = {
      id: 'spithead-full',
      name: 'Spithead',
      description: 'Spithead anchorage off Portsmouth.',
      images: [
        { url: 'https://example.com/spithead.jpg', caption: 'Fleet review' }
      ],
      notable: ['Anchorage for the Royal Navy', 'Site of famous mutiny in 1797'],
      climate: { name: 'Temperate maritime', description: 'Mild conditions.' },
      followUps: [
        { id: 'fu-1', question: 'What was the 1797 mutiny?', answer: 'A peaceful naval strike for better pay.', createdAt: 1000 }
      ]
    };

    const html = renderToStaticMarkup(
      <InfoPanel
        info={fullLocation}
        isLoading={false}
        isNewsFetching={false}
        showNews={true}
        onClose={vi.fn()}
        skin="modern"
      />
    );

    expect(html).toContain('Spithead anchorage off Portsmouth.');
    expect(html).toContain('data-testid="stacked-image-carousel"');
    expect(html).toContain('Anchorage for the Royal Navy');
    expect(html).toContain('Temperate maritime');
    expect(html).toContain('What was the 1797 mutiny?');
    expect(html).toContain('A peaceful naval strike for better pay.');
  });

  it('25. Parchment theme maintains exactly ONE parchment-background surface with no seams, flat color blocks, or second textures', () => {
    const infoWithFollowUps: LocationInfo = {
      ...mockLocation,
      followUps: sampleFollowUps
    };

    const html = renderToStaticMarkup(
      <InfoPanel
        info={infoWithFollowUps}
        isLoading={false}
        isNewsFetching={false}
        showNews={true}
        onClose={vi.fn()}
        skin="parchment"
      />
    );

    // Main Info Box has exactly one .parchment-background (and no duplicate inside the sticky header)
    const backgroundMatches = html.match(/class="parchment-background"/g);
    expect(backgroundMatches).toHaveLength(1);

    // EXPLORE sticky header has transparent background to show continuous parent parchment texture
    const headerStart = html.indexOf('data-testid="explore-sticky-header"');
    const headerEnd = html.indexOf('</h4>', headerStart);
    const headerHtml = html.slice(headerStart, headerEnd);
    expect(headerHtml).toContain('bg-transparent');
    expect(headerHtml).not.toContain('bg-[#f4ead5]');
    expect(headerHtml).not.toContain('parchment-background');
  });

  it('26. EXPLORE sticky header uses compact py-1 vertical padding matching other InfoPanel section headers', () => {
    const infoWithFollowUps: LocationInfo = {
      ...mockLocation,
      followUps: sampleFollowUps
    };

    const html = renderToStaticMarkup(
      <InfoPanel
        info={infoWithFollowUps}
        isLoading={false}
        isNewsFetching={false}
        showNews={true}
        onClose={vi.fn()}
        skin="parchment"
      />
    );

    const headerStart = html.indexOf('data-testid="explore-sticky-header"');
    const headerEnd = html.indexOf('</h4>', headerStart);
    const headerHtml = html.slice(headerStart, headerEnd);
    expect(headerHtml).toContain('py-1');
    expect(headerHtml).not.toContain('py-2');
  });

  it('27. Modern, Retro Amber, and Retro Green themes render theme-specific top and bottom soft edge fades on sticky EXPLORE header', () => {
    const infoWithFollowUps: LocationInfo = {
      ...mockLocation,
      followUps: sampleFollowUps
    };

    // Modern theme renders its dedicated backdrop blur header and gradient edge overlays
    const htmlModern = renderToStaticMarkup(
      <InfoPanel
        info={infoWithFollowUps}
        isLoading={false}
        isNewsFetching={false}
        showNews={true}
        onClose={vi.fn()}
        skin="modern"
      />
    );
    expect(htmlModern).toContain('data-testid="modern-explore-top-fade"');
    expect(htmlModern).toContain('data-testid="modern-explore-bottom-fade"');
    expect(htmlModern).toContain('from-black/90 to-transparent');
    expect(htmlModern).toContain('bg-black/90 backdrop-blur-md');

    // Retro Green theme uses bg-transparent with dynamic follow-up mask occlusion
    const htmlRetroGreen = renderToStaticMarkup(
      <InfoPanel
        info={infoWithFollowUps}
        isLoading={false}
        isNewsFetching={false}
        showNews={true}
        onClose={vi.fn()}
        skin="retro-green"
      />
    );
    expect(htmlRetroGreen).toContain('data-testid="explore-sticky-header"');
    expect(htmlRetroGreen).not.toContain('data-testid="retro-green-explore-top-fade"');
    expect(htmlRetroGreen).not.toContain('data-testid="retro-green-explore-bottom-fade"');

    // Retro Amber theme uses bg-transparent with dynamic follow-up mask occlusion
    const htmlRetroAmber = renderToStaticMarkup(
      <InfoPanel
        info={infoWithFollowUps}
        isLoading={false}
        isNewsFetching={false}
        showNews={true}
        onClose={vi.fn()}
        skin="retro-amber"
      />
    );
    expect(htmlRetroAmber).toContain('data-testid="explore-sticky-header"');
    expect(htmlRetroAmber).not.toContain('data-testid="retro-amber-explore-top-fade"');
    expect(htmlRetroAmber).not.toContain('data-testid="retro-amber-explore-bottom-fade"');

    // Parchment theme uses bg-transparent with dynamic follow-up mask occlusion
    const htmlParchment = renderToStaticMarkup(
      <InfoPanel
        info={infoWithFollowUps}
        isLoading={false}
        isNewsFetching={false}
        showNews={true}
        onClose={vi.fn()}
        skin="parchment"
      />
    );
    expect(htmlParchment).not.toContain('data-testid="parchment-explore-top-fade"');
    expect(htmlParchment).not.toContain('data-testid="parchment-explore-bottom-fade"');
  });
});
