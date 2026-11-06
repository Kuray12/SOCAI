import { permanentRedirect } from 'next/navigation';

/**
 * `next.config.js` still rewrites every `/api/v1/*` path to the API service,
 * which serves these routes. This page only covers the case where the console
 * itself is asked for a path that used to be a dashboard.
 */
export default function BenchmarkRedirect() {
  permanentRedirect('/soc-insights');
}
