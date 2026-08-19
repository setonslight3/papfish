import type {
  Color,
  OpeningBook,
  RepertoireNodeRecord,
  RepertoireRecord,
  StarterRepertoire,
} from '@papfish/core';
import { START_FEN, isMoveOfColor, positionKey, replaySan, splitName } from '@papfish/core';
import type { PapfishRepository } from '@/data';

function nodeName(book: OpeningBook | null, fen: string): { openingName: string | null; variationName: string | null } {
  const entry = book?.lookupByFen(fen) ?? null;
  if (!entry) return { openingName: null, variationName: null };
  const parts = splitName(entry.name);
  return { openingName: parts.opening, variationName: parts.variation };
}

/**
 * Create a repertoire from shipped opening lines.
 *
 * Lines are replayed with the rules library and merged into a tree, so shared
 * openings are stored once and the branches hang off the position where they
 * actually diverge.
 */
export async function createRepertoireFromStarter(
  repository: PapfishRepository,
  userId: string,
  starter: StarterRepertoire,
  book: OpeningBook | null,
): Promise<{ repertoire: RepertoireRecord; nodes: RepertoireNodeRecord[] }> {
  const repertoire = await repository.createRepertoire(userId, {
    name: starter.name,
    color: starter.color,
    openingCode: starter.openingCode,
    openingName: starter.openingName,
    description: starter.description,
  });

  const created = new Map<string, RepertoireNodeRecord>();

  for (const line of starter.lines) {
    const played = replaySan(line.moves);
    let parentId: string | null = null;
    let path = '';

    for (const move of played) {
      path = path ? `${path} ${move.san}` : move.san;
      const existing = created.get(path);
      if (existing) {
        parentId = existing.id;
        continue;
      }

      const names = nodeName(book, move.after);
      const node = await repository.createNode(userId, {
        repertoireId: repertoire.id,
        parentNodeId: parentId,
        fen: move.after,
        positionKey: positionKey(move.after),
        moveSan: move.san,
        moveUci: move.uci,
        ply: move.ply,
        isUserMove: isMoveOfColor(move.ply, starter.color),
        openingName: names.openingName,
        variationName: names.variationName,
      });
      created.set(path, node);
      parentId = node.id;
    }
  }

  return { repertoire, nodes: Array.from(created.values()) };
}

export interface AddMoveResult {
  created: RepertoireNodeRecord[];
  node: RepertoireNodeRecord;
}

/**
 * Add a move to a repertoire at the end of `sanPath`, creating any missing
 * ancestors so a move chosen deep in the explorer is reachable from the root.
 */
export async function addMoveToRepertoire(
  repository: PapfishRepository,
  userId: string,
  repertoire: RepertoireRecord,
  existingNodes: RepertoireNodeRecord[],
  sanPath: string[],
  san: string,
  book: OpeningBook | null,
): Promise<AddMoveResult> {
  const fullPath = [...sanPath, san];
  const played = replaySan(fullPath, START_FEN);

  const byPath = new Map<string, RepertoireNodeRecord>();
  const byParent = new Map<string, RepertoireNodeRecord[]>();
  for (const node of existingNodes) {
    const list = byParent.get(node.parentNodeId ?? '') ?? [];
    list.push(node);
    byParent.set(node.parentNodeId ?? '', list);
  }

  // Rebuild path keys for the existing tree so we can find the deepest match.
  const indexPath = (parentId: string | null, prefix: string) => {
    for (const child of byParent.get(parentId ?? '') ?? []) {
      const path = prefix ? `${prefix} ${child.moveSan}` : child.moveSan;
      byPath.set(path, child);
      indexPath(child.id, path);
    }
  };
  indexPath(null, '');

  const created: RepertoireNodeRecord[] = [];
  let parentId: string | null = null;
  let path = '';
  let current: RepertoireNodeRecord | null = null;

  for (const move of played) {
    path = path ? `${path} ${move.san}` : move.san;
    const existing = byPath.get(path);
    if (existing) {
      parentId = existing.id;
      current = existing;
      continue;
    }

    const names = nodeName(book, move.after);
    const node = await repository.createNode(userId, {
      repertoireId: repertoire.id,
      parentNodeId: parentId,
      fen: move.after,
      positionKey: positionKey(move.after),
      moveSan: move.san,
      moveUci: move.uci,
      ply: move.ply,
      isUserMove: isMoveOfColor(move.ply, repertoire.color),
      openingName: names.openingName,
      variationName: names.variationName,
    });
    created.push(node);
    byPath.set(path, node);
    parentId = node.id;
    current = node;
  }

  if (!current) throw new Error('Could not add move to repertoire');
  return { created, node: current };
}

/** The repertoire move stored for a position reached by `sanPath`, if any. */
export function repertoireMoveFor(
  nodes: RepertoireNodeRecord[],
  sanPath: string[],
): RepertoireNodeRecord | null {
  const byParent = new Map<string, RepertoireNodeRecord[]>();
  for (const node of nodes) {
    const list = byParent.get(node.parentNodeId ?? '') ?? [];
    list.push(node);
    byParent.set(node.parentNodeId ?? '', list);
  }

  let parentId: string | null = null;
  for (const san of sanPath) {
    const child: RepertoireNodeRecord | undefined = (byParent.get(parentId ?? '') ?? []).find(
      (node) => node.moveSan === san,
    );
    if (!child) return null;
    parentId = child.id;
  }

  const candidates = byParent.get(parentId ?? '') ?? [];
  return candidates.find((node) => node.isUserMove) ?? candidates[0] ?? null;
}

/** Colour whose repertoire a node belongs to, used for White/Black separation. */
export function nodeColor(node: RepertoireNodeRecord): Color {
  return node.ply % 2 === 1 ? 'white' : 'black';
}
