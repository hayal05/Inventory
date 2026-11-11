import { useSyncExternalStore } from 'react';
import { getSlow, subscribeSlow } from '../api.js';
import './WakeNotice.css';

// Banner shown when a request has been pending for 3+ seconds (a cold start on the free tiers).
// It disappears by itself once every request has finished.
export default function WakeNotice() {
  const slow = useSyncExternalStore(subscribeSlow, getSlow);
  if (!slow) return null;
  return (
    <div className="wake" role="status">
      Waking up the server&hellip; this can take up to a minute after a quiet period.
    </div>
  );
}
