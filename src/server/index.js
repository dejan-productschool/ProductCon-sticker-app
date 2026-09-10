// Local booth server.
//
// The same Express app also runs as a Vercel function (see api/index.js). This
// file is the part that only makes sense on a machine with a printer attached.

import { app, pump, JOIN_URL, PORT, AUTO_APPROVE } from './app.js';
import { recoverInterrupted, kind as storeKind } from './store/index.js';
import { printMode, printerName } from '../print/printer.js';
import { QUESTIONS, FREE_TEXT_ALLOWED } from '../compose/survey.js';
import { MAX_CHARS } from '../compose/sanitise.js';
import { USING_PLACEHOLDER_LOCKUP } from '../compose/brand.js';
import { SECONDS_PER_STICKER } from './queue.js';
import { networkInterfaces } from 'node:os';


const requeued = await recoverInterrupted();
if (requeued) console.log(`[queue] re-queued ${requeued} sticker(s) interrupted by a restart`);

app.listen(PORT, () => {
  const lan = Object.values(networkInterfaces()).flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;

  console.log(`
  Ship It sticker station
  -----------------------
  phone    http://localhost:${PORT}/
  join QR  http://localhost:${PORT}/join/
  approve  http://localhost:${PORT}/approve/${lan ? `   (tablet: http://${lan}:${PORT}/approve/)` : ''}
  wall     http://localhost:${PORT}/wall/

  store    ${storeKind}
  printer  ${printMode()}${printerName() ? ` -> "${printerName()}"` : ' (system default)'}
  join     ${JOIN_URL()}   (QR at /join/)
  survey   ${QUESTIONS.map((q) => `${q.id} (${q.options.length})`).join(' -> ')}${FREE_TEXT_ALLOWED ? ', free text on' : ''}
  queue    ${SECONDS_PER_STICKER}s per sticker, auto-approve: ${AUTO_APPROVE}${USING_PLACEHOLDER_LOCKUP ? '\n\n  ! Brand assets are placeholders. See src/compose/brand.js.' : ''}
`);
  pump();
});
