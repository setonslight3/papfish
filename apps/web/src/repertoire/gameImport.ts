import type {
  Color,
  ImportedGameRecord,
  OpeningBook,
  RepertoireRecord,
  RepertoireTree,
} from '@papfish/core';
import { parsePgn, detectUserColor, reviewGame, splitName } from '@papfish/core';
import type { CreateGamePositionInput, PapfishRepository } from '@/data';

export interface ImportContext {
  repertoires: RepertoireRecord[];
  /** Repertoire id -> its move tree. */
  trees: Map<string, RepertoireTree>;
  book: OpeningBook | null;
}

export interface ImportOutcome {
  imported: ImportedGameRecord[];
  /** Games that could not be attributed to the user, with the reason. */
  skipped: { white: string; black: string; reason: string }[];
  /** Games that parsed only partially. */
  warnings: string[];
}

const MAX_ANALYSED_PLY = 40;

/** Lichess and Chess.com put the game id in the Site/Link header. */
function externalId(site: string | undefined, link: string | undefined): string | null {
  const source = link ?? site ?? '';
  const match = /(?:lichess\.org|chess\.com)\/(?:game\/live\/)?([A-Za-z0-9]{6,})/.exec(source);
  return match ? match[1] : null;
}

/**
 * Import games, compare each against the matching repertoire, and store the
 * positions worth revisiting.
 *
 * Nothing here modifies a repertoire: an imported game produces observations
 * and recommendations, and acting on them stays an explicit choice.
 */
export async function importGamesFromPgn(
  repository: PapfishRepository,
  userId: string,
  pgnText: string,
  aliases: string[],
  context: ImportContext,
): Promise<ImportOutcome> {
  const games = parsePgn(pgnText);
  if (games.length === 0) {
    throw new Error('No games found in that PGN.');
  }

  const outcome: ImportOutcome = { imported: [], skipped: [], warnings: [] };

  for (const game of games) {
    if (game.moves.length === 0) {
      outcome.skipped.push({
        white: game.white,
        black: game.black,
        reason: game.error ?? 'No readable moves',
      });
      continue;
    }

    const color = detectUserColor(game, aliases);
    if (!color) {
      outcome.skipped.push({
        white: game.white,
        black: game.black,
        reason: 'Neither player matched your names - add the one you play under.',
      });
      continue;
    }

    if (game.error) outcome.warnings.push(`${game.white} vs ${game.black}: ${game.error}`);

    const repertoire = pickRepertoire(context.repertoires, color);
    const tree = repertoire ? context.trees.get(repertoire.id) : undefined;
    const review = tree
      ? reviewGame(game, color, tree, MAX_ANALYSED_PLY)
      : null;

    const identification = context.book?.identifyFromFens(
      game.moves.slice(0, MAX_ANALYSED_PLY).map((move) => move.after),
    );

    const record = await repository.createImportedGame(userId, {
      source: 'pgn',
      externalGameId: externalId(game.headers.site, game.headers.link),
      whitePlayer: game.white,
      blackPlayer: game.black,
      result: game.result,
      playedAt: game.playedAt,
      pgn: game.pgn,
      openingCode: identification?.eco ?? game.headers.eco ?? null,
      openingName: identification?.name ?? game.headers.opening ?? null,
      userColor: color,
      inBookPlies: review?.inBookPlies ?? 0,
    });

    const deviationsByPly = new Map(
      (review?.deviations ?? []).map((deviation) => [deviation.ply, deviation]),
    );

    const positions: CreateGamePositionInput[] = game.moves
      .slice(0, MAX_ANALYSED_PLY)
      .map((move) => {
        const isUserMove = color === 'white' ? move.ply % 2 === 1 : move.ply % 2 === 0;
        const deviation = deviationsByPly.get(move.ply);
        const inBook = review !== null && move.ply <= review.inBookPlies;

        return {
          importedGameId: record.id,
          ply: move.ply,
          fen: move.before,
          positionKey: move.before.split(/\s+/).slice(0, 4).join(' '),
          movePlayed: move.san,
          expectedMove: deviation?.expectedSan ?? null,
          engineEvaluation: null,
          repertoireMatch: inBook,
          // Worth training: the user's own deviations, and positions where the
          // opponent left the repertoire and the user was on their own.
          trainingRecommended: Boolean(deviation) && (isUserMove || deviation!.side === 'opponent'),
          note: deviation
            ? deviation.side === 'user'
              ? `Left your repertoire: ${deviation.playedSan}${
                  deviation.expectedSan ? ` instead of ${deviation.expectedSan}` : ''
                }`
              : `Opponent played ${deviation.playedSan}, which your repertoire does not cover`
            : null,
        };
      });

    await repository.createGamePositions(userId, positions);
    outcome.imported.push(record);
  }

  if (outcome.imported.length === 0 && outcome.skipped.length > 0) {
    throw new Error(outcome.skipped[0].reason);
  }

  return outcome;
}

function pickRepertoire(
  repertoires: RepertoireRecord[],
  color: Color,
): RepertoireRecord | undefined {
  return repertoires.find((repertoire) => repertoire.color === color);
}

/** Human-readable opening label for a stored game. */
export function gameOpeningLabel(game: ImportedGameRecord): string {
  if (!game.openingName) return 'Unclassified';
  const { opening, variation } = splitName(game.openingName);
  return variation ? `${opening}: ${variation}` : opening;
}
