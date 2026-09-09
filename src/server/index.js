// The booth server. One process, one machine, one day.
//
// Serves the three screens (kiosk, approve tablet, wall), composes stickers,
// holds the queue, and drives the printer. Everything is local.

import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { networkInterfaces } from 'node:os';
import { compose, offerTemplates } from '../compose/compose.js';
import { sanitise, MAX_CHARS } from '../compose/sanitise.js';
import { getTemplate, TEMPLATES } from '../compose/templates.js';
import { CANVAS, PRINT_SECONDS } from '../compose/constants.js';
import { USING_PLACEHOLDER_LOCKUP } from '../compose/brand.js';
import { printSticker, printMode, listPrinters, printerName } from '../print/printer.js';
import * as store from './db.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.PORT ?? 4173);
const PROMPT = process.env.STICKER_PROMPT ?? 'What did you ship that you are proud of?';

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(express.static(join(ROOT, 'public')));

// ---------------------------------------------------------------- live events

const clients = new Set();

function broadcast(event, data) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(frame);
}

app.get('/api/events', (req, res) => {
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
    prompt: PROMPT,
    maxChars: MAX_CHARS,
    canvas: CANVAS,
    templates: TEMPLATES.map((t) => ({ id: t.id, name: t.name, description: t.description })),
  });
});

/** Compose the three options for a typed line. */
app.post('/api/preview', async (req, res) => {
  const clean = sanitise(req.body?.text);
  if (clean.text.length === 0) {
    return res.status(400).json({ error: 'empty', reasons: clean.reasons });
  }

  const ids = offerTemplates(clean.text);
  const options = await Promise.all(ids.map(async (id) => {
    const { png, meta } = await compose(clean.text, id, { skipSanitise: true });
    return {
      templateId: id,
      name: getTemplate(id).name,
      fontSize: meta.fontSize,
      dataUrl: `data:image/png;base64,${png.toString('base64')}`,
    };
  }));

  res.json({ text: clean.text, reasons: clean.reasons, dropped: clean.dropped, options });
});

/** Ship It. Composes the final PNG and puts it in front of a volunteer. */
app.post('/api/submit', async (req, res) => {
  const clean = sanitise(req.body?.text);
  const templateId = String(req.body?.templateId ?? '');

  if (clean.text.length === 0) return res.status(400).json({ error: 'empty' });
  if (!getTemplate(templateId)) return res.status(400).json({ error: 'unknown-template' });

  const { png, meta } = await compose(clean.text, templateId, { skipSanitise: true });
  const id = store.createSticker({
    text: clean.text,
    templateId,
    png,
    flagged: !clean.ok,
    reasons: clean.reasons,
  });

  broadcast('queued', { id, text: clean.text, templateId, flagged: !clean.ok });
  res.json({ id, queued: true, fontSize: meta.fontSize });
});

app.get('/api/sticker/:id.png', (req, res) => {
  const png = store.getPng(Number(req.params.id));
  if (!png) return res.sendStatus(404);
  res.type('png').set('Cache-Control', 'public, max-age=31536000, immutable').send(Buffer.from(png));
});

// ------------------------------------------------------------- approve tablet

app.get('/api/queue', (req, res) => {
  res.json({
    pending: store.listPending(),
    inFlight: store.listInFlight(),
    counts: store.statusCounts(),
    printer: printerHealth,
  });
});

app.post('/api/queue/:id/approve', (req, res) => {
  const id = Number(req.params.id);
  if (!store.approve(id)) return res.sendStatus(404);
  broadcast('approved', { id });
  pump();
  res.json({ ok: true });
});

app.post('/api/queue/:id/reject', (req, res) => {
  const id = Number(req.params.id);
  if (!store.reject(id)) return res.sendStatus(404);
  // Rejects are logged, not dropped. If the filter is rejecting things it
  // should not, that only shows up if the rows are still there afterwards.
  broadcast('rejected', { id });
  res.json({ ok: true });
});

// -------------------------------------------------------------------- the wall

app.get('/api/wall', (req, res) => {
  res.json({ printed: store.listPrinted(200), count: store.printedCount() });
});

// ------------------------------------------------------------------- printing

let printerHealth = { ok: true, mode: printMode(), detail: 'not yet used', lastPrintMs: null };
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
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const job = store.claimNextPrintJob();
      if (!job) break;

      try {
        const result = await printSticker(Buffer.from(job.png));
        store.markPrinted(job.id);
        printerHealth = { ok: true, mode: result.mode, detail: result.detail, lastPrintMs: result.ms };
        broadcast('printed', {
          id: job.id, text: job.text, templateId: job.template_id, count: store.printedCount(),
        });
      } catch (err) {
        const message = err.message ?? String(err);
        printerHealth = { ok: false, mode: printMode(), detail: message, lastPrintMs: null };

        if (job.attempts < 1) {
          // First failure: back on the queue for one more go, and schedule it.
          // Without the timer the job sits in `approved` with nothing driving
          // it, which is exactly how a sticker gets lost while its owner is
          // still standing at the booth.
          store.markFailed(job.id, 'approved', message);
          broadcast('print-retry', { id: job.id, error: message });
          scheduleRetry();
        } else {
          store.markFailed(job.id, 'failed', message);
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
    printer: printerHealth,
    printerName: printerName() || '(system default)',
    visiblePrinters: await listPrinters(),
    counts: store.statusCounts(),
    placeholderBrand: USING_PLACEHOLDER_LOCKUP,
    printSeconds: PRINT_SECONDS,
  });
});

// ---------------------------------------------------------------------- start

const requeued = store.recoverInterrupted();
if (requeued) console.log(`[queue] re-queued ${requeued} sticker(s) interrupted by a restart`);

app.listen(PORT, () => {
  const lan = Object.values(networkInterfaces()).flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;

  console.log(`
  Ship It sticker station
  -----------------------
  kiosk    http://localhost:${PORT}/
  approve  http://localhost:${PORT}/approve/${lan ? `   (tablet: http://${lan}:${PORT}/approve/)` : ''}
  wall     http://localhost:${PORT}/wall/

  printer  ${printMode()}${printerName() ? ` -> "${printerName()}"` : ' (system default)'}
  prompt   "${PROMPT}"
  limit    ${MAX_CHARS} characters${USING_PLACEHOLDER_LOCKUP ? '\n\n  ! Brand assets are placeholders. See src/compose/brand.js.' : ''}
`);
  pump();
});
