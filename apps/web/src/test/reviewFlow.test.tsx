import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { Chess } from 'chess.js';
import { ITALIAN_GAME, buildAdaptiveSession, getDrillLevel, isDue } from '@papfish/core';
import { AuthProvider } from '@/auth/AuthProvider';
import { LocalAuthAdapter } from '@/auth/localAuth';
import { EngineProvider } from '@/engine/EngineProvider';
import { StockfishEngine, __setEngineForTests } from '@/engine/StockfishEngine';
import { LocalRepository } from '@/data/localRepository';
import { RepertoireProvider, useRepertoires } from '@/repertoire/RepertoireProvider';
import { createRepertoireFromStarter, repertoireMoveFor } from '@/repertoire/repertoireService';
import { allCandidates, buildRepertoireViews } from '@/repertoire/selectors';
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

/** Version 2: scheduling, drills and imported games, end to end. */
describe('spaced repetition and drills', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    clearStatsCache();
    __setEngineForTests(new StockfishEngine(fakeWorkerFactory));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response),
    );

    const auth = new LocalAuthAdapter();
    const { user } = await auth.signUp('reviewer@example.com', 'supersecret', 'Reviewer');
    await createRepertoireFromStarter(new LocalRepository(), user!.id, ITALIAN_GAME, null);
  });

  it('schedules a reviewed position into the future and a failed one for now', async () => {
    const { result } = renderHook(useHarness, { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data.repertoires).toHaveLength(1));

    const views = buildRepertoireViews(
      result.current.data.repertoires,
      result.current.data.nodes,
      result.current.data.mastery,
    );

    await act(async () => {
      result.current.session.start(buildAdaptiveSession(allCandidates(views), { size: 2 }));
    });

    const expected = repertoireMoveFor(
      result.current.data.nodes,
      result.current.session.state.sanPath,
    )!;

    await act(async () => {
      await result.current.session.submitMove(expected.moveSan);
    });
    await waitFor(() => expect(result.current.data.mastery).toHaveLength(1));

    const correct = result.current.data.mastery[0];
    expect(correct.intervalDays).toBeGreaterThanOrEqual(1);
    expect(correct.nextReviewAt).not.toBeNull();
    expect(isDue(correct.nextReviewAt)).toBe(false);

    // Now fail a different position and check it comes straight back.
    await act(async () => {
      await result.current.session.advance();
    });
    await waitFor(() => expect(result.current.session.state.phase).toBe('waiting'));

    const nextExpected = repertoireMoveFor(
      result.current.data.nodes,
      result.current.session.state.sanPath,
    );
    const wrong = new Chess(result.current.session.state.fen)
      .moves()
      .find((move) => move !== nextExpected?.moveSan)!;

    await act(async () => {
      await result.current.session.submitMove(wrong);
    });
    await waitFor(() => expect(result.current.data.mastery.length).toBeGreaterThan(1));

    const failed = result.current.data.mastery.at(-1)!;
    expect(failed.intervalDays).toBe(0);
    expect(isDue(failed.nextReviewAt)).toBe(false); // ten minutes out, not instantly
    expect(new Date(failed.nextReviewAt!).getTime()).toBeLessThan(Date.now() + 11 * 60 * 1000);
  });

  it('records a drill timeout as a lapse without a move', async () => {
    const { result } = renderHook(useHarness, { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data.repertoires).toHaveLength(1));

    const views = buildRepertoireViews(
      result.current.data.repertoires,
      result.current.data.nodes,
      result.current.data.mastery,
    );

    await act(async () => {
      result.current.session.start(buildAdaptiveSession(allCandidates(views), { size: 3 }), {
        mode: 'drill',
        timeLimitMs: getDrillLevel('blitz').timeLimitMs,
      });
    });

    expect(result.current.session.state.mode).toBe('drill');
    expect(result.current.session.state.deadlineAt).not.toBeNull();

    await act(async () => {
      await result.current.session.timeout();
    });

    await waitFor(() => expect(result.current.session.state.phase).toBe('feedback'));
    expect(result.current.session.state.timedOut).toBe(true);
    expect(result.current.session.state.feedback?.headline).toBe('Out of time');

    await waitFor(() => expect(result.current.data.attempts).toHaveLength(1));
    expect(result.current.data.attempts[0].mode).toBe('drill');
    expect(result.current.data.attempts[0].attemptedMove).toBe('(no move)');
    expect(result.current.data.mastery[0].streak).toBe(0);
  });

  it('scores a fast drill answer and moves on without an opponent reply', async () => {
    const { result } = renderHook(useHarness, { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data.repertoires).toHaveLength(1));

    const views = buildRepertoireViews(
      result.current.data.repertoires,
      result.current.data.nodes,
      result.current.data.mastery,
    );

    await act(async () => {
      result.current.session.start(buildAdaptiveSession(allCandidates(views), { size: 3 }), {
        mode: 'drill',
        timeLimitMs: 8000,
      });
    });

    const expected = repertoireMoveFor(
      result.current.data.nodes,
      result.current.session.state.sanPath,
    )!;
    const pathBefore = result.current.session.state.sanPath.join(' ');

    await act(async () => {
      await result.current.session.submitMove(expected.moveSan);
    });
    await waitFor(() => expect(result.current.session.state.phase).toBe('feedback'));
    expect(result.current.session.state.drillScore).toBeGreaterThan(0);

    await act(async () => {
      await result.current.session.advance();
    });

    // A drill jumps to the next position instead of playing the line out.
    await waitFor(() => expect(result.current.session.state.phase).toBe('waiting'));
    expect(result.current.session.state.sanPath.join(' ')).not.toBe(`${pathBefore} ${expected.moveSan}`);
    expect(result.current.session.state.progress.index).toBe(2);
  });

  it('imports a game through the provider and surfaces its deviations', async () => {
    const { result } = renderHook(useHarness, { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data.repertoires).toHaveLength(1));

    await act(async () => {
      await result.current.data.importGames(
        '[White "Reviewer"]\n[Black "rival"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0',
        ['Reviewer'],
      );
    });

    await waitFor(() => expect(result.current.data.games).toHaveLength(1));
    expect(result.current.data.games[0].userColor).toBe('white');
    expect(result.current.data.games[0].inBookPlies).toBe(4);

    const flagged = result.current.data.gamePositions.filter(
      (position) => position.trainingRecommended,
    );
    expect(flagged).toHaveLength(1);
    expect(flagged[0].expectedMove).toBe('Bc4');
  });
});
