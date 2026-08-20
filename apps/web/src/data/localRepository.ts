import type {
  ImportedGameRecord,
  MasteryRecord,
  PersonalGamePositionRecord,
  PositionStats,
  ProfileRecord,
  RepertoireNodeRecord,
  RepertoireRecord,
  TrainingAttemptRecord,
} from '@papfish/core';
import { DEFAULT_RATING_BUCKET, DEFAULT_TIME_CONTROL, normalizeStats } from '@papfish/core';
import { createId } from '@/lib/id';
import type {
  CreateGamePositionInput,
  CreateImportedGameInput,
  CreateNodeInput,
  CreateRepertoireInput,
  PapfishRepository,
  RecordAttemptInput,
  StatsQuery,
  UpsertMasteryInput,
} from './types';

const PREFIX = 'papfish:local';

interface LocalState {
  profile: ProfileRecord | null;
  repertoires: RepertoireRecord[];
  nodes: RepertoireNodeRecord[];
  attempts: TrainingAttemptRecord[];
  mastery: MasteryRecord[];
  games: ImportedGameRecord[];
  gamePositions: PersonalGamePositionRecord[];
}

function emptyState(): LocalState {
  return {
    profile: null,
    repertoires: [],
    nodes: [],
    attempts: [],
    mastery: [],
    games: [],
    gamePositions: [],
  };
}

function read(userId: string): LocalState {
  try {
    const raw = window.localStorage.getItem(`${PREFIX}:${userId}`);
    if (!raw) return emptyState();
    return { ...emptyState(), ...(JSON.parse(raw) as Partial<LocalState>) };
  } catch {
    return emptyState();
  }
}

function write(userId: string, state: LocalState): void {
  window.localStorage.setItem(`${PREFIX}:${userId}`, JSON.stringify(state));
}

function now(): string {
  return new Date().toISOString();
}

/**
 * Local-storage storage backend.
 *
 * Used only when no Supabase project is configured, so the application can be
 * run and evaluated end to end before cloud credentials exist. Data stays on
 * one device and is not shared between browsers - the Supabase backend is the
 * product default.
 */
export class LocalRepository implements PapfishRepository {
  readonly kind = 'local' as const;

  private mutate<T>(userId: string, fn: (state: LocalState) => T): T {
    const state = read(userId);
    const result = fn(state);
    write(userId, state);
    return result;
  }

  async getProfile(userId: string): Promise<ProfileRecord | null> {
    return read(userId).profile;
  }

  async updateProfile(
    userId: string,
    patch: Partial<Pick<ProfileRecord, 'displayName' | 'ratingBucket' | 'timeControl'>>,
  ): Promise<ProfileRecord> {
    return this.mutate(userId, (state) => {
      const base: ProfileRecord = state.profile ?? {
        userId,
        displayName: null,
        ratingBucket: DEFAULT_RATING_BUCKET,
        timeControl: DEFAULT_TIME_CONTROL,
        createdAt: now(),
        updatedAt: now(),
      };
      state.profile = { ...base, ...patch, updatedAt: now() };
      return state.profile;
    });
  }

  async listRepertoires(userId: string): Promise<RepertoireRecord[]> {
    return read(userId).repertoires;
  }

