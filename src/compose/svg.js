// Composing a sticker as SVG.
//
// Deliberately free of sharp, or any other native dependency: every glyph is
// already an embedded path, so a browser draws this with no fonts installed and
// the hosted app needs no rasteriser. The only PNG that matters is the one the
// booth agent makes, next to the printer.

import { CANVAS, MIN_LEGIBLE_PX } from './constants.js';
import { getTemplate, templateFurniture, TEMPLATES, TEMPLATE_IDS } from './templates.js';
import { fitText, textToSvg } from './typeset.js';

const escapeXml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

/** Build the full SVG document for a sticker. */
export function composeSvg(text, templateId) {
  const template = getTemplate(templateId);
  if (!template) throw new Error(`unknown template: ${templateId}`);

  const fitted = fitText(text, template.textBox, template.textStyle);
  const textSvg = textToSvg(fitted, { fill: template.textFill });

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">`,
    `<title>${escapeXml(text)}</title>`,
    template.behind(),
    textSvg,
    template.above ? template.above() : '',
    templateFurniture(template),
    `</svg>`,
  ].join('\n');

  return { svg, fitted, template };
}

/**
 * Three of the six, so the attendee picks from a short list rather than a grid.
 *
 * Offered templates are filtered by whether they can actually set *this* line
 * legibly. Roundel holds about two dozen characters before the type gets too
 * small to read on a 50 mm sticker, so a long line simply is not offered it,
 * rather than the character limit being dragged down to what a circle can take.
 */
export function offerTemplates(text, count = 3) {
  const scored = TEMPLATES.map((t) => ({
    id: t.id,
    fontSize: fitText(text, t.textBox, t.textStyle).fontSize,
  }));

  const legible = scored.filter((t) => t.fontSize >= MIN_LEGIBLE_PX);
  // If a line is long enough that nothing clears the floor, fall back to the
  // roomiest templates rather than showing the attendee an empty screen.
  const pool = (legible.length >= count ? legible : [...scored].sort((a, b) => b.fontSize - a.fontSize))
    .map((t) => t.id);

  // Deterministic shuffle: the same line always offers the same three, so a
  // retyped line does not feel random to the attendee.
  let seed = [...text].reduce((a, ch) => (Math.imul(a, 31) + ch.codePointAt(0)) >>> 0, 7) || 1;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);

  const ids = [...pool];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, count);
}

export { TEMPLATE_IDS };
