import { permanentRedirect } from 'next/navigation';

/**
 * The investigation queue is gone from the console; its content is the alert
 * list filtered to what still needs a decision. Old links (bookmarks, chat
 * messages, runbooks) land on that filter rather than a 404.
 */
export default function QueueRedirect() {
  permanentRedirect('/alerts?status=open');
}
