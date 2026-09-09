// DAY ONE. Run this before any UI exists.
//
//   npm run spike -- --dry          render the target, print nothing
//   npm run spike                   render and print it
//   npm run spike -- --printer "Brother VC-500W"
//
// One hardcoded PNG, the real printer, the real stock. What comes out answers
// the questions the rest of the build is standing on:
//
//   1. Does the sticker measure 50 mm across, or is the driver scaling it?
//   2. How much of the edge is lost to registration drift?
//   3. What do the brand colours actually look like on ZINK stock?
//   4. How long does one sticker really take, hand to hand?
//
// Everything downstream is guesswork until the ruler on this thing has been
// held against a real ruler.

import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CANVAS, STICKER_MM, DPI, SAFE_INSET, mmToPx, PRINT_SECONDS } from '../compose/constants.js';
import { PALETTE as P } from '../compose/brand.js';
import { fitText, textToSvg } from '../compose/typeset.js';
import { printSticker, printMode, listPrinters, printerName } from './printer.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../out');

function label(text, box, opts = {}) {
  return textToSvg(
    fitText(text, box, {
      weight: opts.weight ?? 700, tracking: opts.tracking ?? 0.06,
      align: opts.align ?? 'center', vAlign: 'middle',
      maxFontSize: opts.size ?? box.h, minFontSize: 6, step: 1,
    }),
    { fill: opts.fill ?? P.ink }
  );
}

// Fixed vertical rhythm, so no band can grow into the one below it.
const BAND = {
  title:    Math.round(CANVAS * 0.085),
  meta:     Math.round(CANVAS * 0.140),
  caption:  Math.round(CANVAS * 0.225),
  ruler:    Math.round(CANVAS * 0.300),
  swatches: Math.round(CANVAS * 0.450),
  lines:    Math.round(CANVAS * 0.680),
  footer:   Math.round(CANVAS * 0.875),
};

