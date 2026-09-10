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

import { PRINT_SECONDS } from '../compose/constants.js';
import * as store from './db.js';

// From the print spike. PRINT_SECONDS is head movement only; the rest is cut,
// peel and handing it over. Override once the real number is measured.
export const SECONDS_PER_STICKER = Number(process.env.STICKER_SECONDS ?? 20);

// Wait that still feels like part of the booth rather than a queue at a bank.
export const BUSY_AFTER_MIN = Number(process.env.STICKER_BUSY_MIN ?? 5);
// Past this we stop taking work. Better a "come back in ten minutes" than a
// promise the printer cannot keep.
export const CLOSED_AFTER_MIN = Number(process.env.STICKER_CLOSED_MIN ?? 12);

// One sticker per phone at a time, then a cooldown, so the queue is not eaten
// by six people discovering they can submit repeatedly.
export const DEVICE_COOLDOWN_MIN = Number(process.env.STICKER_COOLDOWN_MIN ?? 10);

const MAX_DEPTH = Math.floor((CLOSED_AFTER_MIN * 60) / SECONDS_PER_STICKER);

export const etaSeconds = (position) => Math.round(position * SECONDS_PER_STICKER);

export function formatWait(seconds) {
  if (seconds < 60) return 'under a minute';
  const min = Math.round(seconds / 60);
  return min === 1 ? 'about a minute' : `about ${min} minutes`;
}

/**
 * What the booth can promise right now.
 *
 * `state` is what the phone shows before anyone fills anything in, so nobody
 * spends thirty seconds answering questions only to be refused at the end.
 */
export function capacity(printerHealth) {
  const depth = store.waitingCount();
  const wait = etaSeconds(depth);

  if (!printerHealth.ok) {
    return {
      state: 'down', depth, waitSeconds: wait, maxDepth: MAX_DEPTH,
      message: 'The printer is being looked at. Nothing is lost - hold on a moment.',
    };
  }
  if (depth >= MAX_DEPTH) {
    return {
      state: 'closed', depth, waitSeconds: wait, maxDepth: MAX_DEPTH,
      message: `We are at capacity - ${formatWait(wait)} of stickers already queued. Try again in a few minutes.`,
    };
  }
  if (wait >= BUSY_AFTER_MIN * 60) {
    return {
      state: 'busy', depth, waitSeconds: wait, maxDepth: MAX_DEPTH,
      message: `Busy - ${formatWait(wait)} wait.`,
    };
  }
  return {
    state: 'open', depth, waitSeconds: wait, maxDepth: MAX_DEPTH,
    message: depth ? `${formatWait(wait)} wait.` : 'No queue right now.',
  };
}

/**
 * May this device submit?
 *
 * Returns { ok } or { ok: false, reason, ...detail }. Checked before rendering
 * anything, so a refusal costs nothing.
 */
export function admit(deviceId, printerHealth) {
  const cap = capacity(printerHealth);

  // Device checks come first. Somebody who already holds a ticket should be
  // told that and sent back to it, not told the booth is full - being turned
  // away from a queue you are already in is maddening.
  const live = store.liveTicketFor(deviceId);
  if (live) return { ok: false, reason: 'already-queued', ticketId: live, capacity: cap };

  const last = store.lastPrintedFor(deviceId);
  if (last?.printed_at) {
    // SQLite datetime('now') is UTC; parse it as such rather than local time.
    const printedAt = Date.parse(`${last.printed_at.replace(' ', 'T')}Z`);
    const waitedMin = (Date.now() - printedAt) / 60000;
    if (waitedMin < DEVICE_COOLDOWN_MIN) {
      return {
        ok: false, reason: 'cooldown', capacity: cap,
        retryInSeconds: Math.ceil((DEVICE_COOLDOWN_MIN - waitedMin) * 60),
      };
    }
  }

  if (cap.state === 'down') return { ok: false, reason: 'printer-down', capacity: cap };
  if (cap.state === 'closed') return { ok: false, reason: 'at-capacity', capacity: cap };

  return { ok: true, capacity: cap };
}

/**
 * Admit and insert as one indivisible step.
 *
 * The check and the insert have to happen in the same tick. Awaiting anything
 * between them - rendering the PNG, say - lets every request in a burst read
 * the same queue depth and all decide there is room. Sixty phones tapping at
 * once was accepted against a cap of twenty-one, which is precisely the pile-up
 * the cap exists to prevent.
 *
 * node:sqlite is synchronous and JavaScript is single-threaded, so as long as
 * nothing awaits in here, no two requests can interleave.
 */
export function admitAndInsert(deviceId, printerHealth, insert) {
  const gate = admit(deviceId, printerHealth);
  if (!gate.ok) return gate;
  return { ok: true, capacity: gate.capacity, id: insert() };
}

/** Everything a phone needs to render its own status screen. */
export function ticketStatus(id, printerHealth) {
  const row = store.getTicket(id);
  if (!row) return null;

  const done = row.status === 'printed';
  const dead = row.status === 'rejected';
  const position = done || dead ? 0 : store.positionOf(id);

  return {
    id,
    text: row.text,
    templateId: row.template_id,
    status: row.status,
    position,
    waitSeconds: done || dead ? 0 : etaSeconds(position),
    printedAt: row.printed_at,
    printerOk: printerHealth.ok,
  };
}
