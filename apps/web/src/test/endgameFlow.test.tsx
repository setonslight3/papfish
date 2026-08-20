import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { EndgamePosition } from '@papfish/core';
import { EngineProvider } from '@/engine/EngineProvider';
import { StockfishEngine, __setEngineForTests } from '@/engine/StockfishEngine';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { useEndgameSession } from '@/training/useEndgameSession';
import { clearTablebaseCache } from '@/services/tablebase';
import { fakeWorkerFactory } from './fakeEngineWorker';

function Wrapper({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <SettingsProvider>
      <EngineProvider>{children}</EngineProvider>
    </SettingsProvider>
  );
}

/** White mates in one with Qh8. */
const MATE_IN_ONE: EndgamePosition = {
  id: 'test-mate',
  name: 'Mate in one',
  category: 'checkmate',
  fen: '5k2/8/5K2/8/8/8/8/7Q w - - 0 1',
  color: 'white',
  goal: 'win',
  idea: 'Deliver mate.',
  difficulty: 1,
};

/** Black to move, and every move loses the position immediately. */
const DEFENCE: EndgamePosition = {
  ...MATE_IN_ONE,
  id: 'test-defence',
  fen: '8/8/5k2/8/8/5K2/8/7R b - - 0 1',
  color: 'black',
  goal: 'draw',
  idea: 'Hold on.',
};

describe('endgame training', () => {
  beforeEach(() => {
    clearTablebaseCache();
    __setEngineForTests(new StockfishEngine(fakeWorkerFactory));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response),
    );
  });

  it('starts a position with the user to move', async () => {
    const { result } = renderHook(() => useEndgameSession(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.start(MATE_IN_ONE);
    });

    expect(result.current.state.phase).toBe('playing');
    expect(result.current.state.fen).toBe(MATE_IN_ONE.fen);
    expect(result.current.state.moves).toHaveLength(0);
    expect(result.current.state.verdict).toBeNull();
  });

  it('recognises the goal being achieved', async () => {
    const { result } = renderHook(() => useEndgameSession(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.start(MATE_IN_ONE);
    });

    await act(async () => {
      await result.current.playMove('Qh8#');
    });

    await waitFor(() => expect(result.current.state.phase).toBe('finished'));
    expect(result.current.state.verdict?.outcome).toBe('achieved');
    expect(result.current.state.verdict?.detail).toMatch(/Checkmate/);
  });

  it('ignores an illegal move', async () => {
    const { result } = renderHook(() => useEndgameSession(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.start(MATE_IN_ONE);
    });

    await act(async () => {
      await result.current.playMove('Qz9');
    });

    expect(result.current.state.moves).toHaveLength(0);
    expect(result.current.state.phase).toBe('playing');
  });

  it('lets the engine reply and keeps the game going', async () => {
    const { result } = renderHook(() => useEndgameSession(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.start(DEFENCE);
    });

    await act(async () => {
      await result.current.playMove('Kg6');
    });

    await waitFor(() => expect(result.current.state.moves.length).toBeGreaterThanOrEqual(2));
    expect(result.current.state.phase).toBe('playing');
    expect(result.current.state.verdict).toBeNull();
  });

  it('warns when the tablebase says a move threw the win away', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        category: 'win',
        dtm: 2,
        // Qh8 is the winning move; anything else is flagged.
        moves: [{ uci: 'h1h8', category: 'loss', dtm: -1 }],
      }),
    } as Response);

    const { result } = renderHook(() => useEndgameSession(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.start(MATE_IN_ONE);
    });

    await act(async () => {
      await result.current.playMove('Qa1');
    });

    await waitFor(() => expect(result.current.state.warning).toMatch(/gives away the win/));
  });

  it('says nothing about theory when the tablebase cannot be reached', async () => {
    const { result } = renderHook(() => useEndgameSession(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.start(MATE_IN_ONE);
    });

    await act(async () => {
      await result.current.playMove('Qa1');
    });

    expect(result.current.state.warning).toBeNull();
    expect(result.current.state.theory).toBeNull();
  });

  it('records giving up as a failure', async () => {
    const { result } = renderHook(() => useEndgameSession(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.start(MATE_IN_ONE);
    });

    act(() => {
      result.current.resign();
    });

    expect(result.current.state.phase).toBe('finished');
    expect(result.current.state.verdict?.outcome).toBe('failed');
  });
});
