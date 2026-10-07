// The six templates. Decided and final at run time: the attendee picks one of
// these, and nothing here is generated on the day.
//
// Product School Foundations: white paper, ink type, square corners, the
// spectrum used once. Display is Figtree Medium; eyebrows and Terminal use
// JetBrains Mono. Template ids stay put so a queued sticker still renders.
//
// The lockup is added by the compositor afterwards, from a fixed slot no
// template may write into.

import { CANVAS as C, SAFE, SAFE_INSET, H_INSET } from './constants.js';
import { PALETTE as P, spectrumDef, warmDef, lockupSvg, LOCKUP } from './brand.js';
import { fitText, textToSvg } from './typeset.js';

const px = (n) => Number(n.toFixed(2));

// Pull a box inside the horizontal print band. Vertical placement stays put.
// A box that is already inside is unchanged, so the frame's type, which is
// inset by the square itself, does not get a second margin.
function clampX(box) {
  const x = Math.max(box.x, H_INSET);
  const right = Math.min(box.x + box.w, C - H_INSET);
  return { ...box, x: px(x), w: px(Math.max(0, right - x)) };
}

// Full ink, cap height about 2 mm. The old eyebrows were ~17 px at 45 to 60%
// ink, which ZINK prints as a scratch. Terminal's prompt stays paper white.
const EYEBROW_H = px(Math.round(C * 0.052));

/** Small fixed label. Mono, tracked out. Always inside the print band. */
function eyebrow(text, box, { fill, align = 'left', tracking = 0.2, size } = {}) {
  const safe = clampX(box);
  return textToSvg(
    fitText(text, safe, {
      face: 'mono', weight: 500, tracking, align, vAlign: 'middle',
      maxFontSize: size ?? safe.h, minFontSize: 8, step: 1,
    }),
    { fill }
  );
}

// Room reserved at the bottom of every template for the lockup, so text and
// the card never meet it.
//
// The card ends at `C - LOCKUP_BAND - FRAME_TAIL`, which sits LOCKUP_CLEAR
// above the artwork. A full 1× mark-height exclusion zone does not fit on a
// 50 mm square once the lockup is this wide, so the gap is the air that keeps
// type and the card off the mark. The frame is a square in that same band.
const LOCKUP_CLEAR = 24;
const FRAME_TAIL = SAFE_INSET * 0.35;
const LOCKUP_BAND = Math.ceil(LOCKUP.h + LOCKUP_CLEAR + (SAFE_INSET - FRAME_TAIL));
// Spectrum colour has to sit inside the safe box. SAFE_INSET is the VC-500W
// drift zone. A bar drawn only in that strip is cut off, so the sticker
// prints as white paper. On a phone the same 8px bar is about two CSS pixels
// at the image edge, so the preview looks all white and there is no colour
// to pick. ~1.8 mm still reads once the preview is drawn at phone size.
const SPECTRUM = Math.max(22, Math.round(C * 0.036));

// The Rule bar sits just above the lockup, inside the safe box. The old bar
// started at 95.5% of the canvas, which is entirely below the safe line, so
// the cutter took the only colour. Air above the bar keeps descenders off it.
const RULE_BAR_GAP = 14;
const lockupTop = C - LOCKUP.bottom - LOCKUP.h;
const RULE_BAR_Y = px(lockupTop - RULE_BAR_GAP - SPECTRUM);
const RULE_CLEAR = Math.round(SPECTRUM + RULE_BAR_GAP + C * 0.02);

const TEXT_AREA = clampX({ x: SAFE.x, y: SAFE.y, w: SAFE.w, h: SAFE.h - LOCKUP_BAND });

// Card outline and the ticket rules. A 2px stroke at 28% ink is a few RGB
// steps on a phone and ZINK drops it, the same failure as the old Terminal
// grid, so those templates had no shape.
const HAIR = px(Math.max(4, C * 0.0065));
const HAIR_INK = P.ink80;

// Square, not the safe-width rectangle. The wide lockup eats the bottom of
// the canvas, and stretching the frame across the full safe width made a
// 542×430 slab. The side is whatever still fits above the mark.
const FRAME = (() => {
  const stroke = px(C * 0.008);
  const top = SAFE_INSET;
  const bottom = lockupTop - LOCKUP_CLEAR;
  const side = px(Math.min(C - SAFE_INSET * 2, bottom - top));
  return { x: px((C - side) / 2), y: px(top), w: side, h: side, stroke };
})();

