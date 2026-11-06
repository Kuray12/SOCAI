import type { Metadata } from 'next';
import { CoverageView } from '@/components/detections/CoverageView';

export const metadata: Metadata = {
  title: 'MITRE ATT&CK Coverage',
  description:
    "MITRE ATT&CK coverage matrix derived from the detections this deployment ships, broken down by tier (native, imported, community).",
};

export default function MitreCoveragePage() {
  return <CoverageView />;
}
