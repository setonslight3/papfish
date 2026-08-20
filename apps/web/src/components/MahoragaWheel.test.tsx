import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { MahoragaWheel, type WheelNavItem } from './MahoragaWheel';

const ITEMS: WheelNavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: '◫' },
  { to: '/explore', label: 'Explore', icon: '◈' },
  { to: '/train', label: 'Train', icon: '◎' },
];

function CurrentPath(): React.JSX.Element {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

function renderWheel(direction: 'vertical' | 'horizontal' = 'vertical') {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <CurrentPath />
      <Routes>
        <Route path="*" element={<MahoragaWheel items={ITEMS} direction={direction} />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The menu buttons exist while closed but must not be reachable. */
function menuItem(label: string): HTMLElement {
  return screen.getByRole('menuitem', { name: label, hidden: true });
}

describe('MahoragaWheel', () => {
  it('starts closed, with one control instead of a row of tabs', () => {
    renderWheel();
    const wheel = screen.getByRole('button', { name: 'Open navigation' });
    expect(wheel).toHaveAttribute('aria-expanded', 'false');
    expect(menuItem('Dashboard')).toHaveAttribute('tabindex', '-1');
  });

  it('opens the bar and makes the destinations reachable', async () => {
    const user = userEvent.setup();
    renderWheel();

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));

    expect(screen.getByRole('button', { name: 'Close navigation', expanded: true })).toBeInTheDocument();
    for (const item of ITEMS) {
      expect(screen.getByRole('menuitem', { name: item.label })).toHaveAttribute('tabindex', '0');
    }
  });

  it('extends upward by default and sideways when asked', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWheel('vertical');
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));

    const verticalItem = menuItem('Explore').closest('li')!;
    expect(verticalItem.style.transform).toMatch(/translate3d\(0, -\d+px, 0\)/);
    unmount();

    renderWheel('horizontal');
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    const horizontalItem = menuItem('Explore').closest('li')!;
    expect(horizontalItem.style.transform).toMatch(/translate3d\(-\d+px, 0, 0\)/);
  });

  it('stacks each destination further from the hub', async () => {
    const user = userEvent.setup();
    renderWheel();
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));

    const offsets = ITEMS.map((item) => {
      const transform = menuItem(item.label).closest('li')!.style.transform;
      return Number(/-(\d+)px/.exec(transform)?.[1] ?? 0);
    });
    expect(offsets[0]).toBeGreaterThan(0);
    expect(offsets[1]).toBeGreaterThan(offsets[0]);
    expect(offsets[2]).toBeGreaterThan(offsets[1]);
  });

  it('turns the wheel each time it is used', async () => {
    const user = userEvent.setup();
    renderWheel();
    const wheel = screen.getByRole('button', { name: 'Open navigation' });
    const mark = wheel.querySelector('svg')!;

    expect(mark.style.transform).toBe('rotate(0deg)');
    await user.click(wheel);
    expect(mark.style.transform).toBe('rotate(360deg)');

    // Choosing spins it further rather than snapping back.
    await user.click(screen.getByRole('menuitem', { name: 'Explore' }));
    expect(mark.style.transform).toBe('rotate(1080deg)');
  });

  it('draws the chosen destination into the hub, then navigates', async () => {
    const user = userEvent.setup();
    renderWheel();
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));

    const explore = screen.getByRole('menuitem', { name: 'Explore' });
    await user.click(explore);

    // It travels back to the wheel's centre while the others fade.
    const row = explore.closest('li')!;
    expect(row.style.transform).toBe('translate3d(0, 0px, 0)');
    expect(row.style.opacity).toBe('1');
    expect(menuItem('Train').closest('li')!.style.opacity).toBe('0');

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/explore'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument(),
    );
  });

  it('closes on the wheel, on Escape, and on a tap outside', async () => {
    const user = userEvent.setup();
    const { container } = renderWheel();
    const openWheel = () => user.click(screen.getByRole('button', { name: 'Open navigation' }));

    await openWheel();
    await user.click(screen.getByRole('button', { name: 'Close navigation' }));
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument();

    await openWheel();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument();

    await openWheel();
    // The backdrop is presentational, so it is found by role-free query.
    const backdrop = container.querySelector('[aria-hidden="true"].absolute.inset-0')!;
    await user.click(backdrop);
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument();
  });

  it('exposes exactly one navigation control while open', async () => {
    const user = userEvent.setup();
    renderWheel();
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));

    // Menu items plus the wheel - no duplicate backdrop button.
    expect(screen.getAllByRole('button', { name: /navigation/i })).toHaveLength(1);
  });

  it('marks the page you are on', async () => {
    const user = userEvent.setup();
    renderWheel();
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));

    expect(screen.getByRole('menuitem', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('menuitem', { name: 'Explore' })).not.toHaveAttribute('aria-current');
  });
});
