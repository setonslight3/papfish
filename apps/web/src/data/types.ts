import type {
  Color,
  MasteryRecord,
  MoveVerdict,
  PositionStats,
  ProfileRecord,
  RatingBucket,
  RepertoireNodeRecord,
  RepertoireRecord,
  TimeControl,
  TrainingAttemptRecord,
} from '@papfish/core';

export interface CreateRepertoireInput {
  name: string;
  color: Color;
  openingCode?: string | null;
  openingName?: string | null;
  description?: string | null;
}

export interface CreateNodeInput {
  repertoireId: string;
  parentNodeId: string | null;
  fen: string;
  positionKey: string;
  moveSan: string;
  moveUci: string;
  ply: number;
  isUserMove: boolean;
  openingName?: string | null;
  variationName?: string | null;
  notes?: string | null;
}

export interface RecordAttemptInput {
  repertoireId: string | null;
  repertoireNodeId: string | null;
  positionKey: string;
  color: Color;
  attemptedMove: string;
  expectedMove: string | null;
  engineEvaluation: number | null;
  result: MoveVerdict;
  responseTimeMs: number;
}

export interface UpsertMasteryInput {
  repertoireId: string;
  positionKey: string;
  color: Color;
  attempts: number;
  correctAttempts: number;
  masteryScore: number;
  difficulty: number;
  streak: number;
  averageResponseMs: number;
}

export interface StatsQuery {
  positionKey: string;
  ratingBucket: RatingBucket;
  timeControl: TimeControl;
}

/**
 * Everything the application needs from persistent storage.
 *
 * The interface exists so the Supabase-backed implementation (the product
 * default) and the local-storage implementation (used when no project is
 * configured) can never drift apart, and so the UI never talks to a database
 * client directly.
 */
export interface PapfishRepository {
  readonly kind: 'supabase' | 'local';

  getProfile(userId: string): Promise<ProfileRecord | null>;
  updateProfile(
    userId: string,
    patch: Partial<Pick<ProfileRecord, 'displayName' | 'ratingBucket' | 'timeControl'>>,
  ): Promise<ProfileRecord>;

  listRepertoires(userId: string): Promise<RepertoireRecord[]>;
  createRepertoire(userId: string, input: CreateRepertoireInput): Promise<RepertoireRecord>;
  deleteRepertoire(userId: string, repertoireId: string): Promise<void>;

  listNodes(userId: string, repertoireId: string): Promise<RepertoireNodeRecord[]>;
  listAllNodes(userId: string): Promise<RepertoireNodeRecord[]>;
  createNode(userId: string, input: CreateNodeInput): Promise<RepertoireNodeRecord>;
  createNodes(userId: string, inputs: CreateNodeInput[]): Promise<RepertoireNodeRecord[]>;
  deleteNode(userId: string, nodeId: string): Promise<void>;
  updateNode(
    userId: string,
    nodeId: string,
    patch: Partial<Pick<RepertoireNodeRecord, 'notes' | 'isUserMove'>>,
  ): Promise<RepertoireNodeRecord>;

  recordAttempt(userId: string, input: RecordAttemptInput): Promise<TrainingAttemptRecord>;
  listRecentAttempts(userId: string, limit?: number): Promise<TrainingAttemptRecord[]>;

  listMastery(userId: string): Promise<MasteryRecord[]>;
  upsertMastery(userId: string, input: UpsertMasteryInput): Promise<MasteryRecord>;

  getPositionStats(query: StatsQuery): Promise<PositionStats | null>;
}
