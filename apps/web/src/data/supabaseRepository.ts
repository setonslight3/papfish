import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MasteryRecord,
  MoveStat,
  PositionStats,
  ProfileRecord,
  RepertoireNodeRecord,
  RepertoireRecord,
  TrainingAttemptRecord,
} from '@papfish/core';
import { normalizeStats } from '@papfish/core';
import type {
  CreateNodeInput,
  CreateRepertoireInput,
  PapfishRepository,
  RecordAttemptInput,
  StatsQuery,
  UpsertMasteryInput,
} from './types';

type Row = Record<string, unknown>;

function fail(context: string, error: { message: string } | null): never | void {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

function toProfile(row: Row): ProfileRecord {
  return {
    userId: row.user_id as string,
    displayName: (row.display_name as string | null) ?? null,
    ratingBucket: row.rating_bucket as ProfileRecord['ratingBucket'],
    timeControl: row.time_control as ProfileRecord['timeControl'],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function toRepertoire(row: Row): RepertoireRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    color: row.color as RepertoireRecord['color'],
    openingCode: (row.opening_code as string | null) ?? null,
    openingName: (row.opening_name as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function toNode(row: Row): RepertoireNodeRecord {
  return {
    id: row.id as string,
    repertoireId: row.repertoire_id as string,
    parentNodeId: (row.parent_node_id as string | null) ?? null,
    fen: row.fen as string,
    positionKey: row.position_key as string,
    moveSan: row.move_san as string,
    moveUci: row.move_uci as string,
    ply: row.ply as number,
    openingName: (row.opening_name as string | null) ?? null,
    variationName: (row.variation_name as string | null) ?? null,
    isUserMove: row.is_user_move as boolean,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function toAttempt(row: Row): TrainingAttemptRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    repertoireId: (row.repertoire_id as string | null) ?? null,
    repertoireNodeId: (row.repertoire_node_id as string | null) ?? null,
    positionKey: row.position_key as string,
    color: row.color as TrainingAttemptRecord['color'],
    attemptedMove: row.attempted_move as string,
    expectedMove: (row.expected_move as string | null) ?? null,
    engineEvaluation: (row.engine_evaluation as number | null) ?? null,
    result: row.result as TrainingAttemptRecord['result'],
    responseTimeMs: row.response_time_ms as number,
    createdAt: row.created_at as string,
  };
}

function toMastery(row: Row): MasteryRecord {
  return {
    userId: row.user_id as string,
    positionKey: row.position_key as string,
    repertoireId: row.repertoire_id as string,
    color: row.color as MasteryRecord['color'],
    attempts: row.attempts as number,
    correctAttempts: row.correct_attempts as number,
    masteryScore: row.mastery_score as number,
    difficulty: row.difficulty as number,
    streak: row.streak as number,
    averageResponseMs: row.average_response_ms as number,
    lastReviewedAt: (row.last_reviewed_at as string | null) ?? null,
    updatedAt: row.updated_at as string,
  };
}

function nodeInsert(input: CreateNodeInput): Row {
  return {
    repertoire_id: input.repertoireId,
    parent_node_id: input.parentNodeId,
    fen: input.fen,
    position_key: input.positionKey,
    move_san: input.moveSan,
    move_uci: input.moveUci,
    ply: input.ply,
    is_user_move: input.isUserMove,
    opening_name: input.openingName ?? null,
    variation_name: input.variationName ?? null,
    notes: input.notes ?? null,
  };
}

/**
 * Supabase-backed storage.
 *
 * Every query is additionally scoped by user id even though Row Level Security
 * already enforces isolation server-side - defence in depth, and it keeps the
 * intent of each query obvious.
 */
export class SupabaseRepository implements PapfishRepository {
  readonly kind = 'supabase' as const;

  constructor(private readonly supabase: SupabaseClient) {}

  async getProfile(userId: string): Promise<ProfileRecord | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    fail('Could not load profile', error);
    return data ? toProfile(data) : null;
  }

  async updateProfile(
    userId: string,
    patch: Partial<Pick<ProfileRecord, 'displayName' | 'ratingBucket' | 'timeControl'>>,
  ): Promise<ProfileRecord> {
    const payload: Row = { user_id: userId };
    if (patch.displayName !== undefined) payload.display_name = patch.displayName;
    if (patch.ratingBucket !== undefined) payload.rating_bucket = patch.ratingBucket;
    if (patch.timeControl !== undefined) payload.time_control = patch.timeControl;

    const { data, error } = await this.supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single();
    fail('Could not save profile', error);
    return toProfile(data as Row);
  }

  async listRepertoires(userId: string): Promise<RepertoireRecord[]> {
    const { data, error } = await this.supabase
      .from('repertoires')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    fail('Could not load repertoires', error);
    return (data ?? []).map(toRepertoire);
  }

  async createRepertoire(userId: string, input: CreateRepertoireInput): Promise<RepertoireRecord> {
    const { data, error } = await this.supabase
      .from('repertoires')
      .insert({
        user_id: userId,
        name: input.name,
        color: input.color,
        opening_code: input.openingCode ?? null,
        opening_name: input.openingName ?? null,
        description: input.description ?? null,
      })
      .select()
      .single();
    fail('Could not create repertoire', error);
    return toRepertoire(data as Row);
  }

  async deleteRepertoire(userId: string, repertoireId: string): Promise<void> {
    const { error } = await this.supabase
      .from('repertoires')
      .delete()
      .eq('id', repertoireId)
      .eq('user_id', userId);
    fail('Could not delete repertoire', error);
  }

  async listNodes(userId: string, repertoireId: string): Promise<RepertoireNodeRecord[]> {
    const { data, error } = await this.supabase
      .from('repertoire_nodes')
      .select('*, repertoires!inner(user_id)')
      .eq('repertoire_id', repertoireId)
      .eq('repertoires.user_id', userId)
      .order('ply', { ascending: true });
    fail('Could not load repertoire moves', error);
    return (data ?? []).map(toNode);
  }

  async listAllNodes(userId: string): Promise<RepertoireNodeRecord[]> {
    const { data, error } = await this.supabase
      .from('repertoire_nodes')
      .select('*, repertoires!inner(user_id)')
      .eq('repertoires.user_id', userId)
      .order('ply', { ascending: true });
    fail('Could not load repertoire moves', error);
    return (data ?? []).map(toNode);
  }

  async createNode(userId: string, input: CreateNodeInput): Promise<RepertoireNodeRecord> {
    const [node] = await this.createNodes(userId, [input]);
    return node;
  }

  async createNodes(_userId: string, inputs: CreateNodeInput[]): Promise<RepertoireNodeRecord[]> {
    if (inputs.length === 0) return [];
    const { data, error } = await this.supabase
      .from('repertoire_nodes')
      .insert(inputs.map(nodeInsert))
      .select();
    fail('Could not save repertoire moves', error);
    return (data ?? []).map(toNode);
  }

  async deleteNode(_userId: string, nodeId: string): Promise<void> {
    const { error } = await this.supabase.from('repertoire_nodes').delete().eq('id', nodeId);
    fail('Could not delete move', error);
  }

  async updateNode(
    _userId: string,
    nodeId: string,
    patch: Partial<Pick<RepertoireNodeRecord, 'notes' | 'isUserMove'>>,
  ): Promise<RepertoireNodeRecord> {
    const payload: Row = {};
    if (patch.notes !== undefined) payload.notes = patch.notes;
    if (patch.isUserMove !== undefined) payload.is_user_move = patch.isUserMove;

    const { data, error } = await this.supabase
      .from('repertoire_nodes')
      .update(payload)
      .eq('id', nodeId)
      .select()
      .single();
    fail('Could not update move', error);
    return toNode(data as Row);
  }

  async recordAttempt(userId: string, input: RecordAttemptInput): Promise<TrainingAttemptRecord> {
    const { data, error } = await this.supabase
      .from('training_attempts')
      .insert({
        user_id: userId,
        repertoire_id: input.repertoireId,
        repertoire_node_id: input.repertoireNodeId,
        position_key: input.positionKey,
        color: input.color,
        attempted_move: input.attemptedMove,
        expected_move: input.expectedMove,
        engine_evaluation: input.engineEvaluation,
        result: input.result,
        response_time_ms: Math.round(input.responseTimeMs),
      })
      .select()
      .single();
    fail('Could not save training attempt', error);
    return toAttempt(data as Row);
  }

  async listRecentAttempts(userId: string, limit = 25): Promise<TrainingAttemptRecord[]> {
    const { data, error } = await this.supabase
      .from('training_attempts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    fail('Could not load training history', error);
    return (data ?? []).map(toAttempt);
  }

  async listMastery(userId: string): Promise<MasteryRecord[]> {
    const { data, error } = await this.supabase.from('mastery').select('*').eq('user_id', userId);
    fail('Could not load mastery', error);
    return (data ?? []).map(toMastery);
  }

  async upsertMastery(userId: string, input: UpsertMasteryInput): Promise<MasteryRecord> {
    const { data, error } = await this.supabase
      .from('mastery')
      .upsert(
        {
          user_id: userId,
          repertoire_id: input.repertoireId,
          position_key: input.positionKey,
          color: input.color,
          attempts: input.attempts,
          correct_attempts: input.correctAttempts,
          mastery_score: input.masteryScore,
          difficulty: input.difficulty,
          streak: input.streak,
          average_response_ms: Math.round(input.averageResponseMs),
          last_reviewed_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,repertoire_id,position_key' },
      )
      .select()
      .single();
    fail('Could not save mastery', error);
    return toMastery(data as Row);
  }

  async getPositionStats(query: StatsQuery): Promise<PositionStats | null> {
    const { data, error } = await this.supabase
      .from('opening_stats')
      .select('*')
      .eq('position_key', query.positionKey)
      .eq('rating_bucket', query.ratingBucket)
      .eq('time_control', query.timeControl)
      .maybeSingle();
    fail('Could not load opening statistics', error);
    if (!data) return null;

    return normalizeStats({
      positionKey: data.position_key as string,
      ratingBucket: data.rating_bucket as PositionStats['ratingBucket'],
      timeControl: data.time_control as PositionStats['timeControl'],
      source: data.source as PositionStats['source'],
      totalGames: data.total_games as number,
      moves: (data.moves ?? []) as MoveStat[],
      updatedAt: data.updated_at as string,
    });
  }
}
