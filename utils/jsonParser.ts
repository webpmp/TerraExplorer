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

export const extract = (text: string): { extracted: string | null, reason: ParseFailureReason | null } => {
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');
    
    let startIndex = -1;
    let openChar = '';
    let closeChar = '';
    
    if (firstBrace !== -1 && firstBracket !== -1) {
        if (firstBrace < firstBracket) {
            startIndex = firstBrace;
            openChar = '{';
            closeChar = '}';
        } else {
            startIndex = firstBracket;
            openChar = '[';
            closeChar = ']';
        }
    } else if (firstBrace !== -1) {
        startIndex = firstBrace;
        openChar = '{';
        closeChar = '}';
    } else if (firstBracket !== -1) {
        startIndex = firstBracket;
        openChar = '[';
        closeChar = ']';
    } else {
        return { extracted: null, reason: "NO_JSON_FOUND" };
    }
    
    // Explicit State Machine
    let depth = 0;
    let insideString = false;
    let escaped = false;
    let endIndex = -1;
    
    for (let i = startIndex; i < text.length; i++) {
        const char = text[i];
        
        // Handle escaping
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\') {
            escaped = true;
            continue;
        }
        
        // Toggle strings
        if (char === '"') {
            insideString = !insideString;
            continue;
        }
        
        // Delimiter matching
        if (!insideString) {
            if (char === openChar) {
                depth++;
            } else if (char === closeChar) {
                depth--;
                if (depth === 0) {
                    endIndex = i;
                    break;
                }
            }
        }
    }
    
    if (depth !== 0 || endIndex === -1) {
        return { extracted: null, reason: "UNBALANCED_DELIMITERS" };
    }
    
    return { 
        extracted: text.substring(startIndex, endIndex + 1),
        reason: null 
    };
};

export const parseAndExtract = (text: string): ParseResult => {
    if (!text) {
        ParserMetrics.no_json++;
        return { success: false, reason: "NO_JSON_FOUND" };
    }

    const sanitized = sanitize(text);
    const { extracted, reason } = extract(sanitized);
    
    if (!extracted) {
        if (reason === "NO_JSON_FOUND") ParserMetrics.no_json++;
        else if (reason === "UNBALANCED_DELIMITERS") ParserMetrics.unbalanced++;
        return { success: false, reason: reason! };
    }
    
    try {
        const value = JSON.parse(extracted);
        
        // Track if it required recovery
        if (sanitized.length !== extracted.length || text.length !== sanitized.length) {
            ParserMetrics.recovered++;
        }
        ParserMetrics.success++;
        
        return {
            success: true,
            value,
            extracted,
            repairs: []
        };
    } catch (e: any) {
        ParserMetrics.invalid_json++;
        return {
            success: false,
            reason: "INVALID_JSON",
            extracted,
            error: e?.message || String(e)
        };
    }
};
