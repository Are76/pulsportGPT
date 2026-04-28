import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../shell/app-shell';

describe('AppShell', () => {
  it('renders the Pulseport primary navigation', () => {
    render(
      <AppShell
        title="Dashboard"
        activeView="dashboard"
        onNavigate={() => {}}
      >
        <div>Page body</div>
      </AppShell>,
    );

    expect(screen.getByRole('navigation', { name: /primary/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /wallet analyzer/i })).toBeInTheDocument();
    expect(screen.getByAltText(/pulseport wordmark/i)).toBeInTheDocument();
    expect(screen.getByText('Page body')).toBeInTheDocument();
  });
});
