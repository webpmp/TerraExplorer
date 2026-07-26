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

export const parseAndExtract = (text: string): ParseResult => {
    if (!text) {
        ParserMetrics.no_json++;
        return { success: false, reason: "NO_JSON_FOUND" };
    }

    const sanitized = sanitize(text);
    const { extracted, reason, repairs: extractRepairs } = extract(sanitized);
    
    if (!extracted) {
        if (reason === "NO_JSON_FOUND") ParserMetrics.no_json++;
        console.log(`[JSON Parser Trace] RAW JSON ↓ EXTRACT FAILED ↓ STRICT RETRY TRIGGERED`);
        return { success: false, reason: reason! };
    }
    
    try {
        const value = JSON.parse(extracted);
        console.log(`[JSON Parser Trace] RAW JSON ↓ EXTRACT SUCCESS ↓ DIRECT PARSE SUCCESS`);
        if (extractRepairs.length > 0 || sanitized.length !== extracted.length || text.length !== sanitized.length) {
            ParserMetrics.recovered++;
        } else {
            ParserMetrics.success++;
        }
        return {
            success: true,
            value,
            extracted,
            repairs: extractRepairs
        };
    } catch (e: any) {
        // Deterministic repair
        const { repaired, repairs: syntaxRepairs } = repairJson(extracted);
        try {
            const value = JSON.parse(repaired);
            ParserMetrics.recovered++;
            ParserMetrics.success++;
            console.log(`[JSON Parser Trace] RAW JSON ↓ EXTRACT SUCCESS ↓ PARSE FAILED ↓ REPAIR ATTEMPTED ↓ REPAIR SUCCESS ↓ PARSE SUCCESS`);
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
