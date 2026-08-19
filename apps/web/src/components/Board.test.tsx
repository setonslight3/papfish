import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { START_FEN } from '@papfish/core';
import { Board } from './Board';

function square(container: HTMLElement, name: string): HTMLElement {
  const element = container.querySelector(`[data-square="${name}"]`);
  if (!element) throw new Error(`Square ${name} not rendered`);
  return element as HTMLElement;
}

describe('Board', () => {
  it('renders all 64 squares and the starting pieces', () => {
    const { container } = render(<Board fen={START_FEN} orientation="white" />);
    expect(container.querySelectorAll('[data-square]')).toHaveLength(64);
    expect(container.querySelectorAll('[data-piece]')).toHaveLength(32);
  });

  it('loads an arbitrary position', () => {
    const { container } = render(
      <Board fen="4k3/8/8/8/8/8/4P3/4K3 w - - 0 1" orientation="white" />,
    );
    expect(container.querySelectorAll('[data-piece]')).toHaveLength(3);
  });

  it('plays a legal move by tapping the source and target squares', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    const { container } = render(<Board fen={START_FEN} orientation="white" onMove={onMove} />);

    await user.click(square(container, 'e2'));
    await user.click(square(container, 'e4'));

    expect(onMove).toHaveBeenCalledWith('e4');
  });

  it('does not report an illegal move', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    const { container } = render(<Board fen={START_FEN} orientation="white" onMove={onMove} />);

    await user.click(square(container, 'e2'));
    await user.click(square(container, 'e5'));

    expect(onMove).not.toHaveBeenCalled();
  });

  it('ignores input when the board is not interactive', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    const { container } = render(
      <Board fen={START_FEN} orientation="white" onMove={onMove} interactive={false} />,
    );

    await user.click(square(container, 'e2'));
    await user.click(square(container, 'e4'));

    expect(onMove).not.toHaveBeenCalled();
  });

  it('asks which piece to promote to before completing a promotion', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    const { container } = render(
      <Board fen="8/P6k/8/8/8/8/7K/8 w - - 0 1" orientation="white" onMove={onMove} />,
    );

    await user.click(square(container, 'a7'));
    await user.click(square(container, 'a8'));

    expect(onMove).not.toHaveBeenCalled();
    expect(screen.getByText('Promote to')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '♘' }));
    expect(onMove).toHaveBeenCalledWith('a8=N');
  });
});
