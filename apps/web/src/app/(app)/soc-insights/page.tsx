import type { Metadata } from 'next';
import { SOCInsightsView } from '@/components/mitre/SOCInsightsView';

export const metadata: Metadata = {
  title: 'SOC Insights',
  description: 'Rolling-window MTTA, MTTR, false-positive rate, alert volume and analyst time saved.',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default function SOCInsightsPage() {
  return <SOCInsightsView />;
}
