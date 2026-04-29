import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../shell/app-shell';
import { useShellState } from '../shell/shell-state';

function Harness() {
  const shell = useShellState();

  return (
    <AppShell title="Dashboard" activeView={shell.activeView} onNavigate={shell.setActiveView}>
      <div>{shell.activeView}</div>
    </AppShell>
  );
}

describe('shell navigation', () => {
  it('switches to My Investments when selected from nav', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: /my investments/i }));

    expect(screen.getByText('investments')).toBeInTheDocument();
  });

  it('switches to Wallet Analyzer when selected from nav', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: /wallet analyzer/i }));

    expect(screen.getByText('wallet-analyzer')).toBeInTheDocument();
  });
});
