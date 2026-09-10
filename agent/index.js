// The booth agent.
//
// Runs on the Windows mini PC next to the VC-500W. Everything else lives on
// the hosted app; this is the only piece that touches the printer.
//
//   STICKER_API=https://... STICKER_AGENT_TOKEN=... npm run agent
//
// It pulls work rather than being pushed to. The booth sits behind whatever
// network the venue provides, so an outbound poll needs no inbound port, no
// tunnel and no fixed address - and when the wifi drops, the agent simply keeps
// asking until it comes back. Nothing is lost, because the queue is not here.
//
// Stickers are rendered locally from the line and the template id. The hosted
// app never ships pixels: the renderer is deterministic, so the same two
// strings produce the same PNG here as they do in the phone's preview.

import { compose } from '../src/compose/compose.js';
import { printSticker, printMode, listPrinters, printerName } from '../src/print/printer.js';

const API = (process.env.STICKER_API ?? 'http://localhost:4173').replace(/\/$/, '');
const TOKEN = process.env.STICKER_AGENT_TOKEN ?? '';

const IDLE_MS = Number(process.env.STICKER_AGENT_IDLE_MS ?? 2000);   // nothing to do
const BUSY_MS = Number(process.env.STICKER_AGENT_BUSY_MS ?? 250);    // more waiting
const ERROR_MS = Number(process.env.STICKER_AGENT_ERROR_MS ?? 5000); // something is wrong

if (!TOKEN) {
  console.error('STICKER_AGENT_TOKEN is required. It must match the hosted app.');
  process.exit(1);
}

let printerOk = true;
let printerDetail = 'starting up';
let lastPrintMs = null;
let printed = 0;
let consecutiveFailures = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-agent-token': TOKEN },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text().catch(() => '')}`.trim());
  return res.json();
}

const heartbeat = () => call('/api/agent/heartbeat', { printerOk, detail: printerDetail, lastPrintMs });

/**
 * One sticker, end to end.
 *
 * A failure is reported and then rethrown as handled: the hosted app decides
 * whether it gets one more go or parks for a human, because it is the thing
 * holding the queue.
 */
async function handle(job) {
  const started = Date.now();
  const { png } = await compose(job.text, job.templateId, { skipSanitise: true });
  const result = await printSticker(png);

  lastPrintMs = Date.now() - started;
  printed += 1;
  printerOk = true;
  printerDetail = result.detail ?? 'ok';
  consecutiveFailures = 0;

  await call(`/api/agent/${job.id}/done`);
  console.log(`#${job.id} printed in ${(lastPrintMs / 1000).toFixed(1)}s  "${job.text}"  (${printed} today)`);
}

async function loop() {
  for (;;) {
    try {
      const { job } = await call('/api/agent/next');

      if (!job) {
        await heartbeat();
        await sleep(IDLE_MS);
        continue;
      }

      try {
        await handle(job);
        await sleep(BUSY_MS);
      } catch (err) {
        const message = err?.message ?? String(err);
        printerOk = false;
        printerDetail = message;
        consecutiveFailures += 1;
        console.error(`#${job.id} FAILED (${consecutiveFailures} in a row): ${message}`);

        // Hand it back before pausing, so the sticker is requeued or parked
        // even if this agent is about to be restarted.
        await call(`/api/agent/${job.id}/failed`, { error: message }).catch(() => {});
        await heartbeat().catch(() => {});
        await sleep(ERROR_MS);
      }
    } catch (err) {
      // Network trouble, or the hosted app restarting. Keep asking.
      printerDetail = `cannot reach the booth API: ${err?.message ?? err}`;
      console.error(printerDetail);
      await sleep(ERROR_MS);
    }
  }
}

const printers = await listPrinters();
console.log(`
  Ship It booth agent
  -------------------
  api       ${API}
  printer   ${printMode()}${printerName() ? ` -> "${printerName()}"` : ' (system default)'}
  visible   ${printers.length ? printers.join(', ') : 'none'}
`);

if (printMode() !== 'dry' && printers.length === 0) {
  console.error('No printer is set up on this machine. The agent will report the booth as down.');
  printerOk = false;
  printerDetail = 'no printer configured on the booth machine';
}

await loop();
