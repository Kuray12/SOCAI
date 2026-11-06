import { permanentRedirect } from 'next/navigation';

/**
 * The standalone investigation workspace is gone from the console; the work
 * it framed now happens inside a case. Old links land on the case list.
 */
export default function InvestigateRedirect() {
  permanentRedirect('/cases');
}
