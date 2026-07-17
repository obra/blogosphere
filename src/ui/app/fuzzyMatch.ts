// ABOUTME: Fuzzy subsequence matching for quick-open — case-insensitive,
// ABOUTME: favors word-boundary starts and consecutive runs over scattered hits.

const WORD_BOUNDARY_PATTERN = /[\s\-_/.:]/;
const CONSECUTIVE_RUN_BONUS = 8;
const WORD_BOUNDARY_BONUS = 10;

/** True when `target[index]` starts a "word": index 0, or preceded by a
 *  separator (space, hyphen, underscore, slash, dot, colon). */
function isWordBoundary(target: string, index: number): boolean {
  if (index === 0) {
    return true;
  }
  return WORD_BOUNDARY_PATTERN.test(target[index - 1] ?? "");
}

/** null-tolerant max, where null means "no alignment reaches here". */
function maxScore(a: number | null, b: number | null): number | null {
  if (a === null) {
    return b;
  }
  if (b === null) {
    return a;
  }
  return Math.max(a, b);
}

/** best[j] = top score for the query prefix consumed so far with its last
 *  character landing exactly on target index j; null = unreachable. */
type ScoreRow = (number | null)[];

/** Row for the query's first character: no predecessor needed — a hit is
 *  just its own base-plus-boundary score. */
function firstScoreRow(t: string, char: string): ScoreRow {
  const row: ScoreRow = new Array<number | null>(t.length).fill(null);
  for (let j = 0; j < t.length; j += 1) {
    if (t[j] === char) {
      row[j] = 1 + (isWordBoundary(t, j) ? WORD_BOUNDARY_BONUS : 0);
    }
  }
  return row;
}

/** One dynamic-programming step: extend `previous` (the row for the query
 *  prefix without `char`) by one query character. A hit at j chains onto its
 *  best reachable predecessor — previous[j - 1] with the run bonus, or the
 *  best earlier alignment without it. */
function nextScoreRow(t: string, previous: ScoreRow, char: string): ScoreRow {
  const row: ScoreRow = new Array<number | null>(t.length).fill(null);
  // Best previous-prefix score over indexes <= j - 2 — alignments that ended
  // too far back to earn the consecutive-run bonus at j.
  let bestDetached: number | null = null;
  // previous[j - 1]: the one predecessor that DOES earn the run bonus.
  let adjacent: number | null = null;
  for (let j = 0; j < t.length; j += 1) {
    bestDetached = maxScore(bestDetached, adjacent);
    adjacent = j > 0 ? (previous[j - 1] ?? null) : null;
    if (t[j] === char) {
      const hit = 1 + (isWordBoundary(t, j) ? WORD_BOUNDARY_BONUS : 0);
      const viaRun = adjacent === null ? null : adjacent + CONSECUTIVE_RUN_BONUS;
      const bestPredecessor = maxScore(viaRun, bestDetached);
      row[j] = bestPredecessor === null ? null : hit + bestPredecessor;
    }
  }
  return row;
}

/**
 * Score `query` as a case-insensitive fuzzy subsequence of `target`: every
 * character of `query` must appear in `target`, in order, though not
 * necessarily contiguously. Returns null when it isn't a subsequence at all.
 * Higher is a better match; hits that land on a word boundary or continue a
 * consecutive run outscore the same letters scattered mid-word. Every
 * possible alignment is considered (dynamic programming, not greedy
 * first-occurrence anchoring), so "op" against "Workshop Open House" scores
 * the word-boundary run starting "Open" — not the weaker early hit inside
 * "Workshop" that happens to appear first.
 */
function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let row: ScoreRow | null = null;
  for (const char of q) {
    row = row === null ? firstScoreRow(t, char) : nextScoreRow(t, row, char);
  }
  if (row === null) {
    return 0; // an empty query trivially matches everything
  }
  let best: number | null = null;
  for (const score of row) {
    best = maxScore(best, score);
  }
  return best;
}

/** One thing quick-open can rank: the text to match against, plus a
 *  recency key for breaking score ties. */
interface FuzzyCandidate<T> {
  item: T;
  text: string;
  updatedAt: number;
}

interface ScoredCandidate<T> {
  candidate: FuzzyCandidate<T>;
  score: number;
}

function compareByScoreThenRecency<T>(a: ScoredCandidate<T>, b: ScoredCandidate<T>): number {
  if (a.score !== b.score) {
    return b.score - a.score;
  }
  return b.candidate.updatedAt - a.candidate.updatedAt;
}

/**
 * Rank candidates by fuzzy match against `query`, best match first; equal
 * scores break by recency (most recently updated first). A blank query
 * skips scoring and returns everything ordered by recency alone — the
 * "browse what's recent" behavior an empty quick-open box should show.
 */
function rankByFuzzyMatch<T>(query: string, candidates: FuzzyCandidate<T>[]): T[] {
  const trimmed = query.trim();
  if (trimmed === "") {
    return [...candidates].sort((a, b) => b.updatedAt - a.updatedAt).map((c) => c.item);
  }
  const scored: ScoredCandidate<T>[] = [];
  for (const candidate of candidates) {
    const score = fuzzyScore(trimmed, candidate.text);
    if (score !== null) {
      scored.push({ candidate, score });
    }
  }
  scored.sort(compareByScoreThenRecency);
  return scored.map((entry) => entry.candidate.item);
}

export type { FuzzyCandidate };
export { fuzzyScore, rankByFuzzyMatch };
