/**
 * The console's 404 must only point at pages this build actually ships.
 *
 * It previously rendered the marketing navigation and footer, whose links
 * (/pricing, /benchmark, /blog, docs) are not routes in this deployment, and
 * whose copy offered a demo reset schedule nothing runs. This suite pins the
 * destinations it does have and the ones it must not advertise.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import NotFoundPage from './not-found';

describe('console 404', () => {
  it('points at the console surfaces', () => {
    render(<NotFoundPage />);

    expect(screen.getByRole('link', { name: /open the dashboard/i })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    for (const label of [/^go to alerts$/i, /open investigations/i, /^settings/i]) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('does not advertise routes this build does not ship', () => {
    render(<NotFoundPage />);

    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    for (const retired of ['/pricing', '/benchmark', '/blog', '/contact', '/marketplace']) {
      expect(hrefs).not.toContain(retired);
    }
  });

  it('promises no demo data', () => {
    render(<NotFoundPage />);
    for (const promise of [/pre-seeded/i, /resets daily/i, /no signup/i, /00:00 UTC/i]) {
      expect(screen.queryByText(promise)).toBeNull();
    }
  });
});
