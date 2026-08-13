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
Avoid: "located in", "serves surrounding communities", "regional feature", geographic hierarchy.

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

# 4. NOTABLE FACTS REQUIREMENTS

The Notable section is NOT a geographic summary. It should provide facts that make a user say: "I didn't know that."
Generate 3-6 facts.
Allowed categories: Historical events, Famous people, Scientific discoveries, Records (largest, oldest, first, unusual), Cultural traditions, Architecture and engineering, Archaeology, Media appearances, Indigenous history.

Never repeat Overview content.
Never generate facts about: latitude, longitude, region names, administrative relationships, generic geography.

Fallback: If no meaningful facts exist, return exactly:
["No widely documented historical or cultural facts were found."]
Do not invent filler.

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
Reject Overview if it contains: "is a location", "located in", "situated in", "serves surrounding communities", "regional feature", "area known as", "part of the region", "geographic significance".
Reject Notable facts if they are only: location, borders, administrative information, coordinates, climate descriptions.

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
