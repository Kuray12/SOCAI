import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Telescope } from 'lucide-react';

/**
 * Console 404.
 *
 * It used to render the marketing site's navigation and footer around a
 * "page not found" message, with destinations that included pricing and a
 * contact form — none of which exist on an operations console, and the
 * navigation links to routes this build does not ship. A stale bookmark now
 * lands on the surfaces that do exist.
 */

export const metadata: Metadata = {
  title: '404 — page not found',
  robots: { index: false, follow: false },
};

const DESTINATIONS: ReadonlyArray<{ label: string; href: string; blurb: string }> = [
  { label: 'Dashboard', href: '/dashboard', blurb: 'SOC overview and metrics.' },
  { label: 'Alerts', href: '/alerts', blurb: 'Security alerts and incidents.' },
  { label: 'Cases', href: '/cases', blurb: 'Open investigations and their records.' },
  { label: 'Settings', href: '/settings', blurb: 'Workspace, integrations and AI deployment.' },
];

export default function NotFoundPage() {
  return (
    <main
      data-theme="dark"
      className="relative min-h-screen overflow-x-hidden bg-surface-base text-fg-primary"
    >
      <section className="px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-300">
            <Telescope className="h-3.5 w-3.5" aria-hidden="true" />
            404 · page not found
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl">
            There is no page at that address.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-gray-400">
            A link may be out of date or the URL mistyped. Everything this
            console ships is one click away below.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-brand-500 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              Open the dashboard
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <Link
              href="/alerts"
              className="inline-flex h-11 items-center gap-2 rounded-md border border-white/15 bg-white/[0.02] px-5 text-sm font-semibold text-white transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              Go to alerts
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Where you can go
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {DESTINATIONS.map((dest) => (
              <li key={dest.href}>
                <Link
                  href={dest.href}
                  className="group flex h-full flex-col gap-1.5 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-brand-500/40 hover:bg-white/[0.04]"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-white">
                    {dest.label}
                    <ArrowRight
                      className="h-3.5 w-3.5 text-brand-300 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="text-sm text-gray-400">{dest.blurb}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
