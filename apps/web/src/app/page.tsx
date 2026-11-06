import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Search } from 'lucide-react';

/**
 * Root route.
 *
 * On a self-hosted Vexana install `/` sends an operator to `/login`, which
 * routes onward by itself (first run → onboarding, an authenticated session →
 * `/dashboard`). Marketing pages are not part of this deployment: the root
 * used to double as the project landing page when `AISOC_MARKETING_HOME` was
 * set, and the console's own 404 rendered that marketing chrome around a
 * "page not found" — neither belongs in an operations console.
 *
 * `force-dynamic` is kept deliberately: the redirect must be decided on every
 * request from the running container, never baked into the image at build
 * time.
 */

export const metadata: Metadata = {
  title: { absolute: 'Vexana — AI Security Operations Center' },
  description:
    'Vexana is an AI-powered Security Operations Center: alerts, cases, MITRE ATT&CK coverage, an AI copilot, coverage advisory and connector management in one console.',
  alternates: { canonical: '/' },
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const ENTRIES = [
  { href: '/dashboard', label: 'Dashboard', blurb: 'Alert volume, severity mix and the state of the pipeline.' },
  { href: '/alerts', label: 'Alerts', blurb: 'Every alert the pipeline raised, and what triage decided.' },
  { href: '/cases', label: 'Cases', blurb: 'Investigations grouped into a working record.' },
  { href: '/copilot', label: 'AI Copilot', blurb: 'Ask questions across alerts, cases and detections.' },
];

export default function HomePage() {
  // A signed-in operator never needs this page; the shell handles auth for
  // the console routes. Redirecting keeps `/` from being a dead end.
  redirect('/login');
  return <HomeFallback />;
}

/**
 * The console's front door, rendered when `redirect` returns instead of
 * throwing (it does not, in Next; kept so the route has a renderable body).
 */
function HomeFallback() {
  return (
    <main data-theme="dark" className="min-h-screen bg-surface-base text-fg-primary">
      <section className="mx-auto max-w-3xl px-6 py-24">
        <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-300">
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          Vexana
        </span>
        <h1 className="mt-6 text-4xl font-bold tracking-tight text-white">Security operations console</h1>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {ENTRIES.map((entry) => (
            <li key={entry.href}>
              <Link
                href={entry.href}
                className="group flex h-full flex-col gap-1.5 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-brand-500/40 hover:bg-white/[0.04]"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-white">
                  {entry.label}
                  <ArrowRight className="h-3.5 w-3.5 text-brand-300 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
                <span className="text-sm text-gray-400">{entry.blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
