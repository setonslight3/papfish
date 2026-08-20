import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  Color,
  ImportedGameRecord,
  MasteryRecord,
  MoveVerdict,
  PersonalGamePositionRecord,
  RepertoireNodeRecord,
  RepertoireRecord,
  TrainingAttemptRecord,
  TrainingMode,
} from '@papfish/core';
import {
  applyAttempt,
  buildTree,
  scheduleReview,
  starterRepertoireByKey,
  verdictToRecallScore,
} from '@papfish/core';
import { importGamesFromPgn, type ImportOutcome } from './gameImport';
import { getRepository } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { useOpeningBook } from '@/hooks/useOpeningBook';
import { addMoveToRepertoire, createRepertoireFromStarter } from './repertoireService';

export interface RecordTrainingInput {
  repertoireId: string;
  nodeId: string | null;
  positionKey: string;
  color: Color;
  attemptedMove: string;
  expectedMove: string | null;
  verdict: MoveVerdict;
  responseTimeMs: number;
  engineEvaluation: number | null;
  engineQuality: number;
  mode?: TrainingMode;
}

interface RepertoireContextValue {
  loading: boolean;
  error: string | null;
  repertoires: RepertoireRecord[];
  nodes: RepertoireNodeRecord[];
  mastery: MasteryRecord[];
  attempts: TrainingAttemptRecord[];
  games: ImportedGameRecord[];
  gamePositions: PersonalGamePositionRecord[];
  refresh(): Promise<void>;
  createStarter(starterKey: string): Promise<RepertoireRecord | null>;
  deleteRepertoire(id: string): Promise<void>;
  addMove(repertoireId: string, sanPath: string[], san: string): Promise<void>;
  deleteNode(nodeId: string): Promise<void>;
  recordTraining(input: RecordTrainingInput): Promise<void>;
  importGames(pgnText: string, aliases: string[]): Promise<ImportOutcome>;
  deleteGame(gameId: string): Promise<void>;
}

const RepertoireContext = createContext<RepertoireContextValue | null>(null);

/**
 * Loads and mutates the signed-in user's repertoires, mastery and training
 * history. Every screen reads from here, so a change made in Explore is
 * immediately visible in Training and on the dashboard.
 */