/** The measurement target. Deliberately ugly; it is an instrument, not a sticker. */
export function targetSvg() {
  const parts = [];
  const hair = Math.max(1, Math.round(CANVAS * 0.0022));
  const full = { x: SAFE_INSET, w: CANVAS - SAFE_INSET * 2 };

  parts.push(`<rect width="${CANVAS}" height="${CANVAS}" fill="#FFFFFF"/>`);

  // Rule at the very edge. However much of this survives is how much bleed the
  // templates need.
  parts.push(`<rect x="${hair / 2}" y="${hair / 2}" width="${CANVAS - hair}" height="${CANVAS - hair}"
    fill="none" stroke="${P.ink}" stroke-width="${hair}"/>`);

  // The safe area the templates keep meaning inside.
  parts.push(`<rect x="${SAFE_INSET}" y="${SAFE_INSET}" width="${full.w}" height="${CANVAS - SAFE_INSET * 2}"
    fill="none" stroke="${P.brand}" stroke-width="${hair}" stroke-dasharray="8 6" opacity="0.7"/>`);

  // Corner crosshairs. Half of each falls outside the label, so what comes back
  // shows registration drift directly.
  const arm = mmToPx(5);
  for (const [cx, cy] of [[0, 0], [CANVAS, 0], [0, CANVAS], [CANVAS, CANVAS]]) {
    parts.push(`<g stroke="${P.ink}" stroke-width="${hair * 3}" stroke-linecap="butt">
      <path d="M ${cx - arm} ${cy} H ${cx + arm}"/><path d="M ${cx} ${cy - arm} V ${cy + arm}"/></g>`);
  }

  parts.push(label('SHIP IT - PRINT SPIKE', { ...full, y: BAND.title, h: mmToPx(3.6) },
    { weight: 800, tracking: 0.1 }));
  parts.push(label(`${CANVAS} x ${CANVAS} px  -  ${DPI} dpi  -  ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
    { ...full, y: BAND.meta, h: mmToPx(2.1) }, { weight: 500, fill: '#666' }));

  parts.push(label(`0 to ${STICKER_MM} mm  -  measure this against a real ruler`,
    { ...full, y: BAND.caption, h: mmToPx(2.3) }, { fill: P.brandDk, weight: 700 }));

  // Ruler: a tick every millimetre, taller every 5, tallest every 10.
  // If 50 mm is not 50 mm, the driver is scaling the label.
  parts.push(`<path d="M 0 ${BAND.ruler} H ${CANVAS}" stroke="${P.ink}" stroke-width="${hair}"/>`);
  for (let mm = 0; mm <= STICKER_MM; mm++) {
    const x = Math.min(mmToPx(mm), CANVAS - hair);
    const len = mm % 10 === 0 ? mmToPx(4) : mm % 5 === 0 ? mmToPx(2.6) : mmToPx(1.3);
    parts.push(`<path d="M ${x} ${BAND.ruler} V ${BAND.ruler + len}" stroke="${P.ink}" stroke-width="${hair}"/>`);
    if (mm % 10 === 0 && mm > 0 && mm < STICKER_MM) {
      parts.push(label(String(mm), { x: x - mmToPx(4), y: BAND.ruler + mmToPx(4.4), w: mmToPx(8), h: mmToPx(2.4) },
        { weight: 600, tracking: 0 }));
    }
  }

  // Colour patches. ZINK is not a screen; this is how the palette really lands.
  const swatches = [P.brand, P.brandDk, P.sun, P.mint, P.sky, P.ink, '#808080', P.cream];
  const sw = full.w / swatches.length;
  swatches.forEach((c, i) => {
    parts.push(`<rect x="${(full.x + i * sw).toFixed(2)}" y="${BAND.swatches}" width="${sw.toFixed(2)}"
      height="${mmToPx(10)}" fill="${c}"/>`);
  });
  parts.push(`<rect x="${full.x}" y="${BAND.swatches}" width="${full.w}" height="${mmToPx(10)}"
    fill="none" stroke="${P.ink}" stroke-width="${hair}"/>`);

  // Line pairs, to see what 313 dpi actually resolves on this stock.
  const widths = [1, 2, 3, 4, 6, 8];
  const slot = full.w / widths.length;
  widths.forEach((w, i) => {
    const x = full.x + i * slot;
    for (let k = 0; k < 4; k++) {
      parts.push(`<rect x="${(x + k * w * 2).toFixed(2)}" y="${BAND.lines}" width="${w}"
        height="${mmToPx(5)}" fill="${P.ink}"/>`);
    }
    parts.push(label(`${w}px`, { x, y: BAND.lines + mmToPx(5.6), w: slot, h: mmToPx(2.1) },
      { align: 'left', weight: 500, fill: '#666', tracking: 0 }));
  });

  parts.push(label('dashed line = safe area  -  crosses = registration',
    { ...full, y: BAND.footer, h: mmToPx(2.1) }, { weight: 500, fill: '#666' }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
    ${parts.join('\n')}
  </svg>`;
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');

  // npm strips the quotes from `npm run spike -- --printer "Brother VC-500W"`,
  // so the name arrives as several argv entries. Take everything up to the next
  // flag, not just the next word.
  const at = args.indexOf('--printer');
  if (at !== -1) {
    const rest = args.slice(at + 1);
    const end = rest.findIndex((a) => a.startsWith('--'));
    const name = (end === -1 ? rest : rest.slice(0, end)).join(' ').trim();
    if (name) process.env.STICKER_PRINTER = name;
  }
  if (dry) process.env.STICKER_PRINT_MODE = 'dry';

  await mkdir(OUT, { recursive: true });
  const png = await sharp(Buffer.from(targetSvg()))
    .png({ compressionLevel: 9 })
    .withMetadata({ density: DPI })
    .toBuffer();

  const path = join(OUT, 'print-spike-target.png');
  await writeFile(path, png);

  const meta = await sharp(png).metadata();
  console.log(`target      ${path}`);
  console.log(`pixels      ${meta.width} x ${meta.height}, ${meta.density} dpi, ${meta.space}`);
  console.log(`physical    ${STICKER_MM} x ${STICKER_MM} mm`);
  console.log(`mode        ${printMode()}${printerName() ? ` -> "${printerName()}"` : ' (system default printer)'}`);

  const printers = await listPrinters();
  console.log(`visible     ${printers.length ? printers.join(', ') : 'none'}`);

  if (!dry && printers.length === 0) {
    console.log(`
No printer is set up on this machine, so there is nothing to send to.

Connect the VC-500W, add it in ${process.platform === 'win32'
      ? 'Settings > Bluetooth & devices > Printers & scanners'
      : 'System Settings > Printers & Scanners'}, then run this again.

Until then, \`npm run spike -- --dry\` renders out/print-spike-target.png so you
can check the target itself.`);
    process.exitCode = 1;
    return;
  }

  if (printMode() === 'dry') {
    console.log('\nDry run, nothing sent. Drop --dry with the VC-500W connected.');
    return;
  }

  console.log('\nsending...');
  const started = Date.now();
  const result = await printSticker(png);
  const ms = Date.now() - started;

  console.log(`submitted   ${ms} ms  ${result.detail}`);
  console.log(`
The number that matters is not that one. Start a stopwatch when you hit enter and
stop it when the sticker is off the backing and in your hand. Head movement alone
is about ${PRINT_SECONDS.toFixed(1)}s; the spec assumes 15-20s hand to hand.

Then check, on the sticker itself:
  - is 0 to ${STICKER_MM} on the ruler exactly ${STICKER_MM} mm against a real ruler?
  - how much of the outer black rule survived?
  - do the colour patches look like the palette, or has ZINK shifted them?
  - which line pairs are still separate lines?

Write the answers into docs/print-spike-results.md before building anything else.`);
}

main().catch((e) => { console.error('\nSPIKE FAILED\n', e.message); process.exit(1); });
