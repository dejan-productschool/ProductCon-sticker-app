// The booth server. One process, one machine, one day.
//
// Serves the three screens (kiosk, approve tablet, wall), composes stickers,
// holds the queue, and drives the printer. Everything is local.

import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { networkInterfaces } from 'node:os';
import { composeSvg, offerTemplates } from '../compose/svg.js';
import { sanitise, MAX_CHARS } from '../compose/sanitise.js';
import { QUESTIONS, FREE_TEXT_ALLOWED, linesFor, isComplete } from '../compose/survey.js';
import { getTemplate, TEMPLATES } from '../compose/templates.js';
import { CANVAS, PRINT_SECONDS } from '../compose/constants.js';
import { USING_PLACEHOLDER_LOCKUP } from '../compose/brand.js';
import { printSticker, printMode, listPrinters, printerName } from '../print/printer.js';
import * as store from './store/index.js';
import { admit, capacity, ticketStatus, SECONDS_PER_STICKER, DEVICE_COOLDOWN_MIN, MAX_DEPTH, formatWait } from './queue.js';
import { qrSvg, qrInfo } from '../compose/qr.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.PORT ?? 4173);
// Hides the pointer on the booth touchscreen. Off while building on a laptop.
const KIOSK = process.env.STICKER_KIOSK === '1';

/**
 * What still needs a volunteer tap.
 *
 * 'guided' - lines from the bank print straight through, free text waits.
 * 'none'   - everything waits for a tap.
 * 'all'    - nothing waits. Only sane if free text is off.
 *
 * The tap was a safeguard against a text field. With the guided flow there is
 * nothing to moderate - every line was written in advance - and at one sticker
 * every 20 seconds a human gate becomes the thing that jams the booth. Free
 * text is the only path that can still produce a surprise, so that is the only
 * path that still stops.
 */
const AUTO_APPROVE = process.env.STICKER_AUTO_APPROVE ?? 'guided';

/**
 * Is this the hosted copy?
 *
 * The hosted app holds the queue and talks to phones. It has no printer and
 * must never try to print - the booth agent claims jobs from it over the
 * agent API and does the printing on the machine the VC-500W is plugged into.
 */
const HOSTED = !!process.env.VERCEL || process.env.STICKER_HOSTED === '1';

// Shared secret between the hosted app and the booth agent. Without it, set,
// the agent endpoints are closed - an open print queue on the public internet
// is a bad afternoon.
const AGENT_TOKEN = process.env.STICKER_AGENT_TOKEN ?? '';

// The agent says hello every few seconds. If it stops, the booth is gone -
// unplugged, asleep, or off the network - and the queue must say so rather
// than taking submissions nobody can print.
const AGENT_TIMEOUT_MS = Number(process.env.STICKER_AGENT_TIMEOUT_MS ?? 45_000);
let agentSeenAt = 0;
let agentReport = { ok: true, detail: 'no booth agent has checked in yet' };

// Where phones are told to go. On a booth LAN this is the machine's own
// address; behind a tunnel or a deployment, set it explicitly.
const LAN_IP = () => Object.values(networkInterfaces()).flat()
  .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
const JOIN_URL = () => process.env.STICKER_JOIN_URL ?? `http://${LAN_IP() ?? 'localhost'}:${PORT}`;

export const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(express.static(join(ROOT, 'public')));

// ---------------------------------------------------------------- live events

const clients = new Set();

function broadcast(event, data) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(frame);
}

app.get('/api/events', (req, res) => {
  // Serverless functions do not hold a stream open for an afternoon. The
  // screens all poll as well, so closing here just makes them fall back.
  if (HOSTED) return res.status(204).end();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');
  clients.add(res);
  // A dropped screen must reconnect on its own; nobody is watching the server.
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 15_000);
  req.on('close', () => { clearInterval(keepAlive); clients.delete(res); res.end(); });
});

// ----------------------------------------------------------------- kiosk flow

app.get('/api/config', (req, res) => {
  res.json({
    kiosk: KIOSK,
    joinUrl: JOIN_URL(),
    secondsPerSticker: SECONDS_PER_STICKER,
    cooldownMinutes: DEVICE_COOLDOWN_MIN,
    maxChars: MAX_CHARS,
    canvas: CANVAS,
    questions: QUESTIONS,
    freeText: FREE_TEXT_ALLOWED,
    templates: TEMPLATES.map((t) => ({ id: t.id, name: t.name, description: t.description })),
  });
});

/**
 * Answers in, hand-written lines out. Nothing is generated here.
 *
 * Empty until every question is answered: the message is a function of all of
 * them, and handing back a line early would make the last question decorative.
 */