export function RepertoireProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { user } = useAuth();
  const book = useOpeningBook();
  const repository = getRepository();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repertoires, setRepertoires] = useState<RepertoireRecord[]>([]);
  const [nodes, setNodes] = useState<RepertoireNodeRecord[]>([]);
  const [mastery, setMastery] = useState<MasteryRecord[]>([]);
  const [attempts, setAttempts] = useState<TrainingAttemptRecord[]>([]);
  const [games, setGames] = useState<ImportedGameRecord[]>([]);
  const [gamePositions, setGamePositions] = useState<PersonalGamePositionRecord[]>([]);

  const refresh = useCallback(async () => {
    if (!user) {
      setRepertoires([]);
      setNodes([]);
      setMastery([]);
      setAttempts([]);
      setGames([]);
      setGamePositions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [loadedRepertoires, loadedNodes, loadedMastery, loadedAttempts, loadedGames, loadedPositions] =
        await Promise.all([
          repository.listRepertoires(user.id),
          repository.listAllNodes(user.id),
          repository.listMastery(user.id),
          repository.listRecentAttempts(user.id, 200),
          repository.listImportedGames(user.id),
          repository.listGamePositions(user.id),
        ]);
      setRepertoires(loadedRepertoires);
      setNodes(loadedNodes);
      setMastery(loadedMastery);
      setAttempts(loadedAttempts);
      setGames(loadedGames);
      setGamePositions(loadedPositions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your repertoires');
    } finally {
      setLoading(false);
    }
  }, [repository, user]);

  useEffect(() => {
    // Loading the user's data on mount is exactly what an effect is for; the
    // synchronous loading flag inside refresh() is the point of the call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const createStarter = useCallback(
    async (starterKey: string) => {
      if (!user) return null;
      const starter = starterRepertoireByKey(starterKey);
      if (!starter) throw new Error(`Unknown starter repertoire: ${starterKey}`);
      const { repertoire } = await createRepertoireFromStarter(repository, user.id, starter, book);
      await refresh();
      return repertoire;
    },
    [book, refresh, repository, user],
  );

  const deleteRepertoire = useCallback(
    async (id: string) => {
      if (!user) return;
      await repository.deleteRepertoire(user.id, id);
      await refresh();
    },
    [refresh, repository, user],
  );

  const addMove = useCallback(
    async (repertoireId: string, sanPath: string[], san: string) => {
      if (!user) return;
      const repertoire = repertoires.find((item) => item.id === repertoireId);
      if (!repertoire) throw new Error('Repertoire not found');
      const existing = nodes.filter((node) => node.repertoireId === repertoireId);
      await addMoveToRepertoire(repository, user.id, repertoire, existing, sanPath, san, book);
      await refresh();
    },
    [book, nodes, refresh, repertoires, repository, user],
  );

  const deleteNode = useCallback(
    async (nodeId: string) => {
      if (!user) return;
      await repository.deleteNode(user.id, nodeId);
      await refresh();
    },
    [refresh, repository, user],
  );

  const recordTraining = useCallback(
    async (input: RecordTrainingInput) => {
      if (!user) return;

      const attempt = await repository.recordAttempt(user.id, {
        repertoireId: input.repertoireId,
        repertoireNodeId: input.nodeId,
        positionKey: input.positionKey,
        color: input.color,
        attemptedMove: input.attemptedMove,
        expectedMove: input.expectedMove,
        engineEvaluation: input.engineEvaluation,
        result: input.verdict,
        responseTimeMs: input.responseTimeMs,
        mode: input.mode ?? 'train',
      });

      const previous =
        mastery.find(
          (record) =>
            record.repertoireId === input.repertoireId && record.positionKey === input.positionKey,
        ) ?? null;

      const updated = applyAttempt({
        previous,
        verdict: input.verdict,
        responseTimeMs: input.responseTimeMs,
        engineQuality: input.engineQuality,
      });

      // The scheduler owns the review interval; mastery owns the score.
      const review = scheduleReview(
        previous
          ? {
              repetitions: previous.streak,
              easeFactor: previous.difficulty,
              intervalDays: previous.intervalDays,
            }
          : null,
        verdictToRecallScore(input.verdict, input.responseTimeMs),
      );

      const saved = await repository.upsertMastery(user.id, {
        repertoireId: input.repertoireId,
        positionKey: input.positionKey,
        color: input.color,
        ...updated,
        difficulty: review.easeFactor,
        intervalDays: review.intervalDays,
        nextReviewAt: review.nextReviewAt,
      });

      setAttempts((current) => [attempt, ...current].slice(0, 200));
      setMastery((current) => {
        const others = current.filter(
          (record) =>
            !(record.repertoireId === saved.repertoireId && record.positionKey === saved.positionKey),
        );
        return [...others, saved];
      });
    },
    [mastery, repository, user],
  );

  const importGames = useCallback(
    async (pgnText: string, aliases: string[]) => {
      if (!user) throw new Error('Sign in to import games');
      const trees = new Map(
        repertoires.map((repertoire) => [
          repertoire.id,
          buildTree(nodes.filter((node) => node.repertoireId === repertoire.id)),
        ]),
      );
      const outcome = await importGamesFromPgn(repository, user.id, pgnText, aliases, {
        repertoires,
        trees,
        book,
      });
      await refresh();
      return outcome;
    },
    [book, nodes, refresh, repertoires, repository, user],
  );

  const deleteGame = useCallback(
    async (gameId: string) => {
      if (!user) return;
      await repository.deleteImportedGame(user.id, gameId);
      await refresh();
    },
    [refresh, repository, user],
  );

  const value = useMemo<RepertoireContextValue>(
    () => ({
      loading,
      error,
      repertoires,
      nodes,
      mastery,
      attempts,
      games,
      gamePositions,
      refresh,
      createStarter,
      deleteRepertoire,
      addMove,
      deleteNode,
      recordTraining,
      importGames,
      deleteGame,
    }),
    [
      loading,
      error,
      repertoires,
      nodes,
      mastery,
      attempts,
      games,
      gamePositions,
      refresh,
      createStarter,
      deleteRepertoire,
      addMove,
      deleteNode,
      recordTraining,
      importGames,
      deleteGame,
    ],
  );

  return <RepertoireContext.Provider value={value}>{children}</RepertoireContext.Provider>;
}

export function useRepertoires(): RepertoireContextValue {
  const context = useContext(RepertoireContext);
  if (!context) throw new Error('useRepertoires must be used inside <RepertoireProvider>');
  return context;
}
