export function getDiscoveryPrompt(entityType?: string, entityName?: string, discoverySignals?: string[]): string {
    return `
## 1. ENTITY CLASSIFICATION REQUIREMENTS

Before generating content, determine what type of entity the marker represents.
Supported entity types:
city, town, village, county, administrative_region, national_park, mountain, volcano, river, lake, waterfall, desert, island, museum, university, castle, historical_site, monument, bridge, airport, infrastructure, natural_feature, landmark.

The entity type controls what information should be generated. Never treat every marker as a generic "Point of Interest."

The InfoPanel header should display:
ENTITY NAME
ENTITY TYPE

Do not put unnecessary geographic hierarchy in the title.
Bad: "Okeechobee County, Florida"
Better: "Okeechobee County"

The location context belongs in the description only when relevant.

---

# 2. OVERVIEW GENERATION RULES

The Overview is not a location description.
The Overview must answer: "What is this place and why should someone care?"
Generate 3-5 sentences.

Structure:
Sentence 1: Define the identity of the place.
Good: "Pedra Lavrada is a small Brazilian municipality known for its distinctive granite landscapes and traditional stone quarrying."
Bad: "Pedra Lavrada is a location in Paraíba, Brazil."

Sentence 2-3: Explain significance. Choose relevant topics: historical importance, economic importance, cultural traditions, famous industries, scientific discoveries, natural resources, environmental importance, architecture, famous residents, archaeological importance, unique events.

Sentence 4-5: Explain why this place is memorable.
The user should finish reading and understand: "I learned something interesting about this place."

---

# 3. ENTITY-SPECIFIC KNOWLEDGE PRIORITIES

## Cities / Towns / Villages
Prioritize: founding story, why the settlement developed, industries that shaped it, cultural traditions, famous residents, historical events, unique festivals, architecture, unusual characteristics.
Avoid: population statistics unless historically important, administrative boundaries, generic location descriptions.

## Counties / Administrative Regions
Prioritize: why this administrative area exists, economic identity, agriculture, mining, industry, tourism, major natural resources, environmental importance, historical events, famous people connected to the area.
Avoid: repetitive administrative boundaries, vacuous filler.

## National Parks / Natural Areas
Prioritize: why it was protected, geological formation, ecosystems, wildlife, conservation history, scientific importance, exploration history, indigenous connections.

## Mountains / Volcanoes
Prioritize: geological formation, age, unusual features, climbing history, indigenous significance, scientific discoveries, famous expeditions.

## Rivers / Lakes / Water Features
Prioritize: formation, civilizations connected to it, ecological importance, historical events, exploration, unusual characteristics.

## Museums / Universities / Cultural Sites
Prioritize: famous collections, discoveries, founders, notable people, architectural importance, cultural influence.

## Bridges / Airports / Infrastructure
Prioritize: engineering achievement, historical events, design significance, records, military or transportation history.

---

# 4. NOTABLE FACTS REQUIREMENTS: FACTS MUST EXPLAIN WHY THEY MATTER

The Notable Facts section must provide genuine educational value, NOT generic category or topic labels.

DO NOT output empty headings or standalone topic labels like:
- "Geological Formation"
- "Historical Contention"
- "Strategic Oil Transit"
- "Unique Ecosystems"
- "Conservation Milestone"
- "Economic Importance"
- "Cultural Significance"
- "Archaeological Significance"

Every notable fact MUST contain:
1. "title": A concise, descriptive heading that identifies the specific topic or feature.
2. "summary": A 1–3 sentence substantive explanation providing concrete facts, context, scale, measurements, events, discoveries, or history, and explicitly explaining WHY this fact is significant, distinctive, or interesting (answers "So what?").

Concrete Examples of Desired Facts:
- title: "Strategic Maritime Chokepoint"
  summary: "The Strait of Hormuz is a narrow marine passage between Iran and the Arabian Peninsula connecting the Persian Gulf with the Gulf of Oman. As the only sea passage from the Persian Gulf to the open ocean, roughly one-fifth of global petroleum consumption passes through this constrained waterway, making it a critical global maritime chokepoint."
- title: "Recurring Geopolitical Flashpoint"
  summary: "Because all maritime traffic entering or leaving the oil-rich Persian Gulf must traverse its narrow shipping lanes, control and security of the strait have been a persistent source of international military and diplomatic tension for decades."
- title: "Seasonal Wetland Hydrology"
  summary: "Paynes Prairie is a large freshwater wetland basin whose water levels fluctuate substantially with seasonal rainfall, alternating between dry savannah and a sprawling lake. These changing hydrology conditions support hundreds of bird species, wild horses, bison, and alligators."

Rules:
- Heading identifies the topic; body explains it with specific, educational detail.
- Prefer 3 to 5 genuinely informative, educational facts based on verifiable information.
- If only 2 or 3 substantive facts can be supported, return fewer facts. Do NOT output generic filler or empty categories just to reach a target count.
- Do not invent fabricated statistics or unverified claims.

Fallback: If no meaningful facts exist, return:
[{"title": "Documentation", "summary": "No widely documented historical or cultural facts were found."}]

---

# 5. CLIMATE REQUIREMENTS

Climate should describe the experience of the environment.
Climate must connect to: vegetation, ecosystems, human activity, seasonal patterns.

---

# 6. IMAGE REQUIREMENTS

The image must represent the actual identity of the place.
Do not use: random government buildings, city halls, generic offices, maps, seals, unrelated streets.
Image priority: Famous landmark, Recognizable landscape, Unique geological feature, Historic structure, Cultural symbol, Representative city skyline.

Also generate a short image caption.
Caption requirements: 1 sentence, explain what is shown, explain why it represents the place.

---

# 7. CONTENT QUALITY RULES
Avoid purely generic boilerplate or placeholder text. Focus on substantive historical, cultural, and environmental details.
Reject Notable facts if they are only: coordinates, borders, climate descriptions.

The final InfoPanel should feel like a museum exhibit, documentary narration, or expert tour guide. The goal is not to describe where something is. The goal is to explain why it matters.

${entityName ? `Focus specifically on: ${entityName}` : ''}
${discoverySignals && discoverySignals.length > 0 ? `Incorporate these discovery signals into your narrative: ${discoverySignals.join(", ")}` : ''}
---

# 8. OUTPUT FORMAT REQUIREMENTS

Required output:
\`\`\`json
{
  "description": "A documentary-style overview.",
  "notable": [
    {
      "title": "",
      "description": ""
    }
  ]
}
\`\`\`

Rules:
* JSON only.
* No markdown.
* No commentary.
* Always include description.
* Always include notable array.
* Do not invent geographic facts.
* Never invent nearby geographic relationships. Use only supplied coordinates and source facts.
* Use only the provided Discovery Brief.
`;
}
