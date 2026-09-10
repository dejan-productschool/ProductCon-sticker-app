// Deterministic typesetting.
//
// The attendee's line is the whole point of the sticker, so it is not left to a
// renderer's font lookup. We read the outlines out of the .ttf ourselves and
// emit <path> elements. Same input, same pixels, on the Mac it was designed on
// and on the Windows mini PC in the hall, with no fonts installed there.
//
// Fonts are Figtree and JetBrains Mono - the pair the AIPMC decks use. Product
// School's own faces are saans / saansDisplay / antarcticanMono, which are
// licensed and not redistributable, so they are not vendored here. If the
// licence covers this, drop the .ttf into assets/fonts and change FACES.

import * as fontkit from 'fontkit';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const fontPath = (f) => join(HERE, '../../assets/fonts/', f);

const FACES = {
  display: 'Figtree[wght].ttf',
  mono: 'JetBrainsMono[wght].ttf',
};

const faces = Object.fromEntries(
  Object.entries(FACES).map(([key, file]) => [key, fontkit.openSync(fontPath(file))])
);

export const DEFAULT_FACE = 'display';

// Instancing a variable font is not free, and auto-fit probes many sizes.
// Cache by face and weight.
const instances = new Map();
function instance(face, weight) {
  const key = `${face}:${weight}`;
  if (!instances.has(key)) instances.set(key, faces[face].getVariation({ wght: weight }));
  return instances.get(key);
}

const upem = (face) => faces[face].unitsPerEm;
export const capRatio = (face = DEFAULT_FACE) =>
  (faces[face].capHeight ?? upem(face) * 0.7) / upem(face);

/**
 * Can every face draw this code point?
 *
 * Deliberately strict: a character kept because the display face has it, but
 * missing from the mono face, would print as a .notdef box the moment somebody
 * picks the Terminal template.
 */
export function hasGlyph(codePoint) {
  return Object.values(faces).every((f) => f.hasGlyphForCodePoint(codePoint));
}

/** Width of a string in em units (multiply by fontSize for px). */
function measureEm(text, face, weight, tracking) {
  if (!text) return 0;
  const run = instance(face, weight).layout(text);
  const trackingUnits = tracking * upem(face) * Math.max(0, run.glyphs.length - 1);
  return (run.advanceWidth + trackingUnits) / upem(face);
}

/**
 * Break a word that is too wide for the column into pieces that fit.
 *
 * Only reached for a single unbroken run longer than the column - a pasted URL,
 * or somebody holding down a key. Without this the fitter shrinks all the way
 * to minFontSize and still overflows, which is the one way a sticker can reach
 * the printer looking broken.
 */
function hardBreak(word, opts) {
  const pieces = [];
  let piece = '';
  for (const ch of word) {
    const candidate = piece + ch;
    if (piece && measureEm(candidate, opts.face, opts.weight, opts.tracking) * opts.fontSize > opts.maxWidth) {
      pieces.push(piece);
      piece = ch;
    } else {
      piece = candidate;
    }
  }
  if (piece) pieces.push(piece);
  return pieces;
}

/**
 * Greedy word wrap at a given font size. Never returns null: words too wide for
 * the column are broken rather than refused.
 */
function wrap(text, opts) {
  const { face, weight, tracking, fontSize, maxWidth } = opts;
  const words = text.split(/\s+/).filter(Boolean).flatMap((word) =>
    measureEm(word, face, weight, tracking) * fontSize > maxWidth ? hardBreak(word, opts) : [word]
  );
  if (words.length === 0) return [];

  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureEm(candidate, face, weight, tracking) * fontSize <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Fit `text` into `box`, shrinking until it does.
 *
 * Auto-fit stops at minFontSize rather than going arbitrarily small: a sticker
 * with 8 px type is a failed sticker, and we would rather the character limit
 * in the kiosk field caught it first. `fits: false` comes back so the caller
 * can decide, and never throws mid-print.
 */
export function fitText(text, box, style = {}) {
  const {
    face = DEFAULT_FACE,
    weight = 800,
    tracking = 0,          // em units, added between glyphs
    lineHeight = 1.05,     // multiple of font size
    align = 'center',      // left | center | right
    vAlign = 'middle',     // top | middle | bottom
    maxFontSize = 150,
    minFontSize = 34,
    step = 2,
  } = style;

  const base = { face, weight, tracking, maxWidth: box.w };

  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= step) {
    const lines = wrap(text, { ...base, fontSize });
    if (lines.length * fontSize * lineHeight > box.h) continue;
    return { fits: true, lines, fontSize, lineHeight, face, weight, tracking, align, vAlign, box };
  }

  // Nothing fit. Return the smallest attempt so the caller can render a proof
  // and see the overflow rather than getting an exception.
  return {
    fits: false, lines: wrap(text, { ...base, fontSize: minFontSize }),
    fontSize: minFontSize, lineHeight, face, weight, tracking, align, vAlign, box,
  };
}

/** Turn a fitText() result into SVG <path> markup. */
export function textToSvg(fitted, { fill = '#000' } = {}) {
  const { lines, fontSize, lineHeight, face, weight, tracking, align, vAlign, box } = fitted;
  const scale = fontSize / upem(face);
  const inst = instance(face, weight);

  const capHeight = capRatio(face) * fontSize;
  const lineStep = fontSize * lineHeight;
  // Centre the cap band, not the em boxes. Leading below the last line and the
  // gap above the caps on the first are both invisible, and including them
  // pushes an all-caps block visibly high in its box.
  const inkHeight = (lines.length - 1) * lineStep + capHeight;

  let inkTop;
  if (vAlign === 'top') inkTop = box.y;
  else if (vAlign === 'bottom') inkTop = box.y + box.h - inkHeight;
  else inkTop = box.y + (box.h - inkHeight) / 2;

  const parts = [];

  lines.forEach((line, i) => {
    const run = inst.layout(line);
    const lineWidth =
      (run.advanceWidth + tracking * upem(face) * Math.max(0, run.glyphs.length - 1)) * scale;

    let penX;
    if (align === 'left') penX = box.x;
    else if (align === 'right') penX = box.x + box.w - lineWidth;
    else penX = box.x + (box.w - lineWidth) / 2;

    const baseline = inkTop + capHeight + i * lineStep;

    run.glyphs.forEach((glyph, gi) => {
      const pos = run.positions[gi];
      const d = glyph.path.toSVG();
      if (d) {
        const gx = penX + pos.xOffset * scale;
        const gy = baseline - pos.yOffset * scale;
        // scale(s, -s) flips the font's y-up outlines into SVG's y-down space.
        parts.push(
          `<path d="${d}" fill="${fill}" transform="translate(${gx.toFixed(3)} ${gy.toFixed(3)}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})"/>`
        );
      }
      penX += pos.xAdvance * scale + tracking * fontSize;
    });
  });

  return parts.join('\n');
}

/** Convenience: fit and render in one call. */
export function typeset(text, box, style = {}, { fill = '#000' } = {}) {
  const fitted = fitText(text, box, style);
  return { svg: textToSvg(fitted, { fill }), fitted };
}

export const FONT_INFO = Object.fromEntries(
  Object.entries(faces).map(([k, f]) => [k, { family: f.familyName, unitsPerEm: f.unitsPerEm, capRatio: capRatio(k) }])
);
