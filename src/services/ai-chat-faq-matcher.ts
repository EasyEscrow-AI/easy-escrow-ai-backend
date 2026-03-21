/**
 * AI Chat FAQ Matcher — Fast pattern matching for common questions
 *
 * Intercepts incoming chat messages and matches them against the FAQ knowledgebase.
 * If a match is found above the confidence threshold, returns the pre-built answer
 * instantly without calling the Claude API.
 *
 * Matching algorithm:
 * 1. Normalize input (lowercase, strip punctuation)
 * 2. Score against FAQ patterns using Jaccard similarity
 * 3. Score against FAQ keywords using weighted keyword match
 * 4. Combine scores with pattern match taking priority
 * 5. Return best match if above threshold
 *
 * Redis caching:
 * - Matched FAQ answers are cached by normalized question hash
 * - TTL: 1 hour (FAQ answers are static)
 * - Cache key: institution:ai:faq:{hash}
 */

import { redisClient } from '../config/redis';
import { FAQ_ENTRIES, FaqEntry } from '../data/ai-chat-faq';

const FAQ_CACHE_PREFIX = 'institution:ai:faq:';
const FAQ_CACHE_TTL = 3600; // 1 hour

// Minimum confidence to return a FAQ answer (0-1)
const CONFIDENCE_THRESHOLD = 0.45;

// Weight for pattern vs keyword scoring
const PATTERN_WEIGHT = 0.65;
const KEYWORD_WEIGHT = 0.35;

export interface FaqMatch {
  entry: FaqEntry;
  confidence: number;
  matchedPattern?: string;
}

/**
 * Stopwords to ignore during matching — common words that don't carry meaning
 */
const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'about',
  'between',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'up',
  'down',
  'out',
  'off',
  'over',
  'under',
  'and',
  'but',
  'or',
  'nor',
  'not',
  'so',
  'yet',
  'both',
  'each',
  'all',
  'any',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'than',
  'too',
  'very',
  'just',
  'also',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'he',
  'she',
  'they',
  'them',
  'their',
  'what',
  'which',
  'who',
  'whom',
  'when',
  'where',
  'why',
  'how',
  'if',
  'then',
  'else',
  'there',
  'here',
  'please',
  'thanks',
  'thank',
  'hi',
  'hello',
  'hey',
]);

/**
 * Normalize text for matching: lowercase, strip punctuation, remove stopwords
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract meaningful tokens from text (removing stopwords)
 */
