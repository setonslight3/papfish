import { useCallback, useRef, useState } from 'react';
import type {
  AdaptiveItem,
  AttemptClassification,
  Color,
  EngineScore,
  OpponentDecision,
  RepertoireNodeRecord,
  TrainingCandidate,
  TrainingMode,
  TrainingSource,
} from '@papfish/core';
import {
  centipawnLoss,
  chooseHumanMove,
  classifyAttempt,
  engineQualityFromLoss,
  fenAfterSan,
  getEngineStrengthProfile,
  isLegalSan,
  positionKey,
  scoreDrill,
  uciToSan,
} from '@papfish/core';
import { useEngine } from '@/engine/EngineProvider';
import { useSettings } from '@/settings/SettingsProvider';
import { useRepertoires } from '@/repertoire/RepertoireProvider';
import { repertoireMoveFor } from '@/repertoire/repertoireService';
import { fetchPositionStats } from '@/stats/statsService';

export type TrainingPhase =
  | 'idle'
  | 'waiting'
  | 'grading'
  | 'feedback'
  | 'opponent'
  | 'complete';

export interface SessionOptions {
  mode?: TrainingMode;
  /** Speed drills only: milliseconds allowed per position. */
  timeLimitMs?: number | null;
}

export interface TrainingProgress {
  index: number;
  total: number;
  correct: number;
  answered: number;
}

interface CurrentPosition {
  fen: string;
  sanPath: string[];
  expectedSan: string;
  node: RepertoireNodeRecord;
  repertoireId: string;
  color: Color;
}

export interface TrainingState {
  phase: TrainingPhase;
  fen: string;
  sanPath: string[];
  orientation: Color;
  /** Only revealed once the user has attempted a move. */
  expectedSan: string | null;
  playedSan: string | null;
  feedback: AttemptClassification | null;
  opponentMove: OpponentDecision | null;
  opponentNote: string | null;
  progress: TrainingProgress;
  engineUnavailable: boolean;
  mode: TrainingMode;
  /** Why this position was selected, when the session was built adaptively. */
  source: TrainingSource | null;
  timeLimitMs: number | null;
  /** Epoch milliseconds by which the answer must be in, for drills. */
  deadlineAt: number | null;
  timedOut: boolean;
  drillScore: number;
}

const IDLE_STATE: TrainingState = {
  phase: 'idle',
  fen: '',
  sanPath: [],
  orientation: 'white',
  expectedSan: null,
  playedSan: null,
  feedback: null,
  opponentMove: null,
  opponentNote: null,
  progress: { index: 0, total: 0, correct: 0, answered: 0 },
  engineUnavailable: false,
  mode: 'train',
  source: null,
  timeLimitMs: null,
  deadlineAt: null,
  timedOut: false,
  drillScore: 0,
};

/**
 * The training loop.
 *
 * A position is shown, the user must commit to a move *before* anything is
 * revealed, the attempt is graded against the repertoire (and the engine when
 * it is available), and then the opponent answers - either from human
 * popularity statistics or from Stockfish, never a blend of the two.
 */
