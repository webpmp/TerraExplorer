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
 * Detects if a text block appears to be pasted from Wikipedia.
 */
export function isWikipediaPaste(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const sample = text.slice(0, 5000) + ' ' + text.slice(-5000);
  let score = 0;
  if (/wikipedia/i.test(sample)) score += 2;
  if (/the free encyclopedia/i.test(sample)) score += 3;
  if (/contents\s*[\n\r]+\s*(?:hide|top)/i.test(sample) || /jump to content/i.test(sample)) score += 3;
  if (/(?:article|talk)\s+read\s+edit\s+view history/i.test(sample) || /(?:read|edit|view history)/i.test(sample)) score += 2;
  if (/appearance\s*[\n\r]+\s*text\s*[\n\r]+\s*small\s+standard\s+large/i.test(sample) || /appearance controls/i.test(sample)) score += 3;
  if (/listen to this article/i.test(sample)) score += 2;
  if (/donate\s+create account\s+log in/i.test(sample) || (/donate/i.test(sample) && /create account/i.test(sample))) score += 2;
  if (/wikimedia/i.test(sample)) score += 1;
  return score >= 4;
}

/**
 * Strips Wikipedia page chrome, appearance controls, table of contents headers, and navigation UI.
 */
function cleanWikipediaPastedText(rawText: string): { title: string; content: string } {
  const lines = rawText.split(/\r?\n/);
  const cleanedLines: string[] = [];
  let title = '';
  let inAppearanceBlock = false;
  let inTocBlock = false;
  let inNavbox = false;
  let leadFound = false;

  // Regexes for lines that are strictly Wikipedia chrome / UI
  const WIKI_UI_EXACT_REGEX = /^(?:wikipedia|the free encyclopedia|jump to content|main menu|search|search wikipedia|donate|create account|log in|personal tools|navigation|contribute|tools|print\/export|in other projects|languages|toggle the table of contents|contents\s*hide|contents\s*show|hide\s*top|show\s*top|view history|read\s*edit\s*view history|article\s*talk|talk\s*read\s*edit|edit this page|view history|appearance\s*hide|appearance\s*show|listen to this article|listen to this article\s*\(.*?\)|download as pdf|printable version|permanent link|page information|cite this page|get shortened url|download qr code|wikidata item|coordinate.*?\d+°\d+|coordinates|from wikipedia, the free encyclopedia|subsections)$/i;

  const WIKI_APPEARANCE_START = /^(?:appearance|appearance\s*hide|appearance\s*show)$/i;
  const WIKI_APPEARANCE_CONTROLS = /^(?:text\s*small\s*standard\s*large|width\s*standard\s*wide|color\s*automatic\s*light\s*dark|small\s*standard\s*large|standard\s*wide|automatic\s*light\s*dark|text|width|color)$/i;

  const WIKI_FOOTER_START = /^(?:see also|references|external links|further reading|bibliography|notes|sources|navigation menu|retrieved from "https:\/\/en\.wikipedia\.org\/.*?)$/i;
  const WIKI_NAV_CATEGORY = /^(?:categories\s*:|hidden categories\s*:|this page was last edited on|text is available under the creative commons|additional terms may apply|privacy policy|about wikipedia|disclaimers|contact wikipedia|code of conduct|developers|statistics|cookie statement|mobile view|wikimedia foundation|powered by mediawiki)$/i;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.replace(/\s+/g, ' ').trim();
    if (!trimmed) {
      if (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1] !== '') {
        cleanedLines.push('');
      }
      continue;
    }

    const textWithoutLinks = trimmed.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
    const lower = textWithoutLinks.toLowerCase();

    // 1. Detect start of Appearance controls block
    if (WIKI_APPEARANCE_START.test(textWithoutLinks) || lower === 'appearance') {
      inAppearanceBlock = true;
      continue;
    }
    if (inAppearanceBlock) {
      if (
        WIKI_APPEARANCE_CONTROLS.test(textWithoutLinks) ||
        /^(?:text|small|standard|large|width|wide|color|automatic|light|dark|hide|show)$/i.test(textWithoutLinks)
      ) {
        continue;
      } else {
        inAppearanceBlock = false;
      }
    }

    // 2. Detect and filter Table of Contents blocks if raw UI lines
    if (/^(?:contents|table of contents)\s*(?:hide|show)?$/i.test(textWithoutLinks)) {
      inTocBlock = true;
      continue;
    }
    if (inTocBlock) {
      // TOC lines usually look like "1 History", "1.1 Discovery", "2 Mechanism", "Top"
      if (/^(?:\d+(?:\.\d+)*\s+[A-Za-z]|top|hide|show)$/i.test(textWithoutLinks)) {
        continue;
      } else if (textWithoutLinks.length < 50 && /^\d+\s+/i.test(textWithoutLinks)) {
        continue;
      } else {
        inTocBlock = false;
      }
    }

    // 3. Skip obvious exact UI lines
    if (
      WIKI_UI_EXACT_REGEX.test(textWithoutLinks) ||
      /^(?:text|small|standard|large|width|wide|color|automatic|light|dark|tools)$/i.test(textWithoutLinks)
    ) {
      continue;
    }

    // 4. Skip combined menu UI lines
    if (
      (lower.includes('create account') && lower.includes('log in')) ||
      (lower.includes('read') && lower.includes('edit') && lower.includes('view history')) ||
      (lower.includes('article') && lower.includes('talk') && (lower.includes('read') || lower.includes('edit'))) ||
      (lower.includes('wikipedia') && lower.includes('the free encyclopedia')) ||
      lower.startsWith('jump to navigation') ||
      lower.startsWith('jump to search') ||
      lower.startsWith('listen to this article') ||
      lower === 'from wikipedia, the free encyclopedia'
    ) {
      continue;
    }

    // 5. Skip map / Wikimedia / OpenStreetMap widget boilerplate
    if (
      lower.includes('interactive map') ||
      lower.includes('openstreetmap contributors') ||
      lower.includes('wikimedia commons has media related to') ||
      lower.startsWith('map all coordinates using') ||
      lower.startsWith('download coordinates as')
    ) {
      continue;
    }

    // 6. Skip bottom category / license boilerplate
    if (
      WIKI_NAV_CATEGORY.test(textWithoutLinks) ||
      lower.startsWith('categories:') ||
      lower.startsWith('hidden categories:') ||
      lower.startsWith('retrieved from "http')
    ) {
      inNavbox = true;
      continue;
    }
    if (inNavbox && (lower.includes('categories:') || lower.includes('wikipedia') || textWithoutLinks.length < 60)) {
      continue;
    }

    // 7. Title extraction heuristic
    if (!title && !leadFound) {
      // If we encounter a prominent heading or bold subject before normal sentences
      if (
        textWithoutLinks.length >= 3 &&
        textWithoutLinks.length <= 120 &&
        !textWithoutLinks.endsWith('.') &&
        !WIKI_UI_EXACT_REGEX.test(textWithoutLinks) &&
        !/^(?:text|small|standard|large|width|wide|color|automatic|light|dark|tools|history|discovery|contents)$/i.test(textWithoutLinks)
      ) {
        title = textWithoutLinks.replace(/^#+\s*/, '').replace(/^["'“](.*)["'”]$/, '$1').trim();
      }
    }

    if (textWithoutLinks.length > 50 && textWithoutLinks.includes('.')) {
      leadFound = true;
    }

    // Clean inline reference markers like [1], [2], [citation needed]
    const cleanedLine = trimmed
      .replace(/\[\d+\]/g, '')
      .replace(/\[citation needed\]/gi, '')
      .replace(/\[edit\]/gi, '')
      .trim();

    if (cleanedLine) {
      cleanedLines.push(cleanedLine);
    }
  }

  const content = cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return {
    title: title || 'Wikipedia Article',
    content: content || rawText.trim()
  };
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

  // If Wikipedia paste detected, use dedicated Wikipedia cleaner
  if (isWikipediaPaste(rawText)) {
    return cleanWikipediaPastedText(rawText);
  }

  const rawLines = rawText.split(/\r?\n/);
  const cleanedLines: string[] = [];

  const BOILERPLATE_LINE_REGEX = /^(skip to content|skip to site index|skip to main content|section navigation|site index|give the times|account|jump to:?|share full article|give this article|read in app|advertisement|ad|sponsored|subscribe|sign in|log in|all rights reserved|terms of service|privacy policy|cookie preferences|search|photo credit|credit\.\.\.|image credit)$/i;

  let title = '';

  for (let line of rawLines) {
    const trimmed = line.replace(/\s+/g, ' ').trim();
    if (!trimmed) {
      if (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1] !== '') {
        cleanedLines.push('');
      }
      continue;
    }

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

  const content = cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title: title || 'Article', content: content || rawText.trim() };
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
