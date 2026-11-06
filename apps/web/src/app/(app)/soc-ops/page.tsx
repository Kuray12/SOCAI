import type { Metadata } from 'next';
import { OperationsDashboard } from '@/components/dashboard/operations/OperationsDashboard';

export const metadata: Metadata = {
  title: 'SOC Operations',
  description:
    'Connector staleness, rejected events, alert posture, detection coverage, agent spend and pending response actions — whether the pipeline is working, independent of what it is finding.',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default function SOCOperationsPage() {
  return <OperationsDashboard />;
}
