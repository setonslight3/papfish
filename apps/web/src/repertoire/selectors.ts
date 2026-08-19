import type {
  Color,
  MasteryRecord,
  RepertoireNodeRecord,
  RepertoireRecord,
  RepertoireTree,
} from '@papfish/core';
import {
  START_FEN,
  buildTree,
  pathToRoot,
  positionKey,
  repertoireMastery,
  trainableNodes,
} from '@papfish/core';
import type { TrainingCandidate } from '@papfish/core';

export interface RepertoireView {
  repertoire: RepertoireRecord;
  tree: RepertoireTree;
  candidates: TrainingCandidate[];
  trainableCount: number;
  trainedCount: number;
  masteryScore: number;
}

function masteryIndex(mastery: MasteryRecord[]): Map<string, MasteryRecord> {
  return new Map(mastery.map((record) => [`${record.repertoireId}|${record.positionKey}`, record]));
}

/**
 * Build the training candidates for a repertoire.
 *
 * A candidate is a position where the owner has to make their own move, so the
 * FEN shown to the user is the position *before* their move, and the expected
 * answer is the node's move.
 */
export function buildCandidates(
  repertoire: RepertoireRecord,
  tree: RepertoireTree,
  mastery: Map<string, MasteryRecord>,
): TrainingCandidate[] {
  return trainableNodes(tree, repertoire.color).map((node) => {
    const path = pathToRoot(tree, node.id);
    const parent = path.at(-2) ?? null;
    const fen = parent ? parent.fen : START_FEN;
    return {
      node,
      repertoireId: repertoire.id,
      mastery: mastery.get(`${repertoire.id}|${positionKey(fen)}`) ?? null,
      sanPath: path.slice(0, -1).map((item) => item.moveSan),
      fen,
    };
  });
}

export function buildRepertoireViews(
  repertoires: RepertoireRecord[],
  nodes: RepertoireNodeRecord[],
  mastery: MasteryRecord[],
): RepertoireView[] {
  const index = masteryIndex(mastery);

  return repertoires.map((repertoire) => {
    const tree = buildTree(nodes.filter((node) => node.repertoireId === repertoire.id));
    const candidates = buildCandidates(repertoire, tree, index);
    const scores = candidates
      .map((candidate) => candidate.mastery?.masteryScore ?? null)
      .filter((score): score is number => score !== null);

    return {
      repertoire,
      tree,
      candidates,
      trainableCount: candidates.length,
      trainedCount: scores.length,
      masteryScore: repertoireMastery(candidates.length, scores),
    };
  });
}

export interface MasterySummary {
  overall: number;
  white: number;
  black: number;
  views: RepertoireView[];
}

/** Mastery aggregated overall and per colour - White and Black stay separate. */
export function summarizeMastery(views: RepertoireView[]): MasterySummary {
  const forColor = (color: Color) => {
    const relevant = views.filter((view) => view.repertoire.color === color);
    const trainable = relevant.reduce((sum, view) => sum + view.trainableCount, 0);
    const total = relevant.reduce(
      (sum, view) => sum + view.masteryScore * view.trainableCount,
      0,
    );
    return trainable > 0 ? Math.round(total / trainable) : 0;
  };

  const trainable = views.reduce((sum, view) => sum + view.trainableCount, 0);
  const overallTotal = views.reduce((sum, view) => sum + view.masteryScore * view.trainableCount, 0);

  return {
    overall: trainable > 0 ? Math.round(overallTotal / trainable) : 0,
    white: forColor('white'),
    black: forColor('black'),
    views,
  };
}

export function allCandidates(views: RepertoireView[], color?: Color): TrainingCandidate[] {
  return views
    .filter((view) => !color || view.repertoire.color === color)
    .flatMap((view) => view.candidates);
}
