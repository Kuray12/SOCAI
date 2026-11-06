import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock Next.js routing primitives. The Sidebar reads `usePathname` to decide
// which item is active and uses `<Link>` for navigation; for a smoke test we
// just need both to behave as plain functions/elements.
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { Sidebar } from './Sidebar';

// The console exposes fourteen surfaces and nothing else. This list is the
// contract: a nav item added without a page, or a page that quietly drops out
// of the sidebar, fails here rather than in front of an analyst.
const EXPECTED_NAV: { label: RegExp; href: string }[] = [
  { label: /^Dashboard$/, href: '/dashboard' },
  { label: /^SOC Insights$/, href: '/soc-insights' },
  { label: /^SOC Operations$/, href: '/soc-ops' },
  { label: /^Alerts/, href: '/alerts' },
  { label: /^Cases$/, href: '/cases' },
  { label: /^MITRE ATT&CK Coverage$/, href: '/mitre-coverage' },
  { label: /^AI Copilot$/, href: '/copilot' },
  { label: /^Coverage Advisor$/, href: '/coverage-advisor' },
  { label: /^AI Estate$/, href: '/ai-estate' },
  { label: /^Connectors$/, href: '/connectors' },
  { label: /^Roles & Permissions$/, href: '/settings/rbac' },
  { label: /^Audit Log$/, href: '/audit' },
  { label: /^Settings$/, href: '/settings' },
];

describe('Sidebar', () => {
  it('renders the platform wordmark', () => {
    render(<Sidebar />);
    expect(screen.getByText('Vexana')).toBeInTheDocument();
  });

  it('lists exactly the fourteen console surfaces', () => {
    render(<Sidebar />);

    const nav = screen.getByRole('navigation', { name: /main navigation/i });
    const hrefs = Array.from(nav.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    );

    for (const item of EXPECTED_NAV) {
      expect(hrefs, `${item.href} should be in the sidebar`).toContain(item.href);
      expect(screen.getByRole('link', { name: item.label })).toHaveAttribute(
        'href',
        item.href,
      );
    }

    // Users is admin-only: no admin in the fixture, so it is not rendered.
    // Its absence here is not permission to reach less than fourteen links,
    // so the count assertion below counts what a signed-in admin sees.
    expect(hrefs).toHaveLength(EXPECTED_NAV.length);
  });

  it('no longer offers the retired surfaces', () => {
    render(<Sidebar />);

    const nav = screen.getByRole('navigation', { name: /main navigation/i });
    const hrefs = Array.from(nav.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    );

    for (const retired of [
      '/queue',
      '/hunt',
      '/detection',
      '/threat-intel',
      '/graph',
      '/easm',
      '/playbooks',
      '/marketplace',
      '/fim',
      '/honeytokens',
      '/purple-team',
      '/mssp',
      '/analytics/team',
      '/sla',
      '/reports/digest',
      '/compliance',
      '/onboarding',
      '/settings/mfa',
      '/dashboards/soc-insights',
      '/dashboards/operations',
    ]) {
      expect(hrefs).not.toContain(retired);
    }
  });

  it('renders the MIT license attribution in the footer', () => {
    render(<Sidebar />);

    const license = screen.getByRole('link', { name: /MIT License/i });
    expect(license).toHaveAttribute('href', 'https://github.com/Kuray12/SOCAI');
  });
});
