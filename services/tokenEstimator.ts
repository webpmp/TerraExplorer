export const DEFAULT_LM_STUDIO_CONTEXT_LIMIT = 16384;
export const DEFAULT_GEMINI_CONTEXT_LIMIT = 1048576; // 1M tokens for Gemini 2.0 / 2.5 flash

export const CHARS_PER_TOKEN_RATIO = 3.6; // Conservative character-to-token ratio

/**
 * Estimates token count conservatively for a given text string.
 * Uses a 3.6 chars/token ratio and adds safety padding for whitespace/special tokens.
 */
export function estimateTokens(text: string | undefined | null): number {
  if (!text || typeof text !== 'string') {
    return 0;
  }
  const len = text.length;
  if (len === 0) return 0;
  
  // Conservative estimate: 3.6 chars per token + fixed overhead
  return Math.ceil(len / CHARS_PER_TOKEN_RATIO) + 16;
}

export interface BudgetCheckParams {
  promptText: string;
  systemInstruction?: string;
  expectedOutputTokens: number;
  availableContext?: number;
}

export interface BudgetCheckResult {
  estimatedPromptTokens: number;
  estimatedSystemTokens: number;
  expectedOutputTokens: number;
  totalEstimatedTokens: number;
  availableContext: number;
  isOversized: boolean;
  headroom: number;
}

/**
 * Checks whether a complete AI prompt request fits within the available context window.
 */
export function checkContextBudget(params: BudgetCheckParams): BudgetCheckResult {
  const availableContext = params.availableContext ?? DEFAULT_LM_STUDIO_CONTEXT_LIMIT;
  const estimatedPromptTokens = estimateTokens(params.promptText);
  const estimatedSystemTokens = params.systemInstruction ? estimateTokens(params.systemInstruction) : 0;
  const expectedOutputTokens = params.expectedOutputTokens || 0;

  const totalEstimatedTokens = estimatedPromptTokens + estimatedSystemTokens + expectedOutputTokens;
  const isOversized = totalEstimatedTokens > availableContext;
  const headroom = availableContext - totalEstimatedTokens;

  return {
    estimatedPromptTokens,
    estimatedSystemTokens,
    expectedOutputTokens,
    totalEstimatedTokens,
    availableContext,
    isOversized,
    headroom
  };
}
