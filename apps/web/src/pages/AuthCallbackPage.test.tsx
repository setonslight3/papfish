import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const exchangeCodeForSession = vi.fn();
const resend = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ auth: { getSession, exchangeCodeForSession, resend } }),
  requireSupabase: () => ({ auth: { getSession, exchangeCodeForSession, resend } }),
}));

const resendConfirmation = vi.fn();
vi.mock('@/auth/AuthProvider', async () => {
  const actual = await vi.importActual<typeof import('@/auth/AuthProvider')>('@/auth/AuthProvider');
  return {
    ...actual,
    getAuthAdapter: () => ({ kind: 'supabase', resendConfirmation }),
    // AuthLayout reads the backend badge; the page under test needs no provider.
    useAuth: () => ({ backend: 'supabase', user: null, loading: false }),
  };
});

const { AuthCallbackPage } = await import('./AuthCallbackPage');

function CurrentPath(): React.JSX.Element {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

function renderCallback(url: string) {
  window.history.replaceState({}, '', url);
  return render(
    <MemoryRouter initialEntries={['/auth/callback']}>
      <CurrentPath />
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/dashboard" element={<p>Dashboard</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    getSession.mockReset();
    exchangeCodeForSession.mockReset();
    resendConfirmation.mockReset();
    getSession.mockResolvedValue({ data: { session: null } });
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('exchanges a code and lands on the dashboard', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });

    renderCallback('/auth/callback?code=abc123');

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/dashboard'));
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc123');
  });

  it('accepts a link that carries its tokens in the fragment', async () => {
    getSession
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });

    renderCallback('/auth/callback#access_token=xyz&type=signup');

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/dashboard'));
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('shows the loading screen while it works', () => {
    renderCallback('/auth/callback?code=abc123');
    expect(screen.getByText('Confirming your account…')).toBeInTheDocument();
  });

  it('explains an expired link and offers a new one', async () => {
    const user = userEvent.setup();
    renderCallback(
      '/auth/callback?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    );

    expect(await screen.findByText(/That link has expired/)).toBeInTheDocument();
    expect(screen.getByText(/Email link is invalid or has expired/)).toBeInTheDocument();

    resendConfirmation.mockResolvedValue(undefined);
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /send a new link/i }));

    await waitFor(() => expect(resendConfirmation).toHaveBeenCalledWith('ada@example.com'));
    expect(await screen.findByText(/Check your inbox/)).toBeInTheDocument();
  });

  it('reports an exchange that the server rejected', async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: { message: 'Email link is invalid or has expired' },
    });

    renderCallback('/auth/callback?code=stale');

    expect(await screen.findByText(/That link has expired/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send a new link/i })).toBeInTheDocument();
  });
});