  async createRepertoire(userId: string, input: CreateRepertoireInput): Promise<RepertoireRecord> {
    return this.mutate(userId, (state) => {
      const record: RepertoireRecord = {
        id: createId(),
        userId,
        name: input.name,
        color: input.color,
        openingCode: input.openingCode ?? null,
        openingName: input.openingName ?? null,
        description: input.description ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      state.repertoires.push(record);
      return record;
    });
  }

  async deleteRepertoire(userId: string, repertoireId: string): Promise<void> {
    this.mutate(userId, (state) => {
      state.repertoires = state.repertoires.filter((item) => item.id !== repertoireId);
      state.nodes = state.nodes.filter((node) => node.repertoireId !== repertoireId);
      state.mastery = state.mastery.filter((item) => item.repertoireId !== repertoireId);
    });
  }

  async listNodes(userId: string, repertoireId: string): Promise<RepertoireNodeRecord[]> {
    return read(userId).nodes.filter((node) => node.repertoireId === repertoireId);
  }

  async listAllNodes(userId: string): Promise<RepertoireNodeRecord[]> {
    return read(userId).nodes;
  }

  async createNode(userId: string, input: CreateNodeInput): Promise<RepertoireNodeRecord> {
    const [node] = await this.createNodes(userId, [input]);
    return node;
  }

  async createNodes(userId: string, inputs: CreateNodeInput[]): Promise<RepertoireNodeRecord[]> {
    return this.mutate(userId, (state) => {
      const created: RepertoireNodeRecord[] = [];
      for (const input of inputs) {
        const duplicate = state.nodes.find(
          (node) =>
            node.repertoireId === input.repertoireId &&
            node.parentNodeId === input.parentNodeId &&
            node.moveSan === input.moveSan,
        );
        if (duplicate) {
          created.push(duplicate);
          continue;
        }
        const record: RepertoireNodeRecord = {
          id: createId(),
          repertoireId: input.repertoireId,
          parentNodeId: input.parentNodeId,
          fen: input.fen,
          positionKey: input.positionKey,
          moveSan: input.moveSan,
          moveUci: input.moveUci,
          ply: input.ply,
          openingName: input.openingName ?? null,
          variationName: input.variationName ?? null,
          isUserMove: input.isUserMove,
          notes: input.notes ?? null,
          createdAt: now(),
          updatedAt: now(),
        };
        state.nodes.push(record);
        created.push(record);
      }
      return created;
    });
  }

  async deleteNode(userId: string, nodeId: string): Promise<void> {
    this.mutate(userId, (state) => {
      const doomed = new Set<string>([nodeId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const node of state.nodes) {
          if (node.parentNodeId && doomed.has(node.parentNodeId) && !doomed.has(node.id)) {
            doomed.add(node.id);
            changed = true;
          }
        }
      }
      state.nodes = state.nodes.filter((node) => !doomed.has(node.id));
    });
  }

  async updateNode(
    userId: string,
    nodeId: string,
    patch: Partial<Pick<RepertoireNodeRecord, 'notes' | 'isUserMove'>>,
  ): Promise<RepertoireNodeRecord> {
    return this.mutate(userId, (state) => {
      const node = state.nodes.find((item) => item.id === nodeId);
      if (!node) throw new Error('Move not found');
      Object.assign(node, patch, { updatedAt: now() });
      return node;
    });
  }

  async recordAttempt(userId: string, input: RecordAttemptInput): Promise<TrainingAttemptRecord> {
    return this.mutate(userId, (state) => {
      const record: TrainingAttemptRecord = {
        id: createId(),
        userId,
        repertoireId: input.repertoireId,
        repertoireNodeId: input.repertoireNodeId,
        positionKey: input.positionKey,
        color: input.color,
        attemptedMove: input.attemptedMove,
        expectedMove: input.expectedMove,
        engineEvaluation: input.engineEvaluation,
        result: input.result,
        responseTimeMs: Math.round(input.responseTimeMs),
        mode: input.mode,
        createdAt: now(),
      };
      state.attempts.unshift(record);
      state.attempts = state.attempts.slice(0, 500);
      return record;
    });
  }

  async listRecentAttempts(userId: string, limit = 25): Promise<TrainingAttemptRecord[]> {
    return read(userId).attempts.slice(0, limit);
  }

  async listMastery(userId: string): Promise<MasteryRecord[]> {
    return read(userId).mastery;
  }

  async upsertMastery(userId: string, input: UpsertMasteryInput): Promise<MasteryRecord> {
    return this.mutate(userId, (state) => {
      const existing = state.mastery.find(
        (item) => item.repertoireId === input.repertoireId && item.positionKey === input.positionKey,
      );
      const record: MasteryRecord = {
        userId,
        repertoireId: input.repertoireId,
        positionKey: input.positionKey,
        color: input.color,
        attempts: input.attempts,
        correctAttempts: input.correctAttempts,
        masteryScore: input.masteryScore,
        difficulty: input.difficulty,
        streak: input.streak,
        averageResponseMs: Math.round(input.averageResponseMs),
        intervalDays: input.intervalDays,
        nextReviewAt: input.nextReviewAt,
        lastReviewedAt: now(),
        updatedAt: now(),
      };
      if (existing) {
        Object.assign(existing, record);
        return existing;
      }
      state.mastery.push(record);
      return record;
    });
  }

  async listImportedGames(userId: string, limit = 100): Promise<ImportedGameRecord[]> {
    return read(userId)
      .games.slice()
      .sort((a, b) => (b.playedAt ?? b.createdAt).localeCompare(a.playedAt ?? a.createdAt))
      .slice(0, limit);
  }

  async createImportedGame(
    userId: string,
    input: CreateImportedGameInput,
  ): Promise<ImportedGameRecord> {
    return this.mutate(userId, (state) => {
      const existing = input.externalGameId
        ? state.games.find((game) => game.externalGameId === input.externalGameId)
        : undefined;

      const record: ImportedGameRecord = {
        id: existing?.id ?? createId(),
        userId,
        source: input.source,
        externalGameId: input.externalGameId,
        whitePlayer: input.whitePlayer,
        blackPlayer: input.blackPlayer,
        result: input.result,
        playedAt: input.playedAt,
        pgn: input.pgn,
        openingCode: input.openingCode,
        openingName: input.openingName,
        userColor: input.userColor,
        inBookPlies: input.inBookPlies,
        createdAt: existing?.createdAt ?? now(),
      };

      if (existing) {
        Object.assign(existing, record);
        // Re-importing a game replaces the positions derived from it.
        state.gamePositions = state.gamePositions.filter(
          (position) => position.importedGameId !== existing.id,
        );
        return existing;
      }

      state.games.push(record);
      return record;
    });
  }

  async deleteImportedGame(userId: string, gameId: string): Promise<void> {
    this.mutate(userId, (state) => {
      state.games = state.games.filter((game) => game.id !== gameId);
      state.gamePositions = state.gamePositions.filter(
        (position) => position.importedGameId !== gameId,
      );
    });
  }

  async listGamePositions(
    userId: string,
    gameId?: string,
  ): Promise<PersonalGamePositionRecord[]> {
    const positions = read(userId).gamePositions;
    return gameId ? positions.filter((position) => position.importedGameId === gameId) : positions;
  }

  async createGamePositions(
    userId: string,
    inputs: CreateGamePositionInput[],
  ): Promise<PersonalGamePositionRecord[]> {
    return this.mutate(userId, (state) => {
      const created: PersonalGamePositionRecord[] = [];
      for (const input of inputs) {
        const duplicate = state.gamePositions.find(
          (position) =>
            position.importedGameId === input.importedGameId && position.ply === input.ply,
        );
        if (duplicate) {
          Object.assign(duplicate, input);
          created.push(duplicate);
          continue;
        }
        const record: PersonalGamePositionRecord = {
          id: createId(),
          userId,
          createdAt: now(),
          ...input,
        };
        state.gamePositions.push(record);
        created.push(record);
      }
      return created;
    });
  }

  /**
   * Statistics are shared reference data. Without Supabase the only local
   * source is a snapshot produced by the pipeline; when it is absent this
   * returns null rather than inventing numbers.
   */
  async getPositionStats(query: StatsQuery): Promise<PositionStats | null> {
    const snapshot = await loadSnapshot();
    const row = snapshot?.[`${query.positionKey}|${query.ratingBucket}|${query.timeControl}`];
    return row ? normalizeStats(row) : null;
  }
}

let snapshotPromise: Promise<Record<string, PositionStats> | null> | null = null;

async function loadSnapshot(): Promise<Record<string, PositionStats> | null> {
  if (!snapshotPromise) {
    snapshotPromise = fetch('/data/opening-stats.local.json')
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { rows?: Record<string, PositionStats> } | null) => body?.rows ?? null)
      .catch(() => null);
  }
  return snapshotPromise;
}
