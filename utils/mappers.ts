import { ResolvedEntity } from '../domain';
import { LocationInfo } from '../types';
import { deduplicateNotableFacts } from './notableFactsUtils';

export interface DescriptionSection {
  heading: string;
  body: string;
}

export function removeLeadingEntityTitle(text: string, canonicalName?: string): string {
  if (!text || !canonicalName) return text;
  const lines = text.split("\n");
  const firstLine = lines[0].replace(/^[#\s]+/, '').trim().toLowerCase();
  const entityName = canonicalName.trim().toLowerCase();
  if (firstLine === entityName || firstLine === `**${entityName}**` || firstLine === `*${entityName}*`) {
    return lines.slice(1).join("\n").trim();
  }
  return text.trim();
}

export function parseDescriptionSections(description: string): DescriptionSection[] {
  if (!description) return [];

  // Convert bullet lists safely
  let processedDesc = description.replace(/^- (.*)$/gm, '<li>$1</li>');
  processedDesc = processedDesc.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  const sectionHeaders = [
    "Overview",
    "Historical Background",
    "Significance",
    "Geography \/ Setting",
    "Interesting Facts",
    "Major Events",
    "Current Status",
    "Visitor Information"
  ];
  
  // Create a regex to match any of the headers, optionally prefixed by markdown '#' characters
  const headerRegexStr = sectionHeaders.map(h => `(?:#+\\s*)?${h}\\*?\\*?`).join("|");
  const regex = new RegExp(`^(${headerRegexStr})$`, "gim");
  
  const parts = processedDesc.split(regex);
  const sections: DescriptionSection[] = [];
  
  // If there's content before the first header, it's the implicit Overview
  if (parts[0] && parts[0].trim().length > 0) {
      sections.push({
          heading: "Overview",
          body: parts[0].trim()
      });
  }
  
  for(let i = 1; i < parts.length; i += 2) {
    // Clean up the heading (remove Markdown # and *)
    const rawHeading = parts[i];
    const cleanHeading = rawHeading.replace(/^[#\s]+/, '').replace(/\*/g, '').trim();
    
    sections.push({
      heading: cleanHeading,
      body: parts[i+1]?.trim() ?? ""
    });
  }
  
  return sections.length > 0 ? sections : [{ heading: "Overview", body: processedDesc }];
}

export function normalizeInfoPanelData(entity: any, workflow: string = "unknown"): any {
    if (!entity) return null;

    const isPipelineWrapper = entity.pipelineVersion !== undefined && entity.subject !== undefined;
    
    let normalized: any = {};

    if (isPipelineWrapper) {
        const subject = entity.subject;
        const metadata = entity.metadata || {};
        const waypoint = metadata.waypoint || entity.waypoint;
        
        // Enforce canonical entity typing (Ignore AI metadata overrides)
        let finalEntityType = subject?.identity?.entityType;
        if (waypoint?.entityType === 'historical_waypoint' || waypoint?.entityType === 'route') {
            finalEntityType = waypoint.entityType;
        } else if (entity.entityType === 'historical_waypoint' || entity.entityType === 'route') {
            finalEntityType = entity.entityType;
        }

        const hasRootMetadata = ['description', 'population', 'climate', 'contextNotes', 'historicalPeriod', 'significance', 'highlights'].some(key => entity[key] !== undefined);
        if (hasRootMetadata) {
            console.warn("DEPRECATION: ResolvedEntity metadata found on root object. This violates the canonical metadata contract. Use entity.metadata instead.");
        }

        // --- Extract Display Primitives from Structured Metadata ---

        // description
        const rawDesc = metadata.description || entity.description;
        let description = typeof rawDesc === "string" ? rawDesc : rawDesc?.text ?? "";
        
        // Strip duplicate canonical name if present
        if (subject?.identity?.canonicalName) {
            description = removeLeadingEntityTitle(description, subject.identity.canonicalName);
        }
        
        const descriptionSections = parseDescriptionSections(description);

        // population (InfoPanel expects { historical?: { formattedValue, timeframe }, current?: { formattedValue } })
        let population = undefined;
        const rawPop = metadata.population || entity.population;
        if (rawPop) {
            if (rawPop.historical || rawPop.current) {
                population = {
                    historical: rawPop.historical ? {
                        formattedValue: rawPop.historical.formattedValue ?? String(rawPop.historical.value ?? ""),
                        timeframe: rawPop.historical.timeframe
                    } : undefined,
                    current: rawPop.current ? {
                        formattedValue: rawPop.current.formattedValue ?? String(rawPop.current.value ?? "")
                    } : undefined
                };
            } else if (rawPop.value) {
                // Handle fallback from recoverLocationMetadata
                population = { current: { formattedValue: rawPop.value.formattedValue ?? String(rawPop.value) } };
            } else if (typeof rawPop === "string" || typeof rawPop === "number") {
                population = { current: { formattedValue: String(rawPop) } };
            } else {
                population = rawPop;
            }
            if (population && !population.historical && !population.current) population = undefined;
        }

        // climate (InfoPanel expects { name, koppenCode })
        let climate = undefined;
        const rawClimate = metadata.climate || entity.climate;
        if (rawClimate) {
            climate = typeof rawClimate === "string" 
                ? { name: rawClimate } 
                : { 
                    name: rawClimate.name ?? rawClimate.value ?? "", 
                    koppenCode: rawClimate.koppenCode ?? rawClimate.description ?? "" 
                  };
            if (!climate.name) climate = undefined;
        }

        // contextNotes (InfoPanel expects string[])
        let contextNotes = undefined;
        const rawNotes = metadata.contextNotes || entity.contextNotes;
        if (Array.isArray(rawNotes)) {
            contextNotes = rawNotes.map((note: any) => typeof note === "string" ? note : note.text ?? JSON.stringify(note));
        }

        // relatedEntities (InfoPanel expects { type, name }[])
        let relatedEntities = undefined;
        const rawEntities = metadata.relatedEntities || entity.relatedEntities;
        if (Array.isArray(rawEntities)) {
            relatedEntities = rawEntities.map((e: any) => {
                if (typeof e === 'string') return { name: e, type: 'Other' };
                return {
                    name: e.name ?? "Unknown",
                    type: e.entityType ?? e.customRelationship ?? e.type ?? "Other"
                };
            });
        }

        // news (InfoPanel expects { title, url, source, publishedAt })
        let news = undefined;
        const rawNews = metadata.news || entity.news;
        if (Array.isArray(rawNews)) {
            news = rawNews.map((n: any) => ({
                title: typeof n.title === 'string' ? n.title : n.title?.text ?? n.title,
                url: n.url,
                source: typeof n.source === 'string' ? n.source : n.source?.name ?? n.source,
                publishedAt: n.publishedAt
            }));
        }

        // entities (from waypoint)
        let entities = metadata.waypoint?.entities || metadata.entities;
        if (Array.isArray(entities)) {
            entities = entities.map((e: any) => typeof e === 'string' ? e : e.name ?? e.text ?? JSON.stringify(e));
        }

        normalized = {
            name: subject?.identity?.canonicalName || subject?.primaryLocation?.label,
            canonicalName: subject?.identity?.canonicalName,
            coordinates: subject?.primaryLocation?.location?.coordinates,
            description,
            descriptionSections,
            entityType: finalEntityType,
            population,
            climate,
            news,
            relatedEntities,
            contextNotes,
            historicalPeriod: metadata.waypoint?.historicalPeriod || metadata.historicalPeriod || entity.historicalPeriod,
            significance: metadata.waypoint?.significance || metadata.significance || entity.significance,
            highlights: metadata.waypoint?.highlights || metadata.highlights || entity.highlights,
            entities,
            routeContext: metadata.routeContext || (metadata.waypoint ? metadata.waypoint.routeContext : undefined),
            waypoint: metadata.waypoint,
            status: metadata.status || entity.status || "success",
            errorMessage: metadata.errorMessage || entity.errorMessage,
            sectionState: metadata.sectionState || entity.sectionState,
            isApproximate: entity.isApproximate ?? (entity.subject?.identity as any)?.isApproximate ?? (entity.subject?.primaryLocation as any)?.isApproximate,
            exactLocationKnown: entity.exactLocationKnown ?? (entity.subject?.identity as any)?.exactLocationKnown ?? (entity.subject?.primaryLocation as any)?.exactLocationKnown,
            coordinateSource: entity.coordinateSource ?? (entity.subject?.identity as any)?.coordinateSource ?? (entity.subject?.primaryLocation as any)?.coordinateSource,
            historicalContext: (metadata as any).historicalContext || (entity as any).historicalContext,
            intent: (metadata as any).intent || (entity as any).intent,
            // Fallback for remaining unstructured fields
            ...metadata
        };
        
        // Re-overwrite fields that were extracted above (to prevent ...metadata from overwriting them with raw objects)
        normalized.name = subject?.identity?.canonicalName || normalized.name;
        normalized.description = description;
        normalized.descriptionSections = descriptionSections;
        normalized.population = population;
        normalized.climate = climate;
        normalized.news = news;
        normalized.relatedEntities = relatedEntities;
        normalized.contextNotes = contextNotes;
        normalized.entities = entities;
        if (Array.isArray(normalized.notable)) {
            normalized.notable = deduplicateNotableFacts(normalized.notable);
        }

    } else {
        // If it's already flattened, extract just in case it has structured objects injected directly
        normalized = { 
            ...entity,
            status: entity.status || "success",
            errorMessage: entity.errorMessage
        };
        
        if (normalized.description && typeof normalized.description !== 'string') {
            normalized.description = normalized.description.text ?? "";
        }
        
        if (normalized.description) {
            normalized.description = removeLeadingEntityTitle(normalized.description, normalized.canonicalName || normalized.name);
            normalized.description = stripMarkdownFormatting(normalized.description);
            normalized.descriptionSections = parseDescriptionSections(normalized.description);
        }
        
        if (Array.isArray(normalized.contextNotes)) {
            normalized.contextNotes = normalized.contextNotes.map((note: any) => typeof note === "string" ? note : note.text ?? JSON.stringify(note));
        }

        if (Array.isArray(normalized.notable)) {
            normalized.notable = deduplicateNotableFacts(normalized.notable);
        }
    }

    // Diagnostics and Validation
    const hasName = Boolean(normalized.name);
    const hasCanonicalName = Boolean(normalized.canonicalName);
    const hasCoordinates = Boolean(normalized.coordinates?.lat !== undefined && normalized.coordinates?.lng !== undefined);
    const hasDescription = Boolean(normalized.description);

    console.log(`=== INFOPANEL DISPLAY MODEL ===`);
    console.log(`description:\ntype=${typeof normalized.description}\nvalue=${String(normalized.description).substring(0,20)}...`);
    console.log(`population:\ntype=${typeof normalized.population}\nvalue=${normalized.population ? 'object' : 'undefined'}`);
    console.log(`climate:\ntype=${typeof normalized.climate}\nvalue=${normalized.climate ? 'object' : 'undefined'}`);
    console.log(`contextNotes:\ntype=${typeof normalized.contextNotes}\nvalue=${normalized.contextNotes ? 'array' : 'undefined'}`);
    
    // Check for unmapped renderable fields that are still objects
    if (normalized.description && typeof normalized.description === 'object') {
        console.warn(`WARNING: description is an object with keys: ${Object.keys(normalized.description)}`);
    }
    if (normalized.contextNotes && Array.isArray(normalized.contextNotes) && normalized.contextNotes.some((n: any) => typeof n === 'object')) {
        console.warn(`WARNING: contextNotes contains object items`);
    }
    
    console.log(`===============================`);
    
    console.log(`=== BOUNDARY LOG 3: After normalizeInfoPanelData ===`);
    console.log(`final display model:`, JSON.stringify(normalized, null, 2));
    console.log(`title: ${normalized.name}`);
    console.log(`description: ${normalized.description}`);
    console.log(`climate: ${normalized.climate}`);
    console.log(`contextNotes: ${normalized.contextNotes}`);
    console.log(`====================================================`);

    if (!hasName && !hasCanonicalName && !hasCoordinates) {
        console.error(`=== INFOPANEL RENDER BLOCKED ===\nInvalid payload. Missing name and coordinates.`);
        console.error(`Keys: ${Object.keys(entity).join(', ')}`);
        console.error(`Type: ${isPipelineWrapper ? 'PipelineWrapper' : 'Flattened'}`);
        console.error(`Workflow: ${workflow}`);
        console.trace();
    }

    return normalized;
}
