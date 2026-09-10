// Picks a store.
//
// DATABASE_URL means the hosted app; without it, the booth machine's own
// SQLite file. Both expose the same async interface, so nothing above this
// layer knows or cares which one it is talking to.

const impl = process.env.DATABASE_URL
  ? await import('./postgres.js')
  : await import('./sqlite.js');

export const {
  kind, insertIfRoom, getByRequest, getSticker, waitingCount, positionOf,
  liveTicketFor, lastPrintedFor, listPending, listInFlight, listPrinted,
  printedCount, statusCounts, allAnswers, approve, reject, claimNextPrintJob,
  markPrinted, markFailed, recoverInterrupted,
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
