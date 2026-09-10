// The six templates. Decided and final at run time: the attendee picks one of
// these, and nothing here is generated on the day.
//
// Built on the real Product School system - brand blue, the deep navy and
// off-white the wordmark itself uses, and the deck's amber -> mauve -> violet
// -> blue ramp. Display type is Figtree; eyebrows and the Terminal template use
// JetBrains Mono, the same split the module decks use.
//
// The lockup is added by the compositor afterwards, from a fixed slot no
// template may write into.

import { CANVAS as C, SAFE, SAFE_INSET } from './constants.js';
import { PALETTE as P, RAMP, lockupSvg } from './brand.js';
import { fitText, textToSvg } from './typeset.js';

const px = (n) => Number(n.toFixed(2));

/** Small fixed label. Mono, tracked out - the decks' eyebrow treatment. */
function eyebrow(text, box, { fill, align = 'left', tracking = 0.18, size } = {}) {
  return textToSvg(
    fitText(text, box, {
      face: 'mono', weight: 500, tracking, align, vAlign: 'middle',
      maxFontSize: size ?? box.h, minFontSize: 8, step: 1,
    }),
    { fill }
  );
}

// Room reserved at the bottom of every template for the lockup, so text never
// crowds it.
const LOCKUP_BAND = Math.round(C * 0.10);

const TEXT_AREA = { x: SAFE.x, y: SAFE.y, w: SAFE.w, h: SAFE.h - LOCKUP_BAND };

// Geometry shared between a template's artwork and its text box, so the two
// can never drift apart.
const BUBBLE = (() => {
  const stroke = px(C * 0.013);
  const tailH = px(C * 0.070);
  const x = SAFE_INSET, y = SAFE_INSET, w = C - SAFE_INSET * 2;
  const h = px(C - SAFE_INSET - LOCKUP_BAND - tailH - SAFE_INSET * 0.4);
  return { x, y, w, h, stroke, tailH, tailX: px(x + w * 0.20), tailW: px(C * 0.085) };
})();

const ROUNDEL = (() => {
  const ring = px(C * 0.015);
  const r = px(C * 0.325);
  const cy = px(C * 0.415);
  return { cx: C / 2, cy, r, ring, inner: px(r - ring * 2.4) };
})();

/** The deck's faint 88px graph paper, scaled to the sticker. */
const gridBg = (opacity = 0.05) => {
  const step = px(C / 7);
  const lines = [];
  for (let i = step; i < C; i += step) {
    lines.push(`<path d="M ${px(i)} 0 V ${C}"/><path d="M 0 ${px(i)} H ${C}"/>`);
  }
  return `<g stroke="${P.paper}" stroke-width="1" opacity="${opacity}">${lines.join('')}</g>`;
};