const CARD = (() => {
  const inset = SAFE_INSET;
  const y = inset;
  const h = px(C - inset - LOCKUP_BAND - FRAME_TAIL);
  return { x: inset, y, w: C - inset * 2, h };
})();

// Terminal graph paper. White on ink, and heavy enough to read when the
// canvas is drawn at phone size and when ZINK prints it. A 1px stroke at
// 12% opacity did neither: on a phone it is a few RGB steps above the
// ground, and the printer drops it.
const TERM_GRID_OPACITY = 0.48;
const TERM_GRID_STROKE = px(Math.max(2, C * 0.0036));
// Prompt, then the line, both inside the print band. The old line ran to
// SAFE_INSET on the right, which is the edge this roll cuts.
const TERM_PROMPT_W = px(C * 0.09);
const TERM_TEXT_X = px(H_INSET + TERM_PROMPT_W + C * 0.02);

/** Graph paper. `strokeWidth` is in canvas pixels. */
const gridBg = (stroke, opacity, strokeWidth) => {
  const step = px(C / 7);
  const lines = [];
  for (let i = step; i < C; i += step) {
    lines.push(`<path d="M ${px(i)} 0 V ${C}"/><path d="M 0 ${px(i)} H ${C}"/>`);
  }
  return `<g stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}">${lines.join('')}</g>`;
};

