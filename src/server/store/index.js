// Picks a store.
//
// DATABASE_URL means the hosted app; without it, the booth machine's own
// SQLite file. Both expose the same async interface, so nothing above this
// layer knows or cares which one it is talking to.

// Two different constraints, deliberately not conflated:
//
//   STICKER_HOSTED - there is no printer here, wait for the booth agent.
//   VERCEL         - the filesystem is read-only, SQLite cannot be used.
//
// Only the second one rules out SQLite. Running hosted mode locally against a
// SQLite file is a legitimate way to exercise the agent protocol without
// deploying, and keying this off STICKER_HOSTED took that away.
const readOnlyFs = !!process.env.VERCEL;

const impl = process.env.DATABASE_URL
  ? await import('./postgres.js')
  : readOnlyFs
    ? await import('./missing.js')
    : await import('./sqlite.js');

export const available = impl.kind !== 'none';
export const unavailableReason = impl.reason ?? null;

export const {
  kind, insertIfRoom, getByRequest, getSticker, waitingCount, positionOf,
  liveTicketFor, lastPrintedFor, listPending, listInFlight, listPrinted,
  printedCount, statusCounts, allAnswers, approve, reject, claimNextPrintJob,
  markPrinted, markFailed, recoverInterrupted, setBoothHeartbeat, getBoothHeartbeat,
} = impl;

/** How the room answered, counted. Feeds the wall. */
export async function answerTally() {
  const tally = {};
  for (const raw of await allAnswers()) {
    let parsed;
    try { parsed = JSON.parse(raw); } catch { continue; }
    for (const [question, value] of Object.entries(parsed ?? {})) {
      if (!value) continue;
      tally[question] ??= {};
      tally[question][value] = (tally[question][value] ?? 0) + 1;
    }
  }
  return tally;
}
