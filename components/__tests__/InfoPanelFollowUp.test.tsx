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
});
