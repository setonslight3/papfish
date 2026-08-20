/**
 * Personal opening reports.
 *
 * A report answers one question per opening: how well do you actually know
 * this, and where does it break down? It combines what you have trained (in
 * Papfish) with what you have played (imported games), because those two often
 * disagree - and that disagreement is the useful part.
 */
import type { RepertoireTree } from './repertoire.js';
import { flatten, trainableNodes } from './repertoire.js';
import { repertoireMastery } from './mastery.js';
import type {
  Color,
  ImportedGameRecord,
  MasteryRecord,
  PersonalGamePositionRecord,
  RepertoireRecord,
  TrainingAttemptRecord,
} from './types.js';

export interface OpeningReportLine {
  sanPath: string[];
  moveSan: string;
  masteryScore: number;
  attempts: number;
}

export interface OpeningReport {
  repertoireId: string;
  name: string;
  color: Color;
  openingName: string | null;
  /** Positions in the repertoire the owner has to answer. */
  trainablePositions: number;
  trainedPositions: number;
  masteryScore: number;
  /** Accuracy over stored attempts for this repertoire. */
  trainingAccuracy: number | null;
  /** Games imported that were played with this colour. */
  games: number;
  /** Mean plies each of those games followed the repertoire. */
  averageInBookPlies: number | null;
  /** Times play left the repertoire in those games. */
  deviations: number;
  weakest: OpeningReportLine[];
  /** One-line summary of the state of this opening. */
  headline: string;
}

function accuracy(attempts: TrainingAttemptRecord[]): number | null {
  if (attempts.length === 0) return null;
  const correct = attempts.filter((attempt) => attempt.result === 'repertoire').length;
  return Math.round((correct / attempts.length) * 100);
}

/**
 * Build the report for one repertoire.
 *
 * `pathFor` resolves a node id to its move path; the caller owns tree walking
 * so this stays a pure aggregation.
 */
export function buildOpeningReport(input: {
  repertoire: RepertoireRecord;
  tree: RepertoireTree;
  mastery: MasteryRecord[];
  attempts: TrainingAttemptRecord[];
  games: ImportedGameRecord[];
  gamePositions: PersonalGamePositionRecord[];
  pathFor: (nodeId: string) => string[];
}): OpeningReport {
  const { repertoire, tree, mastery, attempts, games, gamePositions, pathFor } = input;

  const trainable = trainableNodes(tree, repertoire.color);
  const masteryForRepertoire = mastery.filter(
    (record) => record.repertoireId === repertoire.id,
  );
  const scores = masteryForRepertoire.map((record) => record.masteryScore);

  const relevantAttempts = attempts.filter(
    (attempt) => attempt.repertoireId === repertoire.id,
  );

  const colourGames = games.filter((game) => game.userColor === repertoire.color);
  const gameIds = new Set(colourGames.map((game) => game.id));
  const deviations = gamePositions.filter(
    (position) => gameIds.has(position.importedGameId) && position.trainingRecommended,
  ).length;

  const nodeByPositionKey = new Map(
    flatten(tree).map((node) => [node.positionKey, node]),
  );

  const weakest: OpeningReportLine[] = masteryForRepertoire
    .filter((record) => record.attempts > 0)
    .sort((a, b) => a.masteryScore - b.masteryScore)
    .slice(0, 5)
    .map((record) => {
      const node = nodeByPositionKey.get(record.positionKey);
      return {
        sanPath: node ? pathFor(node.id) : [],
        moveSan: node?.moveSan ?? '?',
        masteryScore: record.masteryScore,
        attempts: record.attempts,
      };
    });

  const masteryScore = repertoireMastery(trainable.length, scores);
  const averageInBookPlies =
    colourGames.length > 0
      ? Math.round(
          (colourGames.reduce((sum, game) => sum + game.inBookPlies, 0) / colourGames.length) * 10,
        ) / 10
      : null;

  return {
    repertoireId: repertoire.id,
    name: repertoire.name,
    color: repertoire.color,
    openingName: repertoire.openingName,
    trainablePositions: trainable.length,
    trainedPositions: scores.length,
    masteryScore,
    trainingAccuracy: accuracy(relevantAttempts),
    games: colourGames.length,
    averageInBookPlies,
    deviations,
    weakest,
    headline: headlineFor({
      masteryScore,
      trained: scores.length,
      trainable: trainable.length,
      games: colourGames.length,
      deviations,
      averageInBookPlies,
    }),
  };
}

function headlineFor(input: {
  masteryScore: number;
  trained: number;
  trainable: number;
  games: number;
  deviations: number;
  averageInBookPlies: number | null;
}): string {
  if (input.trained === 0) {
    return 'Not trained yet - every position here is still new.';
  }
  if (input.trained < input.trainable / 2) {
    return `Only ${input.trained} of ${input.trainable} positions have been trained; the rest are untested.`;
  }
  if (input.games > 0 && input.deviations > input.games) {
    return `Play leaves this repertoire often - ${input.deviations} deviations across ${input.games} games.`;
  }
  if (input.games > 0 && input.averageInBookPlies !== null && input.averageInBookPlies < 6) {
    return `Games leave the book after about ${input.averageInBookPlies} plies, so the depth here is not paying off yet.`;
  }
  if (input.masteryScore >= 75) {
    return 'Solid: trained widely and recalled reliably.';
  }
  if (input.masteryScore >= 45) {
    return 'Coming along - the answers are there, but not yet automatic.';
  }
  return 'Shaky: the positions are known but the answers are not sticking.';
}

export interface ImprovementPoint {
  /** ISO week start (Monday), YYYY-MM-DD. */
  weekStart: string;
  attempts: number;
  accuracy: number;
}

/** Accuracy per week, oldest first - the long-term view the dashboard cannot show. */
export function weeklyImprovement(
  attempts: TrainingAttemptRecord[],
  weeks = 8,
  now: Date = new Date(),
): ImprovementPoint[] {
  const startOfWeek = (date: Date): string => {
    const copy = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    // Monday-based weeks; getUTCDay() is 0 for Sunday.
    const offset = (copy.getUTCDay() + 6) % 7;
    copy.setUTCDate(copy.getUTCDate() - offset);
    return copy.toISOString().slice(0, 10);
  };

  const buckets = new Map<string, { attempts: number; correct: number }>();
  for (let index = weeks - 1; index >= 0; index -= 1) {
    const date = new Date(now.getTime() - index * 7 * 24 * 60 * 60 * 1000);
    buckets.set(startOfWeek(date), { attempts: 0, correct: 0 });
  }

  for (const attempt of attempts) {
    const key = startOfWeek(new Date(attempt.createdAt));
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.attempts += 1;
    if (attempt.result === 'repertoire') bucket.correct += 1;
  }

  return Array.from(buckets.entries()).map(([weekStart, bucket]) => ({
    weekStart,
    attempts: bucket.attempts,
    accuracy: bucket.attempts > 0 ? Math.round((bucket.correct / bucket.attempts) * 100) : 0,
  }));
}

/** How deep imported games stayed in book over time - preparation actually paying off. */
export function bookDepthTrend(games: ImportedGameRecord[], limit = 20): number[] {
  return games
    .slice()
    .sort((a, b) => (a.playedAt ?? a.createdAt).localeCompare(b.playedAt ?? b.createdAt))
    .slice(-limit)
    .map((game) => game.inBookPlies);
}