app.post('/api/lines', (req, res) => {
  const answers = req.body?.answers ?? {};
  res.json({ complete: isComplete(answers), lines: linesFor(answers) });
});

/**
 * Which templates can set this line legibly, and what they are called.
 * The images themselves come from /api/render, so the kiosk can let the
 * browser cache them instead of pushing base64 through JSON on every keystroke.
 */
app.get('/api/options', (req, res) => {
  const clean = sanitise(req.query.text);
  if (clean.text.length === 0) return res.status(400).json({ error: 'empty' });
  res.json({
    text: clean.text,
    reasons: clean.reasons,
    dropped: clean.dropped,
    templates: offerTemplates(clean.text).map((id) => ({ id, name: getTemplate(id).name })),
  });
});

/**
 * A composed sticker as SVG, for previews. Not stored, not queued.
 *
 * SVG rather than PNG because every glyph is already an embedded path: the
 * browser draws it with no fonts installed, and the hosted app never needs a
 * native rasteriser. sharp stays on the booth machine, where the only PNG that
 * matters is the one going to the printer.
 */
app.get('/api/render', (req, res) => {
  const clean = sanitise(req.query.text);
  const templateId = String(req.query.template ?? '');
  if (clean.text.length === 0 || !getTemplate(templateId)) return res.sendStatus(400);

  const { svg } = composeSvg(clean.text, templateId);
  res.type('svg').set('Cache-Control', 'public, max-age=600').send(svg);
});

/** What the booth can promise right now. The phone checks this before starting. */
app.get('/api/capacity', async (req, res) => {
  const cap = await capacity(printerHealthNow());
  const deviceId = String(req.query.deviceId ?? '');
  res.json({
    ...cap,
    wait: formatWait(cap.waitSeconds),
    yourTicket: deviceId ? (await store.liveTicketFor(deviceId)) ?? null : null,
  });
});

/** A phone watching its own sticker. Polled, not streamed - phones sleep. */
app.get('/api/ticket/:id', async (req, res) => {
  const status = await ticketStatus(Number(req.params.id), printerHealthNow());
  if (!status) return res.sendStatus(404);
  res.json({ ...status, wait: formatWait(status.waitSeconds) });
});

/**
 * Ship It.
 *
 * Refuses before it renders. A phone that cannot be served should find out in
 * a few milliseconds, not after the booth has spent time composing a PNG it
 * will never print.
 */
app.post('/api/submit', async (req, res) => {
  const deviceId = String(req.body?.deviceId ?? '').slice(0, 64);
  const requestId = String(req.body?.requestId ?? '').slice(0, 64);
  if (!deviceId || !requestId) return res.status(400).json({ error: 'missing-device' });

  // Same request twice - a retry on a flaky phone connection, or a double tap.
  // Hand back the ticket that already exists rather than printing twice.
  const existing = await store.getByRequest(requestId);
  if (existing) {
    return res.json({ ticketId: existing.id, duplicate: true, ...(await ticketStatus(existing.id, printerHealthNow())) });
  }

  const refuse = (gate) => res.status(gate.reason === 'already-queued' ? 409 : 503).json({
    error: gate.reason,
    ticketId: gate.ticketId ?? null,
    retryInSeconds: gate.retryInSeconds ?? null,
    capacity: { ...gate.capacity, wait: formatWait(gate.capacity.waitSeconds) },
  });

  // Cheap refusal first, so a phone that cannot be served finds out in a few
  // milliseconds rather than after the booth composes a PNG it will not print.
  const early = await admit(deviceId, printerHealthNow());
  if (!early.ok) return refuse(early);

  const clean = sanitise(req.body?.text);
  const templateId = String(req.body?.templateId ?? '');
  if (clean.text.length === 0) return res.status(400).json({ error: 'empty' });
  if (!getTemplate(templateId)) return res.status(400).json({ error: 'unknown-template' });

  const answers = req.body?.answers ?? {};
  const guided = isComplete(answers) && linesFor(answers).includes(clean.text);

  // Only a line nobody typed can skip the volunteer, so decide the starting
  // status before inserting rather than approving in a second round trip.
  const autoApprove = AUTO_APPROVE === 'all' || (AUTO_APPROVE === 'guided' && guided && clean.ok);

  // The real limit. One statement, so the count and the insert cannot be
  // separated - several serverless invocations running at once would otherwise
  // all read the same depth and all decide there was room.
  const id = await store.insertIfRoom({
    text: clean.text, templateId, flagged: !clean.ok, reasons: clean.reasons,
    answers, deviceId, requestId, status: autoApprove ? 'approved' : 'pending',
  }, MAX_DEPTH);

  if (id === null) {
    // Either the queue filled between the early check and here, or this exact
    // request already exists.
    const dup = await store.getByRequest(requestId);
    if (dup) return res.json({ ticketId: dup.id, duplicate: true, ...(await ticketStatus(dup.id, printerHealthNow())) });
    return refuse({ reason: 'at-capacity', capacity: await capacity(printerHealthNow()) });
  }

  if (autoApprove) pump();

  broadcast('queued', { id, text: clean.text, templateId, flagged: !clean.ok, auto: autoApprove });
  res.json({ ticketId: id, duplicate: false, guided, autoApproved: autoApprove,
             ...(await ticketStatus(id, printerHealthNow())) });
});

