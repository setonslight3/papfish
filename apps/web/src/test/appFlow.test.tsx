import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { StockfishEngine, __setEngineForTests } from '@/engine/StockfishEngine';
import { clearStatsCache } from '@/stats/statsService';
import { fakeWorkerFactory } from './fakeEngineWorker';

function renderApp(path = '/register') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

/** Registration → dashboard → repertoire creation → sign out, through the UI. */
describe('application flow', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearStatsCache();
    __setEngineForTests(new StockfishEngine(fakeWorkerFactory));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response),
    );
  });

  it('registers an account and lands on the dashboard', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(await screen.findByLabelText('Display name'), 'Ada');
    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(await screen.findByLabelText('Password'), 'supersecret');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/Hello, Ada/)).toBeInTheDocument();
    expect(screen.getByText(/Overall mastery/i)).toBeInTheDocument();
  });

  it('rejects a short password before contacting the backend', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(await screen.findByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(
      await screen.findByText('Password must be at least 8 characters'),
    ).toBeInTheDocument();
  });

  it('creates a starter repertoire and shows its branches', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(await screen.findByLabelText('Display name'), 'Ada');
    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(await screen.findByLabelText('Password'), 'supersecret');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    await screen.findByText(/Hello, Ada/);

    await user.click(screen.getAllByRole('link', { name: /repertoires/i })[0]);
    expect(await screen.findByText(/Add a repertoire/i)).toBeInTheDocument();

    const createButtons = await screen.findAllByRole('button', { name: /create repertoire/i });
    await user.click(createButtons[0]);

    await waitFor(() => expect(screen.getAllByText(/Italian Game/).length).toBeGreaterThan(1));
    expect(await screen.findByText(/Your decisions/i)).toBeInTheDocument();
  });

  it('signs out and returns to the sign-in screen', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(await screen.findByLabelText('Password'), 'supersecret');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    await screen.findByText(/Hello/);

    await user.click(screen.getAllByRole('button', { name: /sign out/i })[0]);
    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
  });

  it('keeps the session after a reload', async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp();

    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(await screen.findByLabelText('Password'), 'supersecret');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    await screen.findByText(/Hello/);
    unmount();

    renderApp('/dashboard');
    expect(await screen.findByText(/Hello/)).toBeInTheDocument();
  });
});
