/**
 * The root of a self-hosted install must land an operator on their console.
 *
 * `/` used to render the project's marketing landing page on deployments that
 * opted in with `AISOC_MARKETING_HOME`. That switch is gone: every install is
 * an operations console, and its front door is `/login`, which routes onward
 * by itself (first run → onboarding, an authenticated session → `/dashboard`).
 *
 * `HomePage()` is called as a plain function: the redirect throws before any
 * JSX is reached, keeping this test independent of every section component.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const redirectMock = vi.hoisted(() =>
  vi.fn((target: string): never => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  }),
);

vi.mock('next/navigation', () => ({
  __esModule: true,
  redirect: redirectMock,
}));

import HomePage, { dynamic as routeDynamic } from './page';

afterEach(() => {
  redirectMock.mockClear();
});

describe('the root route', () => {
  it('redirects to /login', () => {
    expect(() => HomePage()).toThrowError('NEXT_REDIRECT:/login');
    expect(redirectMock).toHaveBeenCalledWith('/login');
  });

  it('is force-dynamic, so the answer comes from the container on every request', () => {
    expect(routeDynamic).toBe('force-dynamic');
  });
});
