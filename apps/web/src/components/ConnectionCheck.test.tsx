import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = { supabaseConfigured: true, supabaseUrl: 'https://demo.supabase.co', supabaseAnonKey: 'anon-key' };
vi.mock('@/lib/env', () => ({ env, backend: 'supabase' }));

const { ConnectionCheck } = await import('./ConnectionCheck');

describe('ConnectionCheck', () => {
  beforeEach(() => {
    env.supabaseConfigured = true;
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it('stays hidden when there is no project to check', () => {
    env.supabaseConfigured = false;
    const { container } = render(<ConnectionCheck />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reports a reachable project', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);
    const user = userEvent.setup();
    render(<ConnectionCheck />);

    await user.click(screen.getByRole('button', { name: /test connection/i }));

    expect(await screen.findByText(/Reachable \(HTTP 200\)/)).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://demo.supabase.co/auth/v1/health');
    expect(screen.getByText('demo.supabase.co')).toBeInTheDocument();
  });

  it('separates a rejected request from an unreachable one', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Invalid API key',
    } as Response);
    const user = userEvent.setup();
    render(<ConnectionCheck />);

    await user.click(screen.getByRole('button', { name: /test connection/i }));

    expect(await screen.findByText(/HTTP 401/)).toBeInTheDocument();
    expect(screen.getByText(/Invalid API key/)).toBeInTheDocument();
  });

  it('reports no reply at all', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    render(<ConnectionCheck />);

    await user.click(screen.getByRole('button', { name: /test connection/i }));

    expect(await screen.findByText(/No reply at all \(Failed to fetch\)/)).toBeInTheDocument();
  });
});
