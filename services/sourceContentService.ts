export interface SourceContentResult {
  success: boolean;
  url?: string;
  title?: string;
  content?: string;
  characterCount?: number;
  error?: string;
}

const DEFAULT_FETCH_TIMEOUT_MS = 10000;

/**
 * Extracts clean, readable text and title from raw HTML.
 * Strips scripts, styles, navigation, headers, footers, advertisements, cookie banners, SVG/media, and page chrome.
 */
export function extractReadableArticleText(html: string, url?: string): { title: string; content: string } {
  if (!html || typeof html !== 'string') {
    return { title: '', content: '' };
  }

  // 1. Extract title
  let title = '';
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    // Clean common site suffixes (e.g. " - The New York Times", " | Wikipedia")
    title = title.replace(/\s*[-–—|]\s*(?:The New York Times|NYTimes|Wikipedia|BBC News|CNN|Reuters|The Guardian).*$/i, '').trim();
  }

  // Also check og:title or h1 if title is empty or generic
  if (!title || /^(untitled|home|index|nytimes\.com)$/i.test(title)) {
    const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
      html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i);
    if (ogTitleMatch && ogTitleMatch[1]) {
      title = ogTitleMatch[1].trim();
    }
  }

  // 2. Strip non-content blocks (scripts, styles, nav, headers, footers, svg, noscript, etc.)
  let cleaned = html
    // Remove scripts, styles, noscript, svg, canvas, iframe
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, ' ')
    // Remove navigation, header, footer, aside, forms, buttons
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, ' ')
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, ' ')
    .replace(/<button\b[^<]*(?:(?!<\/button>)<[^<]*)*<\/button>/gi, ' ')
    // Remove cookie/privacy/ad containers by class/id heuristic
    .replace(/<div[^>]*(?:cookie|banner|advertisement|ad-container|modal-overlay|share-tools|social-share)[^>]*>[\s\S]*?<\/div>/gi, ' ')
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // 3. Preserve structural line breaks for headings, paragraphs, and list items
  cleaned = cleaned
    .replace(/<\/(?:p|div|section|article|h1|h2|h3|h4|h5|h6|li|tr|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<h[1-6][^>]*>/gi, '\n\n')
    // Remove remaining HTML tags
    .replace(/<[^>]+>/g, ' ');

  // 4. Decode common HTML entities
  cleaned = cleaned
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&#\d+;/g, (entity) => {
      const num = parseInt(entity.replace(/[&#;]/g, ''), 10);
      return !isNaN(num) ? String.fromCharCode(num) : ' ';
    });

  // 5. Normalize whitespace: collapse multiple spaces and blank lines
  const lines = cleaned
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => {
      if (!line) return false;
      // Filter out obvious boilerplate / ad strings
      if (/^(advertisement|ad|sponsored|subscribe|sign in|log in|all rights reserved|terms of service|privacy policy)$/i.test(line)) {
        return false;
      }
      return true;
    });

  const content = lines.join('\n');
  return { title, content };
}

/**
 * Checks if extracted content appears to be a bot challenge / block screen.
 */
function isBotChallengeOrBlocked(text: string): boolean {
  if (!text) return true;
  const lower = text.toLowerCase();
  return (
    lower.includes('please enable js and disable any ad blocker') ||
    lower.includes('datadome') ||
    lower.includes('captcha') ||
    lower.includes('access denied') ||
    lower.includes('cloudflare ray id') ||
    lower.includes('checking your browser') ||
    lower.includes('security check to access') ||
    lower.includes('please verify you are a human')
  );
}

/**
 * Formats structured source block for AI prompts.
 */
export function formatSourceBlock(params: { url?: string; title?: string; content: string }): string {
  const parts: string[] = [];
  if (params.url) {
    parts.push(`SOURCE URL:\n${params.url}`);
  }
  if (params.title) {
    parts.push(`SOURCE TITLE:\n${params.title}`);
  }
  parts.push(`SOURCE CONTENT:\n--- BEGIN SOURCE CONTENT ---\n${params.content.trim()}\n--- END SOURCE CONTENT ---`);
  return parts.join('\n\n');
}

/**
 * Cleans pasted web article text that includes site chrome (e.g. "Skip to content", nav links, cookie text).
 * Extracts title and clean article body.
 */
