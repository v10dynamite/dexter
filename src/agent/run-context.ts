import { Scratchpad } from './scratchpad.js';
import { TokenCounter } from './token-counter.js';

/**
 * Mutable state for a single agent run.
 */
export interface RunContext {
  readonly query: string;
  readonly scratchpad: Scratchpad;
  readonly tokenCounter: TokenCounter;
  readonly startTime: number;
  readonly seenVnSkillContextSlugs: Set<string>;
  readonly privateToolMessageContent: Map<string, string>;
  iteration: number;
  restrictedToolAllowlist: Set<string> | null;
  /**
   * Input token count from the most recent API response.
   * This is the actual context size reported by the API — far more accurate
   * than character-based estimation. Used by manageContextThreshold() to
   * anchor token estimates on real data.
   */
  lastApiInputTokens: number;
}

export function createRunContext(query: string): RunContext {
  return {
    query,
    scratchpad: new Scratchpad(query),
    tokenCounter: new TokenCounter(),
    startTime: Date.now(),
    seenVnSkillContextSlugs: new Set(),
    privateToolMessageContent: new Map(),
    iteration: 0,
    restrictedToolAllowlist: null,
    lastApiInputTokens: 0,
  };
}