export const TEMPLATES = [
  {
    id: 'block',
    name: 'Block',
    description: 'Warm gradient field, oversized ink type. The loudest of the six.',
    textBox: TEXT_AREA,
    textStyle: { weight: 500, tracking: -0.03, lineHeight: 1.0, maxFontSize: 132, minFontSize: 40 },
    textFill: P.ink,
    lockup: { variant: 'color', align: 'left' },
    behind: () => `
      <defs>${warmDef('block-warm')}</defs>
      <rect width="${C}" height="${C}" fill="url(#block-warm)"/>`,
  },

  {
    id: 'bubble',
    name: 'Card',
    description: 'Hairline card on paper, spectrum edge. Reads as something said.',
    textBox: clampX({
      x: CARD.x + px(C * 0.05), y: CARD.y + px(C * 0.045),
      w: CARD.w - px(C * 0.10), h: CARD.h - px(C * 0.09) - SPECTRUM,
    }),
    textStyle: { weight: 500, tracking: -0.02, lineHeight: 1.08, maxFontSize: 104, minFontSize: 34 },
    textFill: P.ink,
    lockup: { variant: 'color', align: 'left' },
    behind: () => {
      const { x, y, w, h } = CARD;
      const s = HAIR;
      return `
        <defs>${spectrumDef('card-spectrum')}</defs>
        <rect width="${C}" height="${C}" fill="${P.paper}"/>
        <rect x="${px(x + s / 2)}" y="${px(y + s / 2)}" width="${px(w - s)}" height="${px(h - s)}"
              fill="${P.paper}" stroke="${HAIR_INK}" stroke-width="${s}"/>
        <rect x="${px(x + s)}" y="${px(y + h - s - SPECTRUM)}" width="${px(w - s * 2)}" height="${SPECTRUM}"
              fill="url(#card-spectrum)"/>`;
    },
  },

  {
    id: 'roundel',
    name: 'Frame',
    description: 'Square ink frame on paper. Holds short lines best.',
    textBox: clampX({
      x: FRAME.x + px(C * 0.07), y: FRAME.y + px(C * 0.10),
      w: FRAME.w - px(C * 0.14), h: FRAME.h - px(C * 0.18),
    }),
    textStyle: { weight: 500, tracking: -0.02, lineHeight: 1.02, maxFontSize: 86, minFontSize: 26 },
    textFill: P.ink,
    lockup: { variant: 'color', align: 'left' },
    behind: () => {
      const { x, y, w, h, stroke } = FRAME;
      return `
        <rect width="${C}" height="${C}" fill="${P.paper}"/>
        <rect x="${px(x + stroke / 2)}" y="${px(y + stroke / 2)}" width="${px(w - stroke)}" height="${px(h - stroke)}"
              fill="none" stroke="${P.ink}" stroke-width="${stroke}"/>`;
    },
    above: () => eyebrow('SHIP IT', {
      x: FRAME.x, y: px(FRAME.y + C * 0.04), w: FRAME.w, h: EYEBROW_H,
    }, { fill: P.ink, align: 'center', tracking: 0.12 }),
  },

  {
    id: 'ticket',
    name: 'Ticket',
    description: 'Hairline rules on paper. Quietest of the six.',
    textBox: clampX({
      x: SAFE.x + px(C * 0.03), y: px(C * 0.20),
      w: SAFE.w - px(C * 0.06), h: px(C * 0.50),
    }),
    textStyle: { weight: 500, tracking: -0.02, lineHeight: 1.1, maxFontSize: 92, minFontSize: 32 },
    textFill: P.ink,
    lockup: { variant: 'color', align: 'left' },
    behind: () => `
      <defs>${spectrumDef('ticket-spectrum')}</defs>
      <rect width="${C}" height="${C}" fill="${P.paper}"/>
      <rect x="${SAFE.x}" y="${SAFE_INSET}" width="${SAFE.w}" height="${SPECTRUM}" fill="url(#ticket-spectrum)"/>
      <path d="M ${SAFE.x} ${px(C * 0.175)} H ${px(C - SAFE.x)}" stroke="${HAIR_INK}" stroke-width="${HAIR}"/>
      <path d="M ${SAFE.x} ${px(C * 0.735)} H ${px(C - SAFE.x)}" stroke="${HAIR_INK}" stroke-width="${HAIR}"/>`,
    above: () => eyebrow('PRODUCTCON SF · SHIPPED LIVE', {
      x: H_INSET, y: px(SAFE_INSET + SPECTRUM + C * 0.012), w: C - H_INSET * 2, h: EYEBROW_H,
    }, { fill: P.ink, align: 'left', tracking: 0.02 }),
  },

  {
    id: 'terminal',
    name: 'Terminal',
    description: 'Mono on ink. The one dark exception.',
    textBox: {
      x: TERM_TEXT_X, y: px(C * 0.20),
      w: px(C - H_INSET - TERM_TEXT_X), h: px(C * 0.50),
    },
    textStyle: {
      face: 'mono', weight: 500, tracking: -0.01, lineHeight: 1.25,
      maxFontSize: 64, minFontSize: 24, align: 'left', vAlign: 'top',
    },
    textFill: P.paper,
    lockup: { variant: 'dark', align: 'left' },
    behind: () => `
      <defs>${spectrumDef('term-spectrum')}</defs>
      <rect width="${C}" height="${C}" fill="${P.ink}"/>
      ${gridBg(P.paper, TERM_GRID_OPACITY, TERM_GRID_STROKE)}
      <rect x="0" y="0" width="${C}" height="${px(SAFE_INSET + SPECTRUM)}" fill="url(#term-spectrum)"/>
      ${eyebrow('>', { x: H_INSET, y: px(C * 0.205), w: TERM_PROMPT_W, h: px(C * 0.055) },
                { fill: P.paper, align: 'left', tracking: 0, size: px(C * 0.055) })}`,
  },

  {
    id: 'ramp',
    name: 'Rule',
    description: 'Ink on paper, spectrum rule. The Foundations lockup.',
    textBox: (() => {
      const y = px(C * 0.135);
      const maxBottom = C - SAFE_INSET - LOCKUP.h - RULE_CLEAR;
      return clampX({ x: SAFE.x, y, w: SAFE.w, h: Math.min(px(C * 0.62), px(maxBottom - y)) });
    })(),
    textStyle: { weight: 500, tracking: -0.03, lineHeight: 1.02, maxFontSize: 116, minFontSize: 34 },
    textFill: P.ink,
    lockup: { variant: 'color', align: 'left' },
    behind: () => `
      <defs>${spectrumDef('rule-spectrum')}</defs>
      <rect width="${C}" height="${C}" fill="${P.paper}"/>
      <rect x="${SAFE.x}" y="${RULE_BAR_Y}" width="${SAFE.w}" height="${SPECTRUM}" fill="url(#rule-spectrum)"/>`,
    above: () => eyebrow('PRODUCTCON SF', {
      x: H_INSET, y: SAFE_INSET, w: C - H_INSET * 2, h: EYEBROW_H,
    }, { fill: P.ink, align: 'left', tracking: 0.08 }),
  },
];

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id);
export const getTemplate = (id) => TEMPLATES.find((t) => t.id === id);
export const templateFurniture = (t) => lockupSvg(t.lockup);