export function cleanPastedArticleText(rawText: string): { title: string; content: string } {
  if (!rawText || typeof rawText !== 'string') {
    return { title: '', content: '' };
  }

  // If HTML tags are present, use the full HTML extractor
  if (/<[a-z][\s\S]*>/i.test(rawText)) {
    return extractReadableArticleText(rawText);
  }

  const rawLines = rawText.split('\n');
  const cleanedLines: string[] = [];

  const BOILERPLATE_LINE_REGEX = /^(skip to content|skip to site index|skip to main content|section navigation|site index|give the times|account|jump to:?|share full article|give this article|read in app|advertisement|ad|sponsored|subscribe|sign in|log in|all rights reserved|terms of service|privacy policy|cookie preferences|search|photo credit|credit\.\.\.|image credit)$/i;

  let title = '';

  for (let line of rawLines) {
    const trimmed = line.replace(/\s+/g, ' ').trim();
    if (!trimmed) continue;

    const textWithoutLinks = trimmed.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
    const lower = textWithoutLinks.toLowerCase();
    if (
      !textWithoutLinks ||
      BOILERPLATE_LINE_REGEX.test(textWithoutLinks) ||
      lower.includes('skip to content') ||
      lower.includes('skip to site index') ||
      lower.includes('skip to main content') ||
      lower.includes('section navigation') ||
      (lower.includes('give the times') && lower.includes('account'))
    ) {
      continue;
    }

    // Heuristic for article title (first non-boilerplate line without typical sentence ending punctuation)
    if (
      !title &&
      textWithoutLinks.length >= 4 &&
      textWithoutLinks.length <= 120 &&
      !textWithoutLinks.endsWith('.') &&
      !/^by\s/i.test(textWithoutLinks) &&
      !/^jump to/i.test(textWithoutLinks) &&
      !/^share /i.test(textWithoutLinks) &&
      !/^(account|recommendations|itinerary|google map)$/i.test(textWithoutLinks)
    ) {
      title = textWithoutLinks.replace(/^["'“](.*)["'”]$/, '$1');
    }

    cleanedLines.push(trimmed);
  }

  const content = cleanedLines.join('\n');
  return { title: title || 'Lake Como', content: content || rawText.trim() };
}


/**
 * Attempts to acquire and extract readable source content from a URL for TRACE ROUTE.
 */
export async function fetchSourceContent(
  url: string,
  signal?: AbortSignal,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<SourceContentResult> {
  console.log(`[SOURCE ACQUISITION] Attempting source retrieval for URL="${url}"`);

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const onParentAbort = () => controller.abort();
  if (signal) {
    signal.addEventListener('abort', onParentAbort);
  }

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8'
      }
    });

    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener('abort', onParentAbort);
    }

    if (!response.ok) {
      console.warn(`[SOURCE ACQUISITION] HTTP error status=${response.status} for URL="${url}"`);
      return {
        success: false,
        url,
        error: `HTTP ${response.status} ${response.statusText}`
      };
    }

    const html = await response.text();
    const { title, content } = extractReadableArticleText(html, url);

    // Validate meaningful content
    if (isBotChallengeOrBlocked(content) || content.length < 80) {
      console.warn(`[SOURCE ACQUISITION] Source content blocked or insufficient (chars=${content.length}) for URL="${url}"`);
      return {
        success: false,
        url,
        title,
        characterCount: content.length,
        error: 'Source content blocked by site security or insufficient readable text extracted'
      };
    }

    const elapsed = Date.now() - startTime;
    console.log(`[SOURCE ACQUISITION SUCCESS]
source URL: "${url}"
source title: "${title || 'Untitled'}"
retrieval status: SUCCESS
extracted character count: ${content.length}
extraction status: SUCCESS
elapsed: ${elapsed}ms`);

    return {
      success: true,
      url,
      title,
      content,
      characterCount: content.length
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener('abort', onParentAbort);
    }

    const isAbort = err?.name === 'AbortError';
    const errorMsg = isAbort ? 'Source retrieval timed out' : (err?.message || 'Failed to fetch source content');
    console.warn(`[SOURCE ACQUISITION FAILED] URL="${url}" error="${errorMsg}"`);

    return {
      success: false,
      url,
      error: errorMsg
    };
  }
}