function tokenize(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

/**
 * Calculate Jaccard similarity between two sets of tokens
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Check if input contains a pattern as a substring (normalized)
 */
function substringMatch(input: string, pattern: string): boolean {
  return input.includes(pattern);
}

/**
 * Calculate pattern coverage: what fraction of pattern tokens appear in input.
 * Better than Jaccard for long inputs matching short patterns.
 */
function patternCoverage(inputTokens: string[], patternTokens: string[]): number {
  if (patternTokens.length === 0) return 0;
  const inputSet = new Set(inputTokens);
  let hits = 0;
  for (const token of patternTokens) {
    if (inputSet.has(token)) hits++;
  }
  return hits / patternTokens.length;
}

/**
 * Score a FAQ entry against input text
 */
function scoreEntry(inputNormalized: string, inputTokens: string[], entry: FaqEntry): FaqMatch {
  let bestPatternScore = 0;
  let matchedPattern: string | undefined;

  // Score against each pattern
  for (const pattern of entry.patterns) {
    const patternNormalized = normalize(pattern);

    // Exact substring match — high confidence
    if (substringMatch(inputNormalized, patternNormalized)) {
      const lengthRatio = patternNormalized.length / inputNormalized.length;
      const score = 0.7 + 0.3 * lengthRatio; // 0.7-1.0 for substring match
      if (score > bestPatternScore) {
        bestPatternScore = score;
        matchedPattern = pattern;
      }
      continue;
    }

    // Use max of Jaccard and pattern coverage
    // Coverage handles long inputs better (e.g. "Explain the 0.02% platform fee
    // for EasyEscrow stablecoin payments" should still match "platform fee")
    const patternTokens = tokenize(pattern);
    const jaccard = jaccardSimilarity(inputTokens, patternTokens);
    const coverage = patternCoverage(inputTokens, patternTokens);
    const similarity = Math.max(jaccard, coverage * 0.85);
    if (similarity > bestPatternScore) {
      bestPatternScore = similarity;
      matchedPattern = pattern;
    }
  }

  // Keyword score: what fraction of the entry's keywords appear in the input
  // Use word boundary matching to avoid partial matches (e.g. "escrow" in "easyescrow")
  let keywordHits = 0;
  for (const keyword of entry.keywords) {
    const re = new RegExp(`\\b${keyword}\\b`);
    if (re.test(inputNormalized)) {
      keywordHits++;
    }
  }
  const keywordScore = entry.keywords.length > 0 ? keywordHits / entry.keywords.length : 0;

  // Combined score
  const confidence = PATTERN_WEIGHT * bestPatternScore + KEYWORD_WEIGHT * keywordScore;

  return { entry, confidence, matchedPattern };
}

/**
 * Simple hash for cache key generation
 */
function hashQuestion(text: string): string {
  const normalized = normalize(text);
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Try to match an incoming message against the FAQ knowledgebase.
 * Returns the best matching FAQ entry if confidence exceeds threshold, or null.
 */
export async function matchFaq(message: string): Promise<FaqMatch | null> {
  const inputNormalized = normalize(message);
  const inputTokens = tokenize(message);

  // Very short messages (< 3 meaningful tokens) are unlikely to be FAQ-matchable
  // unless they're exact pattern matches
  if (inputTokens.length < 2 && inputNormalized.length < 10) {
    return null;
  }

  // Check Redis cache first
  const cacheKey = `${FAQ_CACHE_PREFIX}${hashQuestion(message)}`;
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      const entry = FAQ_ENTRIES.find((e) => e.id === parsed.entryId);
      if (entry) {
        return { entry, confidence: parsed.confidence, matchedPattern: parsed.matchedPattern };
      }
    }
  } catch {
    // Redis error — continue without cache
  }

  // Score all entries
  const matches = FAQ_ENTRIES.map((entry) => scoreEntry(inputNormalized, inputTokens, entry));

  // Find the best match
  matches.sort((a, b) => b.confidence - a.confidence);
  const best = matches[0];

  if (!best || best.confidence < CONFIDENCE_THRESHOLD) {
    return null;
  }

  // Cache the match
  try {
    await redisClient.set(
      cacheKey,
      JSON.stringify({
        entryId: best.entry.id,
        confidence: best.confidence,
        matchedPattern: best.matchedPattern,
      }),
      'EX',
      FAQ_CACHE_TTL
    );
  } catch {
    // Redis error — continue without caching
  }

  return best;
}

/**
 * Check if a message likely needs live data (mentions specific escrow codes,
 * asks about "my" escrows, account details, etc.)
 * These should always go to Claude with tools, not FAQ.
 */
export function requiresLiveData(message: string): boolean {
  const lower = message.toLowerCase();

  // Mentions a specific escrow code
  if (/ee-[a-z0-9]{3}-[a-z0-9]{3}/i.test(message)) return true;

  // Asks about their specific data
  const liveDataPatterns = [
    'my escrow',
    'my account',
    'my wallet',
    'my transaction',
    'my payment',
    'my balance',
    'my status',
    'my deposit',
    'my document',
    'show me',
    'look up',
    'find my',
    'check my',
    'get my',
    'how many escrows do i have',
    'what is my',
    'list my',
    'search for',
    'search my',
  ];

  return liveDataPatterns.some((pattern) => lower.includes(pattern));
}
