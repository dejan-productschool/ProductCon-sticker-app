// Deterministic typesetting.
//
// The attendee's line is the whole point of the sticker, so it is not left to a
// renderer's font lookup. We read the outlines out of the .ttf ourselves and
// emit <path> elements. Same input, same pixels, on the Mac it was designed on
// and on the Windows mini PC in the hall, with no fonts installed there.

import * as fontkit from 'fontkit';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const FONT_PATH = join(HERE, '../../assets/fonts/Inter[opsz,wght].ttf');

const font = fontkit.openSync(FONT_PATH);
const UPEM = font.unitsPerEm;

// Instancing a variable font is not free, and we do it once per size probe
// during auto-fit. Cache by weight.
const instances = new Map();
function instance(weight) {
  if (!instances.has(weight)) {
    instances.set(weight, font.getVariation({ wght: weight, opsz: 32 }));
  }
  return instances.get(weight);
}

/** Does the font actually have a glyph for this code point? */
export function hasGlyph(codePoint) {
  return font.hasGlyphForCodePoint(codePoint);
}

/** Width of a string in em units (multiply by fontSize for px). */
function measureEm(text, weight, tracking) {
  if (!text) return 0;
  const run = instance(weight).layout(text);
  const trackingUnits = tracking * UPEM * Math.max(0, run.glyphs.length - 1);
  return (run.advanceWidth + trackingUnits) / UPEM;
}

/**
 * Break a word that is too wide for the column into pieces that fit.
 *
 * Only reached for a single unbroken run longer than the column - a pasted URL,
 * or somebody holding down a key. Without this the fitter shrinks all the way
 * to minFontSize and still overflows, which is the one way a sticker can reach
 * the printer looking broken.
 */
function hardBreak(word, { fontSize, weight, tracking, maxWidth }) {
  const pieces = [];
  let piece = '';
  for (const ch of word) {
    const candidate = piece + ch;
    if (piece && measureEm(candidate, weight, tracking) * fontSize > maxWidth) {
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
function wrap(text, { fontSize, weight, tracking, maxWidth }) {
  const words = text.split(/\s+/).filter(Boolean).flatMap((word) =>
    measureEm(word, weight, tracking) * fontSize > maxWidth
      ? hardBreak(word, { fontSize, weight, tracking, maxWidth })
      : [word]
  );
  if (words.length === 0) return [];

  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureEm(candidate, weight, tracking) * fontSize <= maxWidth) {
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
    weight = 800,
    tracking = 0,          // em units, added between glyphs
    lineHeight = 1.05,     // multiple of font size
    align = 'center',      // left | center | right
    vAlign = 'middle',     // top | middle | bottom
    maxFontSize = 150,
    minFontSize = 34,
    step = 2,
  } = style;

  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= step) {
    const lines = wrap(text, { fontSize, weight, tracking, maxWidth: box.w });
    const blockHeight = lines.length * fontSize * lineHeight;
    if (blockHeight > box.h) continue;
    return { fits: true, lines, fontSize, lineHeight, weight, tracking, align, vAlign, box, blockHeight };
  }

  // Nothing fit. Return the smallest attempt so the caller can render a proof
  // and see the overflow rather than getting an exception.
  const lines = wrap(text, { fontSize: minFontSize, weight, tracking, maxWidth: box.w });
  return {
    fits: false, lines, fontSize: minFontSize, lineHeight, weight, tracking,
    align, vAlign, box, blockHeight: lines.length * minFontSize * lineHeight,
  };
}

/** Turn a fitText() result into SVG <path> markup. */
export function textToSvg(fitted, { fill = '#000' } = {}) {
  const { lines, fontSize, lineHeight, weight, tracking, align, vAlign, box } = fitted;
  const scale = fontSize / UPEM;
  const inst = instance(weight);

  // Inter's cap height sits well below the em box top; centring on the em box
  // leaves the block looking high. Centre on the actual cap band instead.
  const capHeight = (font.capHeight ?? UPEM * 0.72) * scale;
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
    const trackingUnits = tracking * UPEM;
    const lineWidth =
      (run.advanceWidth + trackingUnits * Math.max(0, run.glyphs.length - 1)) * scale;

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

export const FONT_INFO = { family: font.familyName, unitsPerEm: UPEM, path: FONT_PATH };
