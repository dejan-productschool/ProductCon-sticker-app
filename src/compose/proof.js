// Proof sheets. Not part of the booth - this is how the six templates get
// judged, and how the stress cases get looked at rather than argued about.
//
//   npm run proof                       -- default line, all six
//   npm run proof -- "your line here"   -- one line, all six
//   npm run proof -- --stress           -- the awkward inputs, all six

import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CANVAS } from './constants.js';
import { TEMPLATES } from './templates.js';
import { compose } from './compose.js';
import { fitText, textToSvg } from './typeset.js';
import { MAX_CHARS } from './sanitise.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../out');

const STRESS = [
  'Ship it',
  'SHIPPED THE WHOLE THING',
  'x',
  'I said no to the roadmap and kept my job',
  'Supercalifragilisticexpialidocious',
  'a'.repeat(MAX_CHARS),
];

const GAP = 40;
const LABEL_H = 54;

async function tile(cells, cols, title) {
  const rows = Math.ceil(cells.length / cols);
  const cellW = CANVAS;
  const cellH = CANVAS + LABEL_H;
  const width = cols * cellW + (cols + 1) * GAP;
  const height = rows * cellH + (rows + 1) * GAP + 90;

  const composites = [];
  const labels = [];

  cells.forEach((cell, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = GAP + col * (cellW + GAP);
    const y = 90 + GAP + row * (cellH + GAP);
    composites.push({ input: cell.png, left: x, top: y });

    const fitted = fitText(cell.label, { x, y: y + CANVAS + 12, w: cellW, h: 30 }, {
      weight: 600, tracking: 0.02, align: 'left', vAlign: 'middle',
      maxFontSize: 26, minFontSize: 12, step: 1,
    });
    labels.push(textToSvg(fitted, { fill: '#5A6472' }));
  });

  const titleFit = fitText(title, { x: GAP, y: 26, w: width - GAP * 2, h: 40 }, {
    weight: 800, tracking: 0, align: 'left', vAlign: 'middle',
    maxFontSize: 38, minFontSize: 16, step: 1,
  });

  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    ${textToSvg(titleFit, { fill: '#14141C' })}
    ${labels.join('\n')}
  </svg>`;

  return sharp({
    create: { width, height, channels: 3, background: '#FFFFFF' },
  })
    .composite([...composites, { input: Buffer.from(overlay), left: 0, top: 0 }])
    .png()
    .toBuffer();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const args = process.argv.slice(2);
  const stress = args.includes('--stress');
  const phrase = args.filter((a) => !a.startsWith('--'))[0] ?? 'I shipped it on a Friday';

  if (stress) {
    for (const template of TEMPLATES) {
      const cells = [];
      for (const text of STRESS) {
        const { png, meta } = await compose(text, template.id);
        cells.push({
          png,
          label: `${meta.fontSize}px${meta.fits ? '' : '  OVERFLOW'} - "${text.slice(0, 34)}${text.length > 34 ? '...' : ''}"`,
        });
        if (!meta.fits) console.warn(`  ! ${template.id} does not fit: "${text}"`);
      }
      const sheet = await tile(cells, 3, `${template.name} - stress cases`);
      await writeFile(join(OUT, `stress-${template.id}.png`), sheet);
      console.log(`out/stress-${template.id}.png`);
    }
    return;
  }

  const cells = [];
  for (const template of TEMPLATES) {
    const { png, meta } = await compose(phrase, template.id);
    await writeFile(join(OUT, `${template.id}.png`), png);
    cells.push({ png, label: `${template.name} - ${meta.fontSize}px, ${meta.lines.length} line(s)` });
  }
  const sheet = await tile(cells, 3, `"${phrase}"  -  ${CANVAS} x ${CANVAS} px, 50 x 50 mm at 313 dpi`);
  await writeFile(join(OUT, 'proof-templates.png'), sheet);
  console.log('out/proof-templates.png  (+ one PNG per template)');
}

main().catch((e) => { console.error(e); process.exit(1); });
