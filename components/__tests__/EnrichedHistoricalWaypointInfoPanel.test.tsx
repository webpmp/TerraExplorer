import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import InfoPanel from '../InfoPanel';

describe('Enriched Historical Waypoint InfoPanel Rendering', () => {
  it('renders Burkhan Khaldun with Route Context, Narrative Description, and Notable Facts without orphan Historical Context heading', () => {
    const burkhanKhaldunEnriched = {
      id: 'wp-genghis-1',
      name: 'Burkhan Khaldun (Mongolia)',
      canonicalName: 'Burkhan Khaldun',
      lat: 48.9,
      lng: 109.0,
      coordinates: { lat: 48.9, lng: 109.0 },
      type: 'route',
      entityType: 'historical_waypoint',
      routeTitle: 'The Campaigns of Genghis Khan',
      historicalContext: '1206: Temüjin unites the Mongol tribes and is proclaimed Genghis Khan.',
      routeContext: {
        title: 'The Campaigns of Genghis Khan',
        text: '1206: Temüjin unites the Mongol tribes and is proclaimed Genghis Khan.'
      },
      description: 'Burkhan Khaldun is a sacred mountain in northeastern Mongolia where Temüjin sought spiritual refuge in his youth. Following decades of inter-tribal warfare, he convened a grand kurultai here in 1206, uniting the nomadic confederations and proclaiming the Mongol Empire.',
      notable: [
        {
          title: 'Sacred Mountain of Genghis Khan',
          description: 'Burkhan Khaldun is deeply associated with Genghis Khan, who prayed here before his campaigns.'
        },
        {
          title: 'UNESCO World Heritage Site',
          description: 'Inscribed in 2015 as Great Burkhan Khaldun Mountain and its surrounding sacred landscape.'
        },
        {
          title: 'Khentii Mountain Range',
          description: 'Located in the Khentii Mountains of northeastern Mongolia near the sacred Onon and Kherlen rivers.'
        }
      ],
      waypoint: {
        id: 'wp-genghis-1',
        name: 'Burkhan Khaldun (Mongolia)',
        canonicalName: 'Burkhan Khaldun',
        lat: 48.9,
        lng: 109.0,
        sequence: 1,
        routeGroupId: 'genghis-khan',
        routeGroupName: 'The Campaigns of Genghis Khan',
        context: '1206: Temüjin unites the Mongol tribes and is proclaimed Genghis Khan.',
        description: 'Burkhan Khaldun is a sacred mountain in northeastern Mongolia where Temüjin sought spiritual refuge in his youth. Following decades of inter-tribal warfare, he convened a grand kurultai here in 1206, uniting the nomadic confederations and proclaiming the Mongol Empire.',
        routeTitle: 'The Campaigns of Genghis Khan'
      }
    };

    const html = renderToStaticMarkup(
      <InfoPanel
        info={burkhanKhaldunEnriched as any}
        onClose={() => {}}
        skin="modern"
        routeNav={{
          current: 1,
          total: 6,
          onNext: () => {},
          onPrev: () => {},
          routeGroupName: 'The Campaigns of Genghis Khan',
          routeLocalCurrent: 1,
          routeLocalTotal: 6
        }}
      />
    );

    // 1. Route Context rendered
    expect(html).toContain('The Campaigns of Genghis Khan');
    expect(html).toContain('1206: Temüjin unites the Mongol tribes and is proclaimed Genghis Khan.');

    // 2. Narrative Description rendered
    expect(html).toContain('Burkhan Khaldun is a sacred mountain in northeastern Mongolia');

    // 3. Notable Facts rendered
    expect(html).toContain('Notable Facts');
    expect(html).toContain('Sacred Mountain of Genghis Khan');
    expect(html).toContain('UNESCO World Heritage Site');
    expect(html).toContain('Khentii Mountain Range');

    // 4. Must NOT render an orphan Historical Context heading with no content
    expect(html).not.toContain('Historical Context</h3>');
  });

  it('renders Yinchuan and Zhongdu with their respective enriched notable facts and descriptions', () => {
    const yinchuanEnriched = {
      id: 'wp-genghis-2',
      name: 'Yinchuan (Western Xia)',
      canonicalName: 'Yinchuan',
      coordinates: { lat: 38.4872, lng: 106.2309 },
      entityType: 'historical_waypoint',
      routeTitle: 'The Campaigns of Genghis Khan',
      historicalContext: '1209: The Mongols force the Western Xia emperor to submit.',
      routeContext: {
        title: 'The Campaigns of Genghis Khan',
        text: '1209: The Mongols force the Western Xia emperor to submit.'
      },
      description: 'Yinchuan was the fortified capital of the Tangut Western Xia dynasty. In 1209, Genghis Khan launched his first major external campaign, surrounding the capital and diverting the Yellow River to breach defenses, successfully forcing Western Xia into tribute and vassalage.',
      notable: [
        {
          title: 'Capital of Western Xia',
          description: 'Served as the imperial capital of the Tangut Empire until Mongol conquest.'
        },
        {
          title: 'Yellow River Diversion',
          description: 'During the 1209 siege, Mongols attempted to flood the city using the Yellow River dykes.'
        }
      ],
      waypoint: {
        id: 'wp-genghis-2',
        name: 'Yinchuan (Western Xia)',
        canonicalName: 'Yinchuan',
        lat: 38.4872,
        lng: 106.2309,
        sequence: 2,
        routeGroupId: 'genghis-khan',
        routeGroupName: 'The Campaigns of Genghis Khan',
        context: '1209: The Mongols force the Western Xia emperor to submit.',
        description: 'Yinchuan was the fortified capital of the Tangut Western Xia dynasty. In 1209, Genghis Khan launched his first major external campaign, surrounding the capital and diverting the Yellow River to breach defenses, successfully forcing Western Xia into tribute and vassalage.',
        routeTitle: 'The Campaigns of Genghis Khan'
      }
    };

    const html = renderToStaticMarkup(
      <InfoPanel
        info={yinchuanEnriched as any}
        onClose={() => {}}
        skin="modern"
        routeNav={{
          current: 2,
          total: 6,
          onNext: () => {},
          onPrev: () => {},
          routeGroupName: 'The Campaigns of Genghis Khan',
          routeLocalCurrent: 2,
          routeLocalTotal: 6
        }}
      />
    );

    expect(html).toContain('1209: The Mongols force the Western Xia emperor to submit.');
    expect(html).toContain('Yinchuan was the fortified capital of the Tangut Western Xia dynasty.');
    expect(html).toContain('Notable Facts');
    expect(html).toContain('Capital of Western Xia');
    expect(html).toContain('Yellow River Diversion');
    expect(html).not.toContain('Historical Context</h3>');
  });
});