export const TEMPLATES = [
  {
    id: 'block',
    name: 'Block',
    description: 'Brand blue field, oversized white type. The loudest of the six.',
    textBox: TEXT_AREA,
    textStyle: { weight: 900, tracking: -0.015, lineHeight: 0.98, maxFontSize: 132, minFontSize: 40 },
    textFill: P.paper,
    lockup: { fill: P.paper, align: 'left' },
    behind: () => `<rect width="${C}" height="${C}" fill="${P.blue}"/>`,
  },

  {
    id: 'bubble',
    name: 'Bubble',
    description: 'Speech bubble on grey. Reads as something the attendee said.',
    textBox: {
      x: BUBBLE.x + px(C * 0.05), y: BUBBLE.y + px(C * 0.045),
      w: BUBBLE.w - px(C * 0.10), h: BUBBLE.h - px(C * 0.09),
    },
    textStyle: { weight: 800, tracking: -0.01, lineHeight: 1.06, maxFontSize: 104, minFontSize: 34 },
    textFill: P.navy,
    lockup: { fill: P.navy, align: 'left' },
    behind: () => {
      const { x, y, w, h, tailX, tailW, tailH, stroke } = BUBBLE;
      const base = y + h;
      return `
        <rect width="${C}" height="${C}" fill="${P.cream}"/>
        <g fill="${P.paper}" stroke="${P.navy}" stroke-width="${stroke}" stroke-linejoin="round">
          <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${px(C * 0.055)}"/>
          <path d="M ${tailX} ${px(base)} L ${px(tailX + tailW * 0.18)} ${px(base + tailH)} L ${px(tailX + tailW)} ${px(base)} Z"/>
        </g>
        <!-- erase the seam where the tail meets the bubble's bottom stroke -->
        <path d="M ${px(tailX + stroke * 0.9)} ${px(base)} H ${px(tailX + tailW - stroke * 0.9)}"
              stroke="${P.paper}" stroke-width="${px(stroke * 1.4)}" stroke-linecap="butt"/>`;
    },
  },

  {
    id: 'roundel',
    name: 'Roundel',
    description: 'Amber badge on navy. Holds short lines best.',
    textBox: {
      x: px(ROUNDEL.cx - ROUNDEL.inner * 0.68), y: px(ROUNDEL.cy - ROUNDEL.inner * 0.60),
      w: px(ROUNDEL.inner * 1.36), h: px(ROUNDEL.inner * 1.20),
    },
    textStyle: { weight: 850, tracking: -0.01, lineHeight: 1.0, maxFontSize: 78, minFontSize: 26 },
    textFill: P.amber,
    lockup: { fill: P.paper, align: 'left' },
    behind: () => {
      const { cx, cy, r, inner, ring } = ROUNDEL;
      return `
        <rect width="${C}" height="${C}" fill="${P.navy}"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${P.amber}" stroke-width="${ring}"/>
        <circle cx="${cx}" cy="${cy}" r="${inner}" fill="none" stroke="${P.amber}" stroke-width="${px(ring * 0.35)}" opacity="0.45"/>`;
    },
    above: () => eyebrow('SHIP IT', {
      x: SAFE.x, y: px(ROUNDEL.cy + ROUNDEL.r + C * 0.045), w: SAFE.w, h: px(C * 0.030),
    }, { fill: P.mauve, align: 'center', tracking: 0.36 }),
  },

  {
    id: 'ticket',
    name: 'Ticket',
    description: 'Hairline rules on off-white. Quietest of the six.',
    textBox: {
      x: SAFE.x + px(C * 0.03), y: px(C * 0.20),
      w: SAFE.w - px(C * 0.06), h: px(C * 0.50),
    },
    textStyle: { weight: 700, tracking: -0.005, lineHeight: 1.1, maxFontSize: 92, minFontSize: 32 },
    textFill: P.navy,
    lockup: { fill: P.navy, align: 'left' },
    behind: () => {
      const rule = px(C * 0.004);
      return `
        <rect width="${C}" height="${C}" fill="${P.paper}"/>
        <path d="M ${SAFE.x} ${px(C * 0.175)} H ${px(C - SAFE.x)}" stroke="${P.navy}" stroke-width="${rule}" opacity="0.28"/>
        <path d="M ${SAFE.x} ${px(C * 0.735)} H ${px(C - SAFE.x)}" stroke="${P.navy}" stroke-width="${rule}" opacity="0.28"/>
        <rect x="0" y="0" width="${C}" height="${px(C * 0.012)}" fill="${P.blue}"/>`;
    },
    above: () => eyebrow('PRODUCTCON SF / SHIPPED LIVE', {
      x: SAFE.x, y: px(C * 0.118), w: SAFE.w, h: px(C * 0.028),
    }, { fill: P.blue, align: 'left', tracking: 0.2 }),
  },

  {
    id: 'terminal',
    name: 'Terminal',
    description: 'Mono on ink, with the decks\' graph paper. Engineering register.',
    textBox: {
      x: px(C * 0.155), y: px(C * 0.20),
      w: px(C - C * 0.155 - SAFE_INSET), h: px(C * 0.50),
    },
    textStyle: {
      face: 'mono', weight: 600, tracking: -0.01, lineHeight: 1.25,
      maxFontSize: 64, minFontSize: 24, align: 'left', vAlign: 'top',
    },
    textFill: P.paper,
    lockup: { fill: P.paper, align: 'left' },
    behind: () => `
      <rect width="${C}" height="${C}" fill="${P.ink}"/>
      ${gridBg(0.06)}
      <rect x="0" y="0" width="${C}" height="${px(C * 0.075)}" fill="#16171C"/>
      <g fill="#3A414D">
        <circle cx="${px(C * 0.052)}" cy="${px(C * 0.0375)}" r="${px(C * 0.0125)}"/>
        <circle cx="${px(C * 0.098)}" cy="${px(C * 0.0375)}" r="${px(C * 0.0125)}"/>
        <circle cx="${px(C * 0.144)}" cy="${px(C * 0.0375)}" r="${px(C * 0.0125)}"/>
      </g>
      ${eyebrow('>', { x: SAFE.x, y: px(C * 0.205), w: px(C * 0.09), h: px(C * 0.055) },
                { fill: P.blue, align: 'left', tracking: 0, size: px(C * 0.055) })}`,
  },

  {
    id: 'ramp',
    name: 'Ramp',
    description: 'The amber to blue ramp on ink. The decks\' signature move.',
    textBox: {
      x: SAFE.x, y: px(C * 0.135),
      w: SAFE.w, h: px(C * 0.62),
    },
    textStyle: { weight: 850, tracking: -0.015, lineHeight: 1.02, maxFontSize: 116, minFontSize: 34 },
    textFill: P.paper,
    lockup: { fill: P.paper, align: 'left' },
    // The ramp is a full-bleed base band rather than a floating bar - it reads
    // as the ground the mark stands on, and leaves no dead strip beneath it.
    behind: () => `
      <defs>
        <linearGradient id="ramp" x1="0" y1="0" x2="1" y2="0">
          ${RAMP.map((c, i) => `<stop offset="${(i / (RAMP.length - 1)).toFixed(3)}" stop-color="${c}"/>`).join('')}
        </linearGradient>
      </defs>
      <rect width="${C}" height="${C}" fill="${P.ink}"/>
      ${gridBg(0.05)}
      <rect x="0" y="${px(C * 0.955)}" width="${C}" height="${px(C * 0.045)}" fill="url(#ramp)"/>`,
    above: () => eyebrow('PRODUCTCON SF', {
      x: SAFE.x, y: px(C * 0.075), w: SAFE.w, h: px(C * 0.028),
    }, { fill: P.mauve, align: 'left', tracking: 0.24 }),
  },
];

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id);
export const getTemplate = (id) => TEMPLATES.find((t) => t.id === id);
export const templateFurniture = (t) => lockupSvg(t.lockup);
