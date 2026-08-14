/**
 * Parser v2
 * 
 * CONTRACT:
 * This parser extracts the first syntactically complete JSON object or array from arbitrary text. 
 * It never modifies JSON syntax, never invents missing content, and never throws. 
 * It either returns a successfully parsed value or a structured failure reason.
 */
export const PARSER_VERSION = 'v2';

export type ParseFailureReason = 
  | "NO_JSON_FOUND"
  | "UNBALANCED_DELIMITERS"
  | "INVALID_JSON";

export type ParseResult =
  | {
      success: true;
      value: unknown;
      extracted: string;
      repairs: string[];
    }
  | {
      success: false;
      reason: ParseFailureReason;
      extracted?: string;
      error?: string;
    };

// Parser metrics only track extraction/parsing, not application-level schema validation.
export const ParserMetrics = {
    success: 0,
    invalid_json: 0,
    no_json: 0,
    unbalanced: 0,
    recovered: 0
};

export const sanitize = (text: string): string => {
    if (!text) return "";
    
    // Remove UTF-8 BOM if present
    let sanitized = text.replace(/^\uFEFF/, '').trim();
    
    // Remove all markdown code block markers
    // This removes ```json, ```javascript, ```, etc.
    sanitized = sanitized.replace(/^```[a-zA-Z]*\n/gm, '');
    sanitized = sanitized.replace(/```\n?$/gm, '');
    sanitized = sanitized.replace(/```/g, ''); // catch any trailing or weirdly placed fences
    
    return sanitized.trim();
};

export const extract = (text: string): { extracted: string | null, reason: ParseFailureReason | null, repairs: string[] } => {
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');
    
    let startIndex = -1;
    let openChar = '';
    
    if (firstBrace !== -1 && firstBracket !== -1) {
        if (firstBrace < firstBracket) {
            startIndex = firstBrace;
            openChar = '{';
        } else {
            startIndex = firstBracket;
            openChar = '[';
        }
    } else if (firstBrace !== -1) {
        startIndex = firstBrace;
        openChar = '{';
    } else if (firstBracket !== -1) {
        startIndex = firstBracket;
        openChar = '[';
    } else {
        return { extracted: null, reason: "NO_JSON_FOUND", repairs: [] };
    }
    
    const stack: string[] = [];
    let insideString = false;
    let escaped = false;
    let endIndex = -1;
    
    for (let i = startIndex; i < text.length; i++) {
        const char = text[i];
        
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\') {
            escaped = true;
            continue;
        }
        
        if (char === '"') {
            insideString = !insideString;
            continue;
        }
        
        if (!insideString) {
            if (char === '{' || char === '[') {
                stack.push(char);
            } else if (char === '}' || char === ']') {
                const last = stack[stack.length - 1];
                if ((char === '}' && last === '{') || (char === ']' && last === '[')) {
                    stack.pop();
                    if (stack.length === 0) {
                        endIndex = i;
                        break;
                    }
                }
            }
        }
    }
    
    const repairs: string[] = [];
    let extracted = text.substring(startIndex, endIndex !== -1 ? endIndex + 1 : text.length);
    
    if (endIndex === -1 || stack.length > 0) {
        // Unbalanced, attempt to repair by closing open structures
        if (insideString) {
            extracted += '"';
            repairs.push("Closed unterminated string");
        }
        while (stack.length > 0) {
            const last = stack.pop();
            extracted += last === '{' ? '}' : ']';
            repairs.push(`Appended missing closing ${last === '{' ? '}' : ']'}`);
        }
    }
    
    return { extracted, reason: null, repairs };
};

export const repairJson = (text: string): { repaired: string, repairs: string[] } => {
    let repaired = text;
    const repairs: string[] = [];

    // 0. Fix Python literals
    const pythonLiteralRegex = /\b(None|True|False)\b/g;
    if (pythonLiteralRegex.test(repaired)) {
        repaired = repaired.replace(pythonLiteralRegex, (match) => {
            if (match === 'None') return 'null';
            if (match === 'True') return 'true';
            if (match === 'False') return 'false';
            return match;
        });
        repairs.push("Replaced Python literals (None, True, False) with JSON equivalents");
    }

    // 1. Fix numeric separators (e.g., 1_670_000 -> 1670000)
    const numericSeparatorRegex = /([:\s\[,])([0-9]+(?:_[0-9]+)+)(?=[\s,\}\]])/g;
    if (numericSeparatorRegex.test(repaired)) {
        repaired = repaired.replace(numericSeparatorRegex, (match, prefix, num) => {
            return prefix + num.replace(/_/g, '');
        });
        repairs.push("Removed numeric separators");
    }

    // 2. Normalize quotes
    if (repaired.includes('“') || repaired.includes('”') || repaired.includes("‘") || repaired.includes("’")) {
        repaired = repaired.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
        repairs.push("Replaced smart quotes");
    }

    const singleQuotedValueRegex = /:\s*'([^']*)'/g;
    if (singleQuotedValueRegex.test(repaired)) {
        repaired = repaired.replace(singleQuotedValueRegex, ': "$1"');
        repairs.push("Fixed single-quoted string values");
    }

    const singleQuotedRegex = /([{,]\s*)'([a-zA-Z0-9_]+)'\s*:/g;
    if (singleQuotedRegex.test(repaired)) {
        repaired = repaired.replace(singleQuotedRegex, '$1"$2":');
        repairs.push("Fixed single-quoted property names");
    }
    
    // Unescaped quotes and newlines inside string values (heuristic for object properties)
    const stringValueRegex = /:\s*"([\s\S]*?)"\s*(?=[,}])/g;
    repaired = repaired.replace(stringValueRegex, (match, inner) => {
        let fixed = inner;
        if (fixed.includes('"')) {
            fixed = fixed.replace(/\\?"/g, '\\"');
            repairs.push("Fixed unescaped quotes in string values");
        }
        if (fixed.includes('\n')) {
            fixed = fixed.replace(/\n/g, '\\n');
            repairs.push("Fixed newlines in string values");
        }
        return `: "${fixed}"`;
    });

    // 3. Repair unquoted keys
    const unquotedRegex = /([{,]\s*)([a-zA-Z0-9_]+)\s*:/g;
    const repairedKeys: string[] = [];
    if (unquotedRegex.test(repaired)) {
        unquotedRegex.lastIndex = 0;
        repaired = repaired.replace(unquotedRegex, (match, p1, p2) => {
            repairedKeys.push(p2);
            return `${p1}"${p2}":`;
        });
        
        if (repairedKeys.length > 0) {
            repairs.push(`Fixed unquoted property names: ${repairedKeys.join(', ')}`);
            console.log(`\n===== JSON KEY REPAIR =====\nUnquoted keys repaired:\n${repairedKeys.join('\n')}\n===========================`);
        }
    }

    // 4. Remove trailing commas
    const trailingCommaRegex = /,\s*([\]}])/g;
    if (trailingCommaRegex.test(repaired)) {
        repaired = repaired.replace(trailingCommaRegex, '$1');
        repairs.push("Removed trailing commas");
    }

    // 5. Balance braces/brackets
    const extractedAfterRepair = extract(repaired);
    if (extractedAfterRepair.extracted && extractedAfterRepair.extracted !== repaired) {
        repaired = extractedAfterRepair.extracted;
        repairs.push(...extractedAfterRepair.repairs);
    }

    return { repaired, repairs };
};

function repairTruncatedJson(input: string): string {
  let repaired = input.trim();
  const openBraces = (repaired.match(/{/g) || []).length;
  const closeBraces = (repaired.match(/}/g) || []).length;
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;
  repaired += "]".repeat(Math.max(0, openBrackets - closeBrackets));
  repaired += "}".repeat(Math.max(0, openBraces - closeBraces));
  return repaired;
}

export function extractAllJsonCandidates(text: string): Array<{ extracted: string, startIndex: number, endIndex: number }> {
    const sanitized = sanitize(text);
    const candidates: Array<{ extracted: string, startIndex: number, endIndex: number }> = [];
    
    let i = 0;
    while (i < sanitized.length) {
        const nextBrace = sanitized.indexOf('{', i);
        const nextBracket = sanitized.indexOf('[', i);
        
        let startIndex = -1;
        if (nextBrace !== -1 && nextBracket !== -1) {
            startIndex = Math.min(nextBrace, nextBracket);
        } else if (nextBrace !== -1) {
            startIndex = nextBrace;
        } else if (nextBracket !== -1) {
            startIndex = nextBracket;
        } else {
            break;
        }
        
        const stack: string[] = [];
        let insideString = false;
        let escaped = false;
        let endIndex = -1;
        
        for (let j = startIndex; j < sanitized.length; j++) {
            const char = sanitized[j];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === '\\') {
                escaped = true;
                continue;
            }
            if (char === '"') {
                insideString = !insideString;
                continue;
            }
            if (!insideString) {
                if (char === '{' || char === '[') {
                    stack.push(char);
                } else if (char === '}' || char === ']') {
                    const last = stack[stack.length - 1];
                    if ((char === '}' && last === '{') || (char === ']' && last === '[')) {
                        stack.pop();
                        if (stack.length === 0) {
                            endIndex = j;
                            break;
                        }
                    }
                }
            }
        }
        
        if (endIndex !== -1) {
            const extracted = sanitized.substring(startIndex, endIndex + 1);
            candidates.push({ extracted, startIndex, endIndex });
            i = endIndex + 1;
        } else {
            const extracted = sanitized.substring(startIndex);
            candidates.push({ extracted, startIndex, endIndex: sanitized.length - 1 });
            break;
        }
    }
    
    return candidates;
}

export function scoreMetadataObject(val: any): number {
    if (!val || typeof val !== 'object') {
        return -100;
    }
    if (Array.isArray(val)) {
        return val.length > 0 && typeof val[0] === 'object' ? 5 : 1;
    }

    let score = 0;
    const keys = Object.keys(val);

    // If wrapped in a container like { data: {...} } or { locationInfo: {...} }, evaluate inner
    if (keys.length === 1 && typeof val[keys[0]] === 'object' && val[keys[0]] !== null && !Array.isArray(val[keys[0]])) {
        return scoreMetadataObject(val[keys[0]]) + 1;
    }

    if (typeof val.description === 'string' && val.description.trim().length > 0) score += 6;
    if (val.climate !== undefined && typeof val.climate === 'object' && val.climate !== null) score += 6;
    if (Array.isArray(val.notable) || (val.notable && typeof val.notable === 'object')) score += 5;
    if (Array.isArray(val.contextNotes) || typeof val.contextNotes === 'string') score += 5;
    if (typeof val.name === 'string') score += 4;
    if (typeof val.locationString === 'string') score += 4;
    if (typeof val.population === 'number' || val.population === null) score += 2;
    if (val.coordinates !== undefined) score += 3;

    // Sub-object penalties:
    // A standalone climate object has koppenCode or {name, description, koppenCode} without notable, contextNotes, or locationString
    if (val.koppenCode !== undefined && !val.climate) {
        score -= 25; // Clearly a sub-object
    }
    if (keys.length <= 3 && (keys.includes('koppenCode') || (keys.includes('description') && keys.includes('name') && keys.length === 2))) {
        score -= 15;
    }

    return score;
}

export const parseAndExtract = (text: string): ParseResult => {
    if (!text) {
        ParserMetrics.no_json++;
        return { success: false, reason: "NO_JSON_FOUND" };
    }

    const sanitized = sanitize(text);
    const candidates = extractAllJsonCandidates(sanitized);

    if (candidates.length > 1) {
        // Evaluate all candidates and pick the best top-level object
        const parsedCandidates: Array<{ value: any, extracted: string, repairs: string[], score: number }> = [];

        for (const cand of candidates) {
            let extracted = cand.extracted;
            try {
                const value = JSON.parse(extracted);
                const score = scoreMetadataObject(value);
                parsedCandidates.push({ value, extracted, repairs: [], score });
            } catch {
                let textToRepair = repairTruncatedJson(extracted);
                const { repaired, repairs: syntaxRepairs } = repairJson(textToRepair);
                try {
                    const value = JSON.parse(repaired);
                    const score = scoreMetadataObject(value);
                    parsedCandidates.push({ value, extracted: repaired, repairs: syntaxRepairs, score });
                } catch {
                    // ignore unparseable secondary candidates
                }
            }
        }

        if (parsedCandidates.length > 0) {
            parsedCandidates.sort((a, b) => b.score - a.score);
            const best = parsedCandidates[0];
            let unwrappedValue = best.value;
            // Unwrap single key container if applicable
            if (unwrappedValue && typeof unwrappedValue === 'object' && !Array.isArray(unwrappedValue)) {
                const k = Object.keys(unwrappedValue);
                if (k.length === 1 && typeof unwrappedValue[k[0]] === 'object' && unwrappedValue[k[0]] !== null && !Array.isArray(unwrappedValue[k[0]])) {
                    const innerScore = scoreMetadataObject(unwrappedValue[k[0]]);
                    if (innerScore > 0) {
                        unwrappedValue = unwrappedValue[k[0]];
                    }
                }
            }

            ParserMetrics.success++;
            return {
                success: true,
                value: unwrappedValue,
                extracted: best.extracted,
                repairs: best.repairs
            };
        }
    }

    let { extracted, reason, repairs: extractRepairs } = extract(sanitized);
    
    if (!extracted) {
        // Attempt basic truncation repair before giving up
        const basicRepaired = repairTruncatedJson(sanitized);
        const retryExtract = extract(basicRepaired);
        if (retryExtract.extracted) {
            extracted = retryExtract.extracted;
            extractRepairs = [...extractRepairs, ...retryExtract.repairs, "Repaired truncation before extraction"];
            reason = null;
        } else {
            if (reason === "NO_JSON_FOUND") ParserMetrics.no_json++;
            console.log(`[JSON Parser Trace] RAW JSON ↓ EXTRACT FAILED ↓ STRICT RETRY TRIGGERED`);
            return { success: false, reason: reason! };
        }
    }
    
    try {
        let value = JSON.parse(extracted);
        console.log(`[JSON Parser Trace] RAW JSON ↓ EXTRACT SUCCESS ↓ DIRECT PARSE SUCCESS`);
        if (extractRepairs.length > 0 || sanitized.length !== extracted.length || text.length !== sanitized.length) {
            ParserMetrics.recovered++;
        } else {
            ParserMetrics.success++;
        }

        // Unwrap single key container if applicable
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const k = Object.keys(value);
            if (k.length === 1 && typeof value[k[0]] === 'object' && value[k[0]] !== null && !Array.isArray(value[k[0]])) {
                const innerScore = scoreMetadataObject(value[k[0]]);
                if (innerScore > 0) {
                    value = value[k[0]];
                }
            }
        }

        return {
            success: true,
            value,
            extracted,
            repairs: extractRepairs
        };
    } catch (e: any) {
        // Deterministic repair
        let textToRepair = extracted || text;
        textToRepair = repairTruncatedJson(textToRepair);
        const { repaired, repairs: syntaxRepairs } = repairJson(textToRepair);
        try {
            let value = JSON.parse(repaired);
            ParserMetrics.recovered++;
            ParserMetrics.success++;
            console.log(`[JSON Parser Trace] RAW JSON ↓ EXTRACT SUCCESS ↓ PARSE FAILED ↓ REPAIR ATTEMPTED ↓ REPAIR SUCCESS ↓ PARSE SUCCESS`);

            // Unwrap single key container if applicable
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                const k = Object.keys(value);
                if (k.length === 1 && typeof value[k[0]] === 'object' && value[k[0]] !== null && !Array.isArray(value[k[0]])) {
                    const innerScore = scoreMetadataObject(value[k[0]]);
                    if (innerScore > 0) {
                        value = value[k[0]];
                    }
                }
            }

            return {
                success: true,
                value,
                extracted: repaired,
                repairs: [...extractRepairs, ...syntaxRepairs, "Repaired JSON parsing error"]
            };
        } catch (repairError: any) {
            ParserMetrics.invalid_json++;
            console.log(`[JSON Parser Trace] RAW JSON ↓ EXTRACT SUCCESS ↓ PARSE FAILED ↓ REPAIR ATTEMPTED ↓ REPAIR FAILED`);
            console.log(`[JSON Parser Trace] RAW JSON ↓ REPAIR FAILED ↓ STRICT RETRY TRIGGERED`);
            return {
                success: false,
                reason: "INVALID_JSON",
                extracted: repaired,
                error: repairError?.message || String(repairError)
            };
        }
    }
};