/**
 * A queued sticker, rendered on demand.
 *
 * Nothing stores pixels any more: text plus template id reproduces the sticker
 * exactly, so the database stays small and the booth agent can render its own
 * PNG locally rather than pulling one down.
 */
app.get('/api/sticker/:id.svg', async (req, res) => {
  const row = await store.getSticker(Number(req.params.id));
  if (!row) return res.sendStatus(404);
  const { svg } = composeSvg(row.text, row.template_id);
  res.type('svg').set('Cache-Control', 'public, max-age=31536000, immutable').send(svg);
});

// ------------------------------------------------------------- approve tablet

app.get('/api/queue', async (req, res) => {
  const cap = await capacity(printerHealthNow());
  res.json({
    pending: await store.listPending(),
    inFlight: await store.listInFlight(),
    counts: await store.statusCounts(),
    printer: printerHealthNow(),
    capacity: { ...cap, wait: formatWait(cap.waitSeconds) },
    autoApprove: AUTO_APPROVE,
  });
});

app.post('/api/queue/:id/approve', async (req, res) => {
  const id = Number(req.params.id);
  if (!(await store.approve(id))) return res.sendStatus(404);
  broadcast('approved', { id });
  pump();
  res.json({ ok: true });
});

app.post('/api/queue/:id/reject', async (req, res) => {
  const id = Number(req.params.id);
  if (!(await store.reject(id))) return res.sendStatus(404);
  // Rejects are logged, not dropped. If the filter is rejecting things it
  // should not, that only shows up if the rows are still there afterwards.
  broadcast('rejected', { id });
  res.json({ ok: true });
});

// -------------------------------------------------------------------- the wall

app.get('/api/wall', async (req, res) => {
  res.json({
    printed: await store.listPrinted(200),
    count: await store.printedCount(),
    tally: await store.answerTally(),
  });
});

/** The QR the booth puts on a screen or a poster. */
app.get('/api/join.svg', (req, res) => {
  const url = JOIN_URL();
  const size = Math.min(2000, Math.max(200, Number(req.query.size) || 900));
  res.type('svg').send(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    qrSvg(url, { x: 0, y: 0, size, dark: '#07182C', light: '#FCFCFC', radius: Math.round(size * 0.02) }) +
    `</svg>`
  );
});

app.get('/api/join', (req, res) => {
  const url = JOIN_URL();
  res.json({ url, ...qrInfo(url) });
});

// ------------------------------------------------------------- booth agent
//
// The booth machine pulls work rather than the hosted app pushing it: the booth
// sits behind whatever network the venue has, and an outbound poll needs no
// inbound port, no tunnel and no fixed address.

const agentAuth = (req, res, next) => {
  if (!AGENT_TOKEN) return res.status(503).json({ error: 'agent-disabled' });
  const given = req.get('x-agent-token') ?? '';
  // Constant-length compare is overkill for a booth, but the token is the only
  // thing between the print queue and the open internet.
  if (given.length !== AGENT_TOKEN.length || given !== AGENT_TOKEN) {
    return res.status(401).json({ error: 'bad-token' });
  }
  next();
};

/** The agent checking in, and reporting what the printer is doing. */
app.post('/api/agent/heartbeat', agentAuth, async (req, res) => {
  agentSeenAt = Date.now();
  agentReport = {
    ok: req.body?.printerOk !== false,
    detail: String(req.body?.detail ?? 'ok').slice(0, 300),
    lastPrintMs: Number(req.body?.lastPrintMs) || null,
  };
  const cap = await capacity(printerHealthNow());
  res.json({ ok: true, capacity: cap, autoApprove: AUTO_APPROVE });
});

/** Claim the next approved sticker. Returns the line, not pixels. */
app.post('/api/agent/next', agentAuth, async (req, res) => {
  agentSeenAt = Date.now();
  const job = await store.claimNextPrintJob();
  if (!job) return res.json({ job: null });
  res.json({ job: { id: job.id, text: job.text, templateId: job.template_id, attempts: job.attempts } });
});