export function useTrainingSession() {
  const { engine, state: engineState } = useEngine();
  const { settings } = useSettings();
  const { nodes, recordTraining } = useRepertoires();

  const [state, setState] = useState<TrainingState>(IDLE_STATE);
  const queueRef = useRef<AdaptiveItem[]>([]);
  const positionRef = useRef(0);
  const currentRef = useRef<CurrentPosition | null>(null);
  const startedAtRef = useRef(0);
  const progressRef = useRef<TrainingProgress>({ index: 0, total: 0, correct: 0, answered: 0 });
  const modeRef = useRef<TrainingMode>('train');
  const timeLimitRef = useRef<number | null>(null);
  const drillScoreRef = useRef(0);

  const engineAvailable = settings.engineEnabled && engineState !== 'error';

  const presentCandidate = useCallback(
    (candidate: TrainingCandidate, source: TrainingSource | null) => {
      const current: CurrentPosition = {
        fen: candidate.fen,
        sanPath: candidate.sanPath,
        expectedSan: candidate.node.moveSan,
        node: candidate.node,
        repertoireId: candidate.repertoireId,
        color: candidate.node.ply % 2 === 1 ? 'white' : 'black',
      };
      currentRef.current = current;
      startedAtRef.current = Date.now();

      setState({
        ...IDLE_STATE,
        phase: 'waiting',
        fen: current.fen,
        sanPath: current.sanPath,
        orientation: current.color,
        progress: { ...progressRef.current },
        engineUnavailable: !engineAvailable,
        mode: modeRef.current,
        source,
        timeLimitMs: timeLimitRef.current,
        deadlineAt: timeLimitRef.current ? Date.now() + timeLimitRef.current : null,
        drillScore: drillScoreRef.current,
      });
    },
    [engineAvailable],
  );

  const finish = useCallback(() => {
    currentRef.current = null;
    setState((previous) => ({
      ...previous,
      phase: 'complete',
      expectedSan: null,
      progress: { ...progressRef.current },
    }));
  }, []);

  const nextFromQueue = useCallback(() => {
    const next = queueRef.current[positionRef.current];
    if (!next) {
      finish();
      return;
    }
    positionRef.current += 1;
    progressRef.current = { ...progressRef.current, index: positionRef.current };
    presentCandidate(next.candidate, next.source);
  }, [finish, presentCandidate]);

  /** Continue inside the current line, or fall back to the next queued position. */
  const continueInLine = useCallback(
    (fen: string, sanPath: string[], repertoireId: string) => {
      const repertoireNodes = nodes.filter((node) => node.repertoireId === repertoireId);
      const next = repertoireMoveFor(repertoireNodes, sanPath);
      if (!next || !next.isUserMove || !isLegalSan(fen, next.moveSan)) {
        nextFromQueue();
        return;
      }

      currentRef.current = {
        fen,
        sanPath,
        expectedSan: next.moveSan,
        node: next,
        repertoireId,
        color: next.ply % 2 === 1 ? 'white' : 'black',
      };
      startedAtRef.current = Date.now();

      setState((previous) => ({
        ...previous,
        phase: 'waiting',
        fen,
        sanPath,
        expectedSan: null,
        playedSan: null,
        feedback: null,
        opponentMove: null,
        opponentNote: null,
        timedOut: false,
        deadlineAt: timeLimitRef.current ? Date.now() + timeLimitRef.current : null,
        progress: { ...progressRef.current },
      }));
    },
    [nextFromQueue, nodes],
  );

  /**
   * Run a prepared session. The caller decides *what* to train - adaptive mix,
   * due reviews, a drill - and this hook runs it.
   */
  const start = useCallback(
    (items: AdaptiveItem[], options: SessionOptions = {}) => {
      queueRef.current = items;
      positionRef.current = 0;
      modeRef.current = options.mode ?? 'train';
      timeLimitRef.current = options.timeLimitMs ?? null;
      drillScoreRef.current = 0;
      progressRef.current = { index: 0, total: items.length, correct: 0, answered: 0 };

      if (items.length === 0) {
        setState({ ...IDLE_STATE, phase: 'complete', mode: modeRef.current });
        return;
      }
      positionRef.current = 1;
      progressRef.current.index = 1;
      presentCandidate(items[0].candidate, items[0].source);
    },
    [presentCandidate],
  );

  /** Score the position before and after a move, from the mover's point of view. */
  const evaluateMove = useCallback(
    async (
      fen: string,
      san: string,
    ): Promise<{ best: EngineScore | null; played: EngineScore | null; bestSan: string | null }> => {
      if (!engineAvailable) return { best: null, played: null, bestSan: null };
      try {
        const before = await engine.analyse(fen, { depth: 12, multiPv: 1 });
        const bestScore = before.lines[0]?.score ?? null;
        const bestSan = before.bestMove ? uciToSan(fen, before.bestMove) : null;

        const afterFen = fenAfterSan(fen, san);
        if (!afterFen) return { best: bestScore, played: null, bestSan };

        const after = await engine.analyse(afterFen, { depth: 12, multiPv: 1 });
        const opponentScore = after.lines[0]?.score ?? null;
        // The score after the move is from the opponent's view; flip it back.
        const playedScore: EngineScore | null = opponentScore
          ? { type: opponentScore.type, value: -opponentScore.value }
          : null;

        return { best: bestScore, played: playedScore, bestSan };
      } catch {
        return { best: null, played: null, bestSan: null };
      }
    },
    [engine, engineAvailable],
  );

  const playOpponentReply = useCallback(
    async (fen: string, sanPath: string[], repertoireId: string) => {
      setState((previous) => ({ ...previous, phase: 'opponent' }));

      let decision: OpponentDecision | null = null;
      let note: string | null = null;

      if (settings.opponentMode === 'human') {
        const { stats } = await fetchPositionStats({
          fen,
          ratingBucket: settings.ratingBucket,
          timeControl: settings.timeControl,
        });
        decision = chooseHumanMove({ fen, stats, policy: settings.candidatePolicy });
        if (!decision) {
          note = 'No human statistics for this position, so the engine answered instead.';
        }
      }

      if (!decision) {
        if (!engineAvailable) {
          // Nothing can answer: end the line rather than inventing a move.
          continueInLine(fen, sanPath, repertoireId);
          return;
        }
        const profile = getEngineStrengthProfile(settings.engineStrengthId);
        const { uci } = await engine.bestMove(fen, {
          depth: profile.depth,
          movetimeMs: profile.movetimeMs,
          elo: profile.elo,
        });
        const san = uci ? uciToSan(fen, uci) : null;
        if (!san || !uci) {
          continueInLine(fen, sanPath, repertoireId);
          return;
        }
        decision = {
          san,
          uci,
          source: 'engine',
          percentage: null,
          games: null,
          reason:
            settings.opponentMode === 'engine'
              ? `Stockfish reply (${profile.label})`
              : 'Engine reply (no human data for this position)',
        };
      }

      const nextFen = fenAfterSan(fen, decision.san);
      if (!nextFen) {
        continueInLine(fen, sanPath, repertoireId);
        return;
      }

      const nextPath = [...sanPath, decision.san];
      setState((previous) => ({
        ...previous,
        fen: nextFen,
        sanPath: nextPath,
        opponentMove: decision,
        opponentNote: note,
      }));

      window.setTimeout(() => continueInLine(nextFen, nextPath, repertoireId), 650);
    },
    [continueInLine, engine, engineAvailable, settings],
  );

  const submitMove = useCallback(
    async (san: string) => {
      const current = currentRef.current;
      if (!current || state.phase !== 'waiting') return;

      const responseTimeMs = Date.now() - startedAtRef.current;
      const legal = isLegalSan(current.fen, san);
      const playedFen = legal ? fenAfterSan(current.fen, san) : null;

      setState((previous) => ({ ...previous, phase: 'grading', playedSan: san }));

      const scores = legal
        ? await evaluateMove(current.fen, san)
        : { best: null, played: null, bestSan: null };

      const feedback = classifyAttempt({
        playedSan: san,
        expectedSan: current.expectedSan,
        legal,
        bestScore: scores.best,
        playedScore: scores.played,
        bestSan: scores.bestSan,
      });

      if (!legal) {
        setState((previous) => ({ ...previous, phase: 'waiting', feedback, playedSan: null }));
        return;
      }

      const loss =
        scores.best && scores.played ? centipawnLoss(scores.best, scores.played) : null;

      progressRef.current = {
        ...progressRef.current,
        answered: progressRef.current.answered + 1,
        correct: progressRef.current.correct + (feedback.verdict === 'repertoire' ? 1 : 0),
      };

      try {
        await recordTraining({
          repertoireId: current.repertoireId,
          nodeId: current.node.id,
          positionKey: positionKey(current.fen),
          color: current.color,
          attemptedMove: san,
          expectedMove: current.expectedSan,
          verdict: feedback.verdict,
          responseTimeMs,
          engineEvaluation: scores.played ? scoreToCp(scores.played) : null,
          engineQuality: feedback.verdict === 'repertoire' ? 1 : engineQualityFromLoss(loss ?? 0),
          mode: modeRef.current,
        });
      } catch (error) {
        console.warn('[papfish] could not save the attempt', error);
      }

      // Drills add a speed component on top of correctness.
      if (timeLimitRef.current) {
        drillScoreRef.current += scoreDrill(
          feedback.verdict,
          responseTimeMs,
          timeLimitRef.current,
        ).score;
      }

      setState((previous) => ({
        ...previous,
        phase: 'feedback',
        fen: playedFen ?? previous.fen,
        expectedSan: current.expectedSan,
        playedSan: san,
        feedback,
        deadlineAt: null,
        drillScore: drillScoreRef.current,
        progress: { ...progressRef.current },
      }));
    },
    [evaluateMove, recordTraining, state.phase],
  );

  /**
   * The drill clock ran out. A position that could not be recalled in time is
   * a lapse: it is recorded, so the scheduler brings it back sooner.
   */
  const timeout = useCallback(async () => {
    const current = currentRef.current;
    if (!current || state.phase !== 'waiting') return;

    const responseTimeMs = timeLimitRef.current ?? Date.now() - startedAtRef.current;

    progressRef.current = {
      ...progressRef.current,
      answered: progressRef.current.answered + 1,
    };

    try {
      await recordTraining({
        repertoireId: current.repertoireId,
        nodeId: current.node.id,
        positionKey: positionKey(current.fen),
        color: current.color,
        attemptedMove: '(no move)',
        expectedMove: current.expectedSan,
        verdict: 'mistake',
        responseTimeMs,
        engineEvaluation: null,
        engineQuality: 0,
        mode: modeRef.current,
      });
    } catch (error) {
      console.warn('[papfish] could not save the timeout', error);
    }

    setState((previous) => ({
      ...previous,
      phase: 'feedback',
      timedOut: true,
      expectedSan: current.expectedSan,
      deadlineAt: null,
      feedback: {
        verdict: 'mistake',
        centipawnLoss: null,
        expectedSan: current.expectedSan,
        playedSan: '(no move)',
        bestSan: null,
        headline: 'Out of time',
        detail: `The clock ran out. Your repertoire plays ${current.expectedSan} here.`,
      },
      progress: { ...progressRef.current },
    }));
  }, [recordTraining, state.phase]);

  /** Move on from the feedback screen, playing the repertoire move if needed. */
  const advance = useCallback(async () => {
    const current = currentRef.current;
    if (!current) {
      nextFromQueue();
      return;
    }

    // A drill is about recall speed across many positions, not playing a line
    // out, so it never waits for an opponent reply.
    if (modeRef.current === 'drill') {
      nextFromQueue();
      return;
    }

    const fenAfterRepertoireMove = fenAfterSan(current.fen, current.expectedSan);
    if (!fenAfterRepertoireMove) {
      nextFromQueue();
      return;
    }

    const sanPath = [...current.sanPath, current.expectedSan];
    setState((previous) => ({
      ...previous,
      fen: fenAfterRepertoireMove,
      sanPath,
      feedback: null,
      playedSan: null,
      expectedSan: null,
    }));

    await playOpponentReply(fenAfterRepertoireMove, sanPath, current.repertoireId);
  }, [nextFromQueue, playOpponentReply]);

  const skip = useCallback(() => {
    nextFromQueue();
  }, [nextFromQueue]);

  const reset = useCallback(() => {
    queueRef.current = [];
    positionRef.current = 0;
    currentRef.current = null;
    timeLimitRef.current = null;
    drillScoreRef.current = 0;
    setState(IDLE_STATE);
  }, []);

  return { state, start, submitMove, timeout, advance, skip, reset, engineAvailable };
}

function scoreToCp(score: EngineScore): number {
  return score.type === 'mate' ? (score.value >= 0 ? 10000 : -10000) : score.value;
}

