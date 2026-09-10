// Admission control.
//
// One printer, a room full of phones. The printer does roughly one sticker
// every 20 seconds and that number does not move, so the only real choice is
// what happens when more people want stickers than the hardware can make.
//
// The failure everyone pictures is the printer jamming. The likelier failure is
// quieter: the queue accepts 400 submissions in the first twenty minutes,
// everybody is told "printing now", and by hour two there are 180 people
// holding phones that lied to them. So this module would rather turn somebody
// away honestly than take a job it cannot finish.

import * as store from './store/index.js';

// From the print spike. Override once the real hand-to-hand number is measured.
export const SECONDS_PER_STICKER = Number(process.env.STICKER_SECONDS ?? 20);

// Wait that still feels like part of the booth rather than a queue at a bank.
export const BUSY_AFTER_MIN = Number(process.env.STICKER_BUSY_MIN ?? 5);
// Past this we stop taking work. Better a "come back in ten minutes" than a
// promise the printer cannot keep.
export const CLOSED_AFTER_MIN = Number(process.env.STICKER_CLOSED_MIN ?? 12);

// One sticker per phone at a time, then a cooldown, so the queue is not eaten
// by six people discovering they can submit repeatedly.
export const DEVICE_COOLDOWN_MIN = Number(process.env.STICKER_COOLDOWN_MIN ?? 10);

export const MAX_DEPTH = Math.floor((CLOSED_AFTER_MIN * 60) / SECONDS_PER_STICKER);

export const etaSeconds = (position) => Math.round(position * SECONDS_PER_STICKER);

export function formatWait(seconds) {
  if (seconds < 60) return 'under a minute';
  const min = Math.round(seconds / 60);
  return min === 1 ? 'about a minute' : `about ${min} minutes`;
}

/**
 * What the booth can promise right now.
 *
 * Shown before anyone fills anything in, so nobody spends thirty seconds
 * answering questions only to be refused at the end.
 */
export async function capacity(printerHealth) {
  const depth = await store.waitingCount();
  const wait = etaSeconds(depth);
  const base = { depth, waitSeconds: wait, maxDepth: MAX_DEPTH };

  if (!printerHealth.ok) {
    return { ...base, state: 'down',
      message: 'The printer is being looked at. Nothing is lost - hold on a moment.' };
  }
  if (depth >= MAX_DEPTH) {
    return { ...base, state: 'closed',
      message: `We are at capacity - ${formatWait(wait)} of stickers already queued. Try again in a few minutes.` };
  }
  if (wait >= BUSY_AFTER_MIN * 60) {
    return { ...base, state: 'busy', message: `Busy - ${formatWait(wait)} wait.` };
  }
  return { ...base, state: 'open',
    message: depth ? `${formatWait(wait)} wait.` : 'No queue right now.' };
}

/**
 * The per-device rules, and a cheap capacity read.
 *
 * Device checks come first: somebody who already holds a ticket should be told
 * that and sent back to it, not told the booth is full. Being turned away from
 * a queue you are already in is maddening.
 *
 * The capacity answer here is advisory only. It is a read, and by the time the
 * insert happens other submissions may have filled the queue - so the real
 * limit is enforced by `store.insertIfRoom`, in one statement, and this is just
 * a fast way to refuse the obvious cases.
 */
export async function admit(deviceId, printerHealth) {
  const cap = await capacity(printerHealth);

  const live = await store.liveTicketFor(deviceId);
  if (live) return { ok: false, reason: 'already-queued', ticketId: live, capacity: cap };

  const last = await store.lastPrintedFor(deviceId);
  if (last?.printed_at) {
    // SQLite stores UTC without a zone; Postgres returns a Date.
    const printedAt = last.printed_at instanceof Date
      ? last.printed_at.getTime()
      : Date.parse(`${String(last.printed_at).replace(' ', 'T')}Z`);
    const waitedMin = (Date.now() - printedAt) / 60000;
    if (waitedMin < DEVICE_COOLDOWN_MIN) {
      return { ok: false, reason: 'cooldown', capacity: cap,
        retryInSeconds: Math.ceil((DEVICE_COOLDOWN_MIN - waitedMin) * 60) };
    }
  }

  if (cap.state === 'down') return { ok: false, reason: 'printer-down', capacity: cap };
  if (cap.state === 'closed') return { ok: false, reason: 'at-capacity', capacity: cap };

  return { ok: true, capacity: cap };
}

/** Everything a phone needs to render its own status screen. */
export async function ticketStatus(id, printerHealth) {
  const row = await store.getSticker(id);
  if (!row) return null;

  const settled = row.status === 'printed' || row.status === 'rejected';
  const position = settled ? 0 : await store.positionOf(id);

  return {
    id: row.id,
    text: row.text,
    templateId: row.template_id,
    status: row.status,
    position,
    waitSeconds: settled ? 0 : etaSeconds(position),
    printedAt: row.printed_at,
    printerOk: printerHealth.ok,
  };
}
