/**
 * Shared domain types for Papfish.
 *
 * These types are deliberately free of any React / Supabase / DOM dependency so
 * that the same definitions can be used by the web client, the offline data
 * pipeline and the tests.
 */

export type Color = 'white' | 'black';

/** Side to move, using the single-letter convention of chess.js / FEN. */
export type SideToMove = 'w' | 'b';

/**
 * Rating populations that opening statistics can be filtered by.
 * `masters` is a distinct population (curated master games), not a rating band.
 */
export type RatingBucket =
  | 'beginner'
  | '1000-1199'
  | '1200-1399'
  | '1400-1599'
  | '1600-1799'
  | '1800-1999'
  | '2000-2199'
  | '2200+'
  | 'masters';

export type TimeControl = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'all';

/** Where a statistics row came from. Never fabricate a source. */
export type StatsSource = 'lichess' | 'masters' | 'none';

export interface RatingBucketDefinition {
  id: RatingBucket;
  label: string;
  shortLabel: string;
  /** Inclusive lower bound of the band, null for the master population. */
  min: number | null;
  /** Inclusive upper bound of the band, null when unbounded. */
  max: number | null;
  /** Population this bucket is sampled from. */
  source: Exclude<StatsSource, 'none'>;
  /**
   * Rating group ids used by the Lichess opening explorer for this bucket.
   * Empty for the master population, which uses a separate database.
   */
  lichessRatingGroups: number[];
}

/** Aggregated statistics for a single candidate move in a position. */
export interface MoveStat {
  san: string;
  uci: string;
  /** Number of games in the sampled population that continued with this move. */
  games: number;
  whiteWins: number;
  draws: number;
  blackWins: number;
  averageRating: number | null;
  /**
   * Share of games at this position that played this move, 0-100.
   * Always derived from `games` / position total - never stored by hand.
   */
  percentage: number;
}

/** Aggregated statistics for one position within one population. */
export interface PositionStats {
  positionKey: string;
  ratingBucket: RatingBucket;
  timeControl: TimeControl;
  source: StatsSource;
  totalGames: number;
  moves: MoveStat[];
  updatedAt?: string;
}

export interface EngineScore {
  type: 'cp' | 'mate';
  /** Centipawns, or moves-to-mate when `type` is `mate`. Side-to-move relative. */
  value: number;
}

export interface EngineLine {
  /** 1-based multipv index. */
  multipv: number;
  depth: number;
  /** Score from the point of view of the side to move in the analysed position. */
  score: EngineScore;
  /** Principal variation in UCI long algebraic notation. */
  pv: string[];
}

export interface EngineAnalysis {
  fen: string;
  depth: number;
  lines: EngineLine[];
  bestMove: string | null;
  /** True when the search was cut short (stopped by the caller). */
  aborted?: boolean;
}

export type EngineState = 'idle' | 'loading' | 'ready' | 'analyzing' | 'error';

/** How a training attempt is graded. */
export type MoveVerdict =
  | 'repertoire'
  | 'strong-alternative'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'illegal';

export interface AttemptClassification {
  verdict: MoveVerdict;
  /** Centipawn loss versus the best available move, from the mover's view. */
  centipawnLoss: number | null;
  expectedSan: string | null;
  playedSan: string;
  bestSan: string | null;
  headline: string;
  detail: string;
}

/** Opponent behaviour when it is not the user's turn. */
export type OpponentMode = 'human' | 'engine';

/** How candidate human moves are narrowed before one is chosen. */
export type CandidatePolicy = 'top1' | 'top3' | 'top5' | 'weighted';

export interface OpeningIdentification {
  eco: string;
  /** Full standard name, e.g. "Italian Game: Two Knights Defense, Fried Liver Attack". */
  name: string;
  /** Portion before the first colon. */
  opening: string;
  /** Portion after the first colon, when present. */
  variation: string | null;
  /** Ply at which this classification was matched. */
  ply: number;
}

export interface RepertoireRecord {
  id: string;
  userId: string;
  name: string;
  color: Color;
  openingCode: string | null;
  openingName: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RepertoireNodeRecord {
  id: string;
  repertoireId: string;
  parentNodeId: string | null;
  /** FEN of the position *after* `moveSan` was played. */
  fen: string;
  /** Stable position identity (FEN without the move counters). */
  positionKey: string;
  moveSan: string;
  moveUci: string;
  /** 1-based half-move number of `moveSan`. */
  ply: number;
  openingName: string | null;
  variationName: string | null;
  /** True when this move is played by the repertoire owner. */
  isUserMove: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingAttemptRecord {
  id: string;
  userId: string;
  repertoireId: string | null;
  repertoireNodeId: string | null;
  positionKey: string;
  color: Color;
  attemptedMove: string;
  expectedMove: string | null;
  engineEvaluation: number | null;
  result: MoveVerdict;
  responseTimeMs: number;
  createdAt: string;
}

export interface MasteryRecord {
  userId: string;
  positionKey: string;
  repertoireId: string;
  color: Color;
  attempts: number;
  correctAttempts: number;
  masteryScore: number;
  difficulty: number;
  streak: number;
  averageResponseMs: number;
  lastReviewedAt: string | null;
  updatedAt: string;
}

export interface ProfileRecord {
  userId: string;
  displayName: string | null;
  ratingBucket: RatingBucket;
  timeControl: TimeControl;
  createdAt: string;
  updatedAt: string;
}
