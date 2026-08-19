import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import type { ReactNode } from 'react';
import { ITALIAN_GAME } from '@papfish/core';
import { AuthProvider } from '@/auth/AuthProvider';
import { LocalAuthAdapter } from '@/auth/localAuth';
import { EngineProvider } from '@/engine/EngineProvider';
import { StockfishEngine, __setEngineForTests } from '@/engine/StockfishEngine';
import { LocalRepository } from '@/data/localRepository';
import { RepertoireProvider, useRepertoires } from '@/repertoire/RepertoireProvider';
import { createRepertoireFromStarter, repertoireMoveFor } from '@/repertoire/repertoireService';
import { buildRepertoireViews, allCandidates } from '@/repertoire/selectors';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { clearStatsCache } from '@/stats/statsService';
import { useTrainingSession } from '@/training/useTrainingSession';
import { fakeWorkerFactory } from './fakeEngineWorker';

function Wrapper({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <AuthProvider>
      <SettingsProvider>
        <EngineProvider>
          <RepertoireProvider>{children}</RepertoireProvider>
        </EngineProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}

function useHarness() {
  return { session: useTrainingSession(), data: useRepertoires() };
}

/**
 * End-to-end exercise of the Version 1 learning loop against the local backend:
 * account -> repertoire -> training attempt -> feedback -> saved progress.
 */
describe('training loop', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    clearStatsCache();
    __setEngineForTests(new StockfishEngine(fakeWorkerFactory));

    // No aggregated statistics in this environment: the opponent must cope.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response),
    );

    const auth = new LocalAuthAdapter();
    const { user } = await auth.signUp('trainee@example.com', 'supersecret', 'Trainee');
    await createRepertoireFromStarter(new LocalRepository(), user!.id, ITALIAN_GAME, null);
  });

  it('asks for a move first, then grades it and stores the progress', async () => {
    const { result } = renderHook(useHarness, { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data.repertoires).toHaveLength(1));

    const views = buildRepertoireViews(
      result.current.data.repertoires,
      result.current.data.nodes,
      result.current.data.mastery,
    );
    const candidates = allCandidates(views);
    expect(candidates.length).toBeGreaterThan(5);

    await act(async () => {
      result.current.session.start(candidates, 3);
    });

    // The answer is not revealed before an attempt is made.
    expect(result.current.session.state.phase).toBe('waiting');
    expect(result.current.session.state.expectedSan).toBeNull();
    expect(result.current.session.state.progress.total).toBe(3);

    const expected = repertoireMoveFor(
      result.current.data.nodes,
      result.current.session.state.sanPath,
    );
    expect(expected).not.toBeNull();

    await act(async () => {
      await result.current.session.submitMove(expected!.moveSan);
    });

    await waitFor(() => expect(result.current.session.state.phase).toBe('feedback'));
    expect(result.current.session.state.feedback?.verdict).toBe('repertoire');
    expect(result.current.session.state.expectedSan).toBe(expected!.moveSan);
    expect(result.current.session.state.progress.correct).toBe(1);

    await waitFor(() => expect(result.current.data.mastery.length).toBeGreaterThan(0));
    expect(result.current.data.attempts[0].result).toBe('repertoire');
    expect(result.current.data.mastery[0].masteryScore).toBeGreaterThan(0);

    // Progress is persisted, not just held in memory.
    const stored = await new LocalRepository().listMastery(
      result.current.data.mastery[0].userId,
    );
    expect(stored).toHaveLength(1);
  });

  it('grades a move that is not the repertoire move', async () => {
    const { result } = renderHook(useHarness, { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data.repertoires).toHaveLength(1));

    const views = buildRepertoireViews(
      result.current.data.repertoires,
      result.current.data.nodes,
      result.current.data.mastery,
    );

    await act(async () => {
      result.current.session.start(allCandidates(views), 2);
    });

    const expected = repertoireMoveFor(
      result.current.data.nodes,
      result.current.session.state.sanPath,
    )!;

    // Any legal move that is not the repertoire move.
    const alternative = legalAlternative(result.current.session.state.fen, expected.moveSan);

    await act(async () => {
      await result.current.session.submitMove(alternative);
    });

    await waitFor(() => expect(result.current.session.state.phase).toBe('feedback'));
    expect(result.current.session.state.feedback?.verdict).not.toBe('repertoire');
    expect(result.current.session.state.feedback?.expectedSan).toBe(expected.moveSan);
    expect(result.current.session.state.progress.correct).toBe(0);
    expect(result.current.session.state.progress.answered).toBe(1);
  });

  it('ignores an illegal move and keeps waiting for a real one', async () => {
    const { result } = renderHook(useHarness, { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data.repertoires).toHaveLength(1));

    const views = buildRepertoireViews(
      result.current.data.repertoires,
      result.current.data.nodes,
      result.current.data.mastery,
    );

    await act(async () => {
      result.current.session.start(allCandidates(views), 2);
    });

    await act(async () => {
      await result.current.session.submitMove('Qz9');
    });

    expect(result.current.session.state.phase).toBe('waiting');
    expect(result.current.session.state.feedback?.verdict).toBe('illegal');
    expect(result.current.session.state.progress.answered).toBe(0);
    expect(result.current.data.attempts).toHaveLength(0);
  });

  it('continues the line with an opponent reply after a correct answer', async () => {
    const { result } = renderHook(useHarness, { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data.repertoires).toHaveLength(1));

    const views = buildRepertoireViews(
      result.current.data.repertoires,
      result.current.data.nodes,
      result.current.data.mastery,
    );

    await act(async () => {
      result.current.session.start(allCandidates(views), 4);
    });

    const before = result.current.session.state.sanPath.length;
    const expected = repertoireMoveFor(
      result.current.data.nodes,
      result.current.session.state.sanPath,
    )!;

    await act(async () => {
      await result.current.session.submitMove(expected.moveSan);
    });
    await waitFor(() => expect(result.current.session.state.phase).toBe('feedback'));

    await act(async () => {
      await result.current.session.advance();
    });

    await waitFor(() =>
      expect(['waiting', 'opponent', 'complete']).toContain(result.current.session.state.phase),
    );
    // The repertoire move plus an opponent answer, or a fresh position from the queue.
    expect(result.current.session.state.sanPath.length).not.toBe(before + 1);
  });
});

function legalAlternative(fen: string, exclude: string): string {
  const moves = new Chess(fen).moves();
  return moves.find((move) => move !== exclude) ?? moves[0];
}
