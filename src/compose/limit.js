// Derives the kiosk character limit from the templates, rather than guessing it.
//
// Re-run this whenever a template's text box changes:  node src/compose/limit.js
//
// The floor is legibility on a 50 mm sticker held at arm's length. Cap height
// in millimetres, not pixels, is the thing that matters.

import { fitText } from './typeset.js';
import { TEMPLATES } from './templates.js';
import { DPI, MM_PER_INCH, MIN_CAP_MM, MIN_LEGIBLE_PX, pxToCapMm } from './constants.js';

// Realistic booth answers, not lorem. Long words matter more than total length.
const CORPUS = [
  'Ship it', 'I shipped it', 'Shipped on a Friday', 'I killed my own feature',
  'I said no to the roadmap', 'Deleted more code than I wrote this quarter',
  'I shipped it on a Friday and nothing broke',
  'My best decision this year was cutting the scope in half',
  'I stopped asking for permission and started shipping every single week',
  'The roadmap was wrong so I threw it away and shipped what customers asked for',
];

console.log(`floor: ${MIN_CAP_MM} mm cap height = ${MIN_LEGIBLE_PX} px at ${DPI} dpi\n`);
console.log('chars  ' + TEMPLATES.map((t) => t.id.slice(0, 8).padStart(9)).join('') + '   worst');

let limit = 0;
for (const text of CORPUS) {
  const sizes = TEMPLATES.map((t) => fitText(text, t.textBox, t.textStyle).fontSize);
  const worst = Math.min(...sizes);
  const ok = worst >= MIN_LEGIBLE_PX;
  if (ok) limit = Math.max(limit, text.length);
  console.log(
    String(text.length).padStart(5) + '  ' +
    sizes.map((s) => String(s).padStart(9)).join('') +
    `   ${String(worst).padStart(3)}px / ${pxToCapMm(worst).toFixed(2)}mm ${ok ? 'ok' : 'TOO SMALL'}`
  );
}

console.log(`\nlongest corpus line still legible in all six: ${limit} chars`);
console.log('Set MAX_CHARS in sanitise.js at or below that.');
