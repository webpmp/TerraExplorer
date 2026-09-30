export function getDiscoveryPrompt(entityType?: string, entityName?: string, discoverySignals?: string[], queryContext?: string): string {
    return `
## 1. ENTITY CLASSIFICATION REQUIREMENTS

Before generating content, determine what type of entity the marker represents.
Supported entity types:
city, town, village, county, administrative_region, national_park, mountain, volcano, river, lake, waterfall, desert, island, museum, university, castle, historical_site, monument, bridge, airport, infrastructure, natural_feature, landmark, shipwreck, battle, expedition, person.

The entity type controls what information should be generated. Never treat every marker as a generic "Point of Interest."

The InfoPanel header should display:
ENTITY NAME
ENTITY TYPE

Do not put unnecessary geographic hierarchy in the title.
Bad: "Okeechobee County, Florida"
Better: "Okeechobee County"

The location context belongs in the description only when relevant.

---

# 2. OVERVIEW GENERATION RULES & SEMANTIC ANCHOR INVARIANT

The Overview is not a generic location description.
The Overview must answer: "What is this place/subject and why should someone care?"
Establish the subject and primary narrative in 3-5 sentences (1-2 coherent paragraphs).

CRITICAL INVARIANT - SEMANTIC ANCHOR FOR EVENT QUERIES:
When the query or context relates to a specific historical event (e.g. "Where did the launch of Sputnik take place?"), that specific event MUST remain the semantic anchor of the overview and narrative.
The requested entity name is authoritative: for a named historical battle or event, return the canonical historical event or battlefield/site and do not substitute a minor sub-location, farm, or tactical building unless explicitly requested.
The narrative must immediately establish the connection:
[Queried Event] -> [Exact Date / Milestone] -> [Specific Facility / Site Name] -> [Geographic Context / Country].
Other events associated with the same location (e.g., Yuri Gagarin's 1961 flight at Baikonur) are secondary supporting context and must NEVER replace, overshadow, or be labeled as the primary event over the queried subject.

NARRATIVE DENSITY & CONSOLIDATION:
Maintain high narrative density in 1-2 coherent paragraphs rather than fragmented fact cards or short bullet points. Avoid generating artificial subsection headings like "Significance", "Historical Milestone", "Historical Region", "Strategic Location", or "Cultural Symbol".

Structure:
Sentence 1: Define the identity of the place or event.
Good: "Site No. 1 at the Baikonur Cosmodrome was the launch site for Sputnik 1, the world's first artificial satellite, launched on October 4, 1957."
Bad: "Site No. 1 is a location in Kazakhstan."

Sentence 2-3: Explain significance. Detail the core event, its impact, and its legacy.
Sentence 4-5: Provide concise secondary historical context if relevant.
The user should finish reading and understand: "I learned something substantive and directly answering my question."

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

# 4. NOTABLE FACTS REQUIREMENTS: FACTS MUST EXPLAIN WHY THEY MATTER (PROGRESSIVE, ADDITIVE INFORMATION ENRICHMENT)

CORE PRINCIPLE: PROGRESSIVE PRESENTATION OF INFORMATION
Treat the InfoPanel as a progressive presentation of information:
- Description = Establish the subject and primary narrative (Answers: "What is this and why is it important?").
- Notable Facts = Deepen understanding with additional dimensions not already communicated (Answers: "What else would help me understand this subject that I have not already been told?").
- Notable Facts must NEVER function as a summary, restatement, alternate wording, or bulleted rephrasing of the Description or other visible InfoPanel sections (subtitle, category, climate, etc.).

AVOID REPETITION AT THE FACTUAL LEVEL:
Before generating Notable Facts, identify the substantive facts already presented in the Description.
A Notable Fact is considered repetitive if it communicates the same underlying information, even if it uses different wording.
Example of Forbidden Repetition:
- Description: "The expedition reached the South Pole in January 1912."
- Forbidden Notable Fact: "The explorers arrived at the South Pole during January 1912." (Semantic duplicate - rejected).
- Preferred Additive Fact: "Pony and Motor Sledge Logistics: The expedition initially experimented with motor sledges and Manchurian ponies to haul tons of supplies across the Ross Ice Shelf."

DO NOT output empty headings or standalone topic labels like:
- "Geological Formation"
- "Historical Contention"
- "Strategic Oil Transit"
- "Unique Ecosystems"
- "Conservation Milestone"
- "Economic Importance"
- "Cultural Significance"
- "Archaeological Significance"

WHAT NOTABLE FACTS SHOULD DO - EXPLORE ADDITIVE DIMENSIONS:
When generating Notable Facts, introduce additional dimensions of the subject that have NOT yet been presented:
1. Associated People: When meaningful individuals are associated with the subject, include them. If the Description already introduced the primary figure, look for another meaningful individual (e.g., secondary commander, engineer, navigator, merchant, archaeologist, scientist, or key participant) with specific actions or contributions. Do not repeat the same person.
2. Discovery, Excavation, & Archaeology: How the site/wreck/artifact was found or excavated, key artifacts recovered, salvage details, or physical remains.
3. Engineering, Construction, & Scale: Specific dimensions, materials, architectural techniques, numbers, or logistical milestones.
4. Subsequent Developments & Consequences: Events that occurred before or after the primary event, legal precedents, long-term impact, or changes over time.
5. Scientific, Cultural, Geographic, or Economic Context: Distinct ecological/geological phenomena, trade networks, indigenous relationships, or cultural legacy.
6. Records, Firsts, & Unusual Characteristics: Documented milestones, distinctive anomalies, or lesser-known historical details.
7. Preservation & Heritage: How the subject is documented, conserved, or memorialized today.

SUBJECT-AWARE GENERATION (ADAPT AUTOMATICALLY):
- Historical Event: People involved, logistical preparation, consequences, subsequent treaties/rulings, connections to other events.
- Location: Historical occupants, development over time, unusual characteristics, cultural or economic significance.
- Shipwreck: Associated individuals, discovery/salvage operations, recovered cargo/artifacts, archaeological evidence, legal rulings.
- Natural Feature: Geological formation details, scientific discoveries, ecological significance, exploration history.
- Building / Structure: Architect, construction techniques/materials, notable occupants, modifications, preservation.
- Person: Lesser-known accomplishments, relationships, historical context, enduring influence.

CHOOSE DEPTH OVER REPETITION:
- A smaller number of genuinely useful facts is preferable to a larger number of repetitive facts.
- Typically provide 2 to 4 substantive, novel facts. If only 2 meaningful additional facts exist, provide 2.
- Never invent facts or repeat the Description simply to populate a fixed count.

Every notable fact MUST contain:
1. "title": A concise, descriptive heading that identifies the specific topic, person, or feature.
2. "description": A 1–3 sentence substantive explanation providing concrete facts, context, scale, measurements, events, discoveries, or history, and explicitly explaining WHY this fact is significant, distinctive, or interesting (answers "So what?").

Concrete Examples of Desired Facts:
- title: "Strategic Maritime Chokepoint"
  description: "The Strait of Hormuz is a narrow marine passage between Iran and the Arabian Peninsula connecting the Persian Gulf with the Gulf of Oman. As the only sea passage from the Persian Gulf to the open ocean, roughly one-fifth of global petroleum consumption passes through this constrained waterway, making it a critical global maritime chokepoint."
- title: "Recurring Geopolitical Flashpoint"
  description: "Because all maritime traffic entering or leaving the oil-rich Persian Gulf must traverse its narrow shipping lanes, control and security of the strait have been a persistent source of international military and diplomatic tension for decades."
- title: "Seasonal Wetland Hydrology"
  description: "Paynes Prairie is a large freshwater wetland basin whose water levels fluctuate substantially with seasonal rainfall, alternating between dry savannah and a sprawling lake. These changing hydrology conditions support hundreds of bird species, wild horses, bison, and alligators."

CONTENT QUALITY TEST (CONCEPTUAL VERIFICATION):
Before including any Notable Fact, verify:
1. Has this information already been stated in Description or context? (If yes -> REJECT)
2. If wording changed, is underlying fact still the same? (If yes -> REJECT)
3. Does this fact add a new dimension of understanding? (If no -> REJECT)
4. Is it specifically relevant and factually supportable? (If no -> REJECT)
5. Would a user learn something new from it? (If no -> REJECT)

Fallback: If no meaningful facts exist, return:
[{"title": "Documentation", "description": "No widely documented historical or cultural facts were found."}]

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

${queryContext ? `USER RESEARCH QUERY CONTEXT: "${queryContext}". You MUST directly address this specific queried event or topic, keeping it as the primary semantic anchor.` : ''}
${entityName ? `Focus specifically on: ${entityName}` : ''}
${discoverySignals && discoverySignals.length > 0 ? `Incorporate these discovery signals into your narrative: ${discoverySignals.join(", ")}` : ''}
---

# 8. OUTPUT FORMAT REQUIREMENTS

Required output:
\`\`\`json
{
  "description": "A documentary-style overview establishing the primary narrative.",
  "notable": [
    {
      "title": "Specific Descriptive Heading",
      "description": "Additive detail expanding upon the subject without repeating the overview."
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