app.post('/api/agent/:id/done', agentAuth, async (req, res) => {
  const id = Number(req.params.id);
  await store.markPrinted(id);
  const row = await store.getSticker(id);
  broadcast('printed', { id, text: row?.text, templateId: row?.template_id, count: await store.printedCount() });
  res.json({ ok: true });
});

app.post('/api/agent/:id/failed', agentAuth, async (req, res) => {
  const id = Number(req.params.id);
  const message = String(req.body?.error ?? 'print failed').slice(0, 300);
  const row = await store.getSticker(id);
  // One retry, then it parks and shows up on the approve tablet where somebody
  // is looking. Nothing retries forever and nothing disappears.
  const status = (row?.attempts ?? 0) < 2 ? 'approved' : 'failed';
  await store.markFailed(id, status, message);
  broadcast(status === 'approved' ? 'print-retry' : 'print-failed', { id, error: message });
  res.json({ ok: true, requeued: status === 'approved' });
});

// ------------------------------------------------------------------- printing

/** sharp is loaded only when something is actually going to be printed. */
async function renderPng(text, templateId) {
  const { compose } = await import('../compose/compose.js');
  return compose(text, templateId, { skipSanitise: true });
}

let localPrinterHealth = { ok: true, mode: printMode(), detail: 'not yet used', lastPrintMs: null };

/**
 * Where the printer's health comes from.
 *
 * Locally it is this process, which owns the printer. Hosted, it is whatever
 * the booth agent last said - and silence counts as down, because a queue that
 * keeps accepting while the booth is unplugged is the exact failure this is
 * meant to prevent.
 */
const printerHealthNow = () => {
  if (!HOSTED) return localPrinterHealth;
  const age = Date.now() - agentSeenAt;
  if (!agentSeenAt || age > AGENT_TIMEOUT_MS) {
    return { ok: false, mode: 'agent', lastPrintMs: null,
      detail: agentSeenAt ? `booth agent last seen ${Math.round(age / 1000)}s ago` : 'waiting for the booth agent' };
  }
  return { ok: agentReport.ok, mode: 'agent', detail: agentReport.detail, lastPrintMs: agentReport.lastPrintMs ?? null };
};
let pumping = false;
let retryTimer = null;

const RETRY_MS = 5000;

/** Re-run the queue shortly. Used after a failure, so a requeued job is not
 *  left sitting there waiting for the next person to tap approve. */
function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => { retryTimer = null; pump(); }, RETRY_MS);
}

/**
 * Drain the approved queue, one at a time.
 *
 * One retry, then the job is parked as `failed` and surfaced on the approve
 * tablet, where somebody is actually looking. Nothing retries forever and
 * nothing disappears.
 */
async function pump() {
  // The hosted copy has no printer. Jobs leave it through the agent API.
  if (HOSTED || pumping) return;
  pumping = true;
  try {
    for (;;) {
      const job = await store.claimNextPrintJob();
      if (!job) break;

      try {
        const { png } = await renderPng(job.text, job.template_id);
        const result = await printSticker(png);
        await store.markPrinted(job.id);
        localPrinterHealth = { ok: true, mode: result.mode, detail: result.detail, lastPrintMs: result.ms };
        broadcast('printed', {
          id: job.id, text: job.text, templateId: job.template_id, count: await store.printedCount(),
        });
      } catch (err) {
        const message = err.message ?? String(err);
        localPrinterHealth = { ok: false, mode: printMode(), detail: message, lastPrintMs: null };

        if (job.attempts < 1) {
          // First failure: back on the queue for one more go, and schedule it.
          // Without the timer the job sits in `approved` with nothing driving
          // it, which is exactly how a sticker gets lost while its owner is
          // still standing at the booth.
          await store.markFailed(job.id, 'approved', message);
          broadcast('print-retry', { id: job.id, error: message });
          scheduleRetry();
        } else {
          await store.markFailed(job.id, 'failed', message);
          broadcast('print-failed', { id: job.id, text: job.text, error: message });
          console.error(`[print] sticker ${job.id} parked after ${job.attempts} attempts: ${message}`);
        }
        break; // stop the line rather than burning through the queue into a dead printer
      }
    }
  } finally {
    pumping = false;
  }
}

app.get('/api/health', async (req, res) => {
  res.json({
    store: store.kind,
    printer: printerHealthNow(),
    printerName: printerName() || '(system default)',
    visiblePrinters: await listPrinters(),
    counts: await store.statusCounts(),
    placeholderBrand: USING_PLACEHOLDER_LOCKUP,
    printSeconds: PRINT_SECONDS,
    capacity: await capacity(printerHealthNow()),
    autoApprove: AUTO_APPROVE,
    joinUrl: JOIN_URL(),
  });
});


export { pump, JOIN_URL, PORT, AUTO_APPROVE, HOSTED };
