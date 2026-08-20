import type { CriticalMoment, EngineScore, ImportedGameRecord } from '@papfish/core';
import { classifySwing, criticalMoments, parseGame, positionKey, uciToSan } from '@papfish/core';
import type { StockfishEngine } from '@/engine/StockfishEngine';
import type { CreateGamePositionInput, PapfishRepository } from '@/data';

export interface AnalyseGameOptions {
  /** How deep to search each position. */
  depth?: number;
  /** Stop after this many plies; opening study rarely needs the whole game. */
  maxPly?: number;
  /** Called after each analysed ply so the interface can show progress. */
  onProgress?: (done: number, total: number) => void;
  signal?: { aborted: boolean };
}

export interface GameAnalysisResult {
  moments: CriticalMoment[];
  analysedPlies: number;
}

/**
 * Run the engine over the user's own moves in an imported game.
 *
 * Only the user's moves are analysed - the opponent's mistakes are not the
 * user's training material - and the result is stored so the work is done once.
 * Each move is judged by the swing it caused rather than by raw centipawns.
 */
export async function analyseImportedGame(
  engine: StockfishEngine,
  repository: PapfishRepository,
  userId: string,
  game: ImportedGameRecord,
  options: AnalyseGameOptions = {},
): Promise<GameAnalysisResult> {
  const depth = options.depth ?? 12;
  const maxPly = options.maxPly ?? 30;

  const parsed = parseGame(game.pgn);
  const moves = parsed.moves.slice(0, maxPly);
  const userMoves = moves.filter((move) =>
    game.userColor === 'white' ? move.ply % 2 === 1 : move.ply % 2 === 0,
  );

  const moments: CriticalMoment[] = [];
  const updates: CreateGamePositionInput[] = [];
  let analysed = 0;

  for (const move of userMoves) {
    if (options.signal?.aborted) break;

    const before = await engine.analyse(move.before, { depth, multiPv: 1 });
    const beforeScore = before.lines[0]?.score ?? null;
    const after = await engine.analyse(move.after, { depth, multiPv: 1 });
    const afterOpponentScore = after.lines[0]?.score ?? null;

    analysed += 1;
    options.onProgress?.(analysed, userMoves.length);

    if (!beforeScore || !afterOpponentScore) continue;

    // The score after the move is from the opponent's point of view.
    const afterScore: EngineScore = {
      type: afterOpponentScore.type,
      value: -afterOpponentScore.value,
    };

    const swing = classifySwing(beforeScore, afterScore);
    const bestMove = before.bestMove ? uciToSan(move.before, before.bestMove) : null;

    moments.push({
      ply: move.ply,
      fen: move.before,
      positionKey: positionKey(move.before),
      movePlayed: move.san,
      bestMove,
      swing,
    });

    updates.push({
      importedGameId: game.id,
      ply: move.ply,
      fen: move.before,
      positionKey: positionKey(move.before),
      movePlayed: move.san,
      expectedMove: bestMove,
      engineEvaluation: beforeScore.type === 'cp' ? beforeScore.value : null,
      repertoireMatch: false,
      trainingRecommended: swing.severity === 'mistake' || swing.severity === 'blunder',
      note:
        swing.severity === 'ok'
          ? null
          : `${swing.severity === 'blunder' ? 'Blunder' : swing.severity === 'mistake' ? 'Mistake' : 'Inaccuracy'}: ${move.san} gave away ${swing.winChanceDrop}% of the win${
              bestMove ? `; the engine prefers ${bestMove}` : ''
            }.`,
    });
  }

  // Positions already stored for this game carry the repertoire comparison;
  // merge rather than replace so both kinds of note survive.
  const existing = await repository.listGamePositions(userId, game.id);
  const byPly = new Map(existing.map((position) => [position.ply, position]));

  const merged = updates.map((update) => {
    const previous = byPly.get(update.ply);
    if (!previous) return update;
    return {
      ...update,
      repertoireMatch: previous.repertoireMatch,
      trainingRecommended: update.trainingRecommended || previous.trainingRecommended,
      // Two different observations about the same move; keep both, separated.
      note:
        previous.note && update.note
          ? `${previous.note} · ${update.note}`
          : (previous.note ?? update.note),
      expectedMove: previous.expectedMove ?? update.expectedMove,
    };
  });

  if (merged.length > 0) {
    await repository.createGamePositions(userId, merged);
  }

  return { moments: criticalMoments(moments), analysedPlies: analysed };
}
