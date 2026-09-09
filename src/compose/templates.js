// The six templates. Decided and final at run time: the attendee picks one of
// these, and nothing here is generated on the day.
//
// Each template declares where the attendee's line goes and paints everything
// around it. The lockup is added by the compositor afterwards, from a fixed
// slot no template may write into.

import { CANVAS as C, SAFE, SAFE_INSET } from './constants.js';
import { PALETTE as P, lockupSvg } from './brand.js';
import { fitText, textToSvg } from './typeset.js';

const px = (n) => Number(n.toFixed(2));

/** Small fixed label, typeset the same way as everything else. */
function label(text, box, { fill, weight = 700, tracking = 0.16, align = 'left', size }) {
  const fitted = fitText(text, box, {
    weight, tracking, align, vAlign: 'middle',
    maxFontSize: size ?? box.h, minFontSize: 8, step: 1,
  });
  return textToSvg(fitted, { fill });
}

// Room reserved at the bottom of every template for the lockup, so text never
// crowds it.
const LOCKUP_BAND = Math.round(C * 0.10);

const TEXT_AREA = {
  x: SAFE.x,
  y: SAFE.y,
  w: SAFE.w,
  h: SAFE.h - LOCKUP_BAND,
};

// Geometry shared between a template's artwork and its text box, so the two
// can never drift apart.
const BUBBLE = (() => {
  const stroke = px(C * 0.014);
  const tailH = px(C * 0.070);
  const x = SAFE_INSET;
  const y = SAFE_INSET;
  const w = C - SAFE_INSET * 2;
  // Bottom of the tail has to clear the lockup slot, not just the bubble.
  const h = px(C - SAFE_INSET - LOCKUP_BAND - tailH - SAFE_INSET * 0.4);
  return { x, y, w, h, stroke, tailH, tailX: px(x + w * 0.20), tailW: px(C * 0.085) };
})();

const ROUNDEL = (() => {
  const ring = px(C * 0.016);
  const r = px(C * 0.325);
  return { cx: C / 2, cy: px(C * 0.415), r, ring, inner: px(r - ring * 2.4) };
})();

export const TEMPLATES = [
  {
    id: 'block',
    name: 'Block',
    description: 'Solid brand field, oversized white caps. The loudest of the six.',
    textBox: TEXT_AREA,
    textStyle: { weight: 900, tracking: -0.015, lineHeight: 0.98, maxFontSize: 132, minFontSize: 40 },
    textFill: P.paper,
    lockup: { fill: P.paper, align: 'left' },
    behind: () => `<rect width="${C}" height="${C}" fill="${P.brand}"/>`,
  },

  {
    id: 'bubble',
    name: 'Bubble',
    description: 'Speech bubble on cream. Reads as something the attendee said.',
    textBox: {
      x: BUBBLE.x + px(C * 0.05),
      y: BUBBLE.y + px(C * 0.045),
      w: BUBBLE.w - px(C * 0.10),
      h: BUBBLE.h - px(C * 0.09),
    },
    textStyle: { weight: 800, tracking: -0.01, lineHeight: 1.06, maxFontSize: 104, minFontSize: 34 },
    textFill: P.ink,
    lockup: { fill: P.ink, align: 'left' },
    behind: () => {
      const { x, y, w, h, tailX, tailW, tailH, stroke } = BUBBLE;
      const base = y + h;
      return `
        <rect width="${C}" height="${C}" fill="${P.cream}"/>
        <g fill="${P.paper}" stroke="${P.ink}" stroke-width="${stroke}" stroke-linejoin="round">
          <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${px(C * 0.06)}"/>
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
    description: 'Circular badge on dark. Holds short lines best.',
    // The text box is the square inscribed in the inner ring, shrunk a little
    // more. Anything wider and long lines punch through the circle.
    textBox: {
      x: px(ROUNDEL.cx - ROUNDEL.inner * 0.68),
      y: px(ROUNDEL.cy - ROUNDEL.inner * 0.60),
      w: px(ROUNDEL.inner * 1.36),
      h: px(ROUNDEL.inner * 1.20),
    },
    textStyle: { weight: 850, tracking: -0.01, lineHeight: 1.0, maxFontSize: 78, minFontSize: 26 },
    textFill: P.sun,
    lockup: { fill: P.paper, align: 'left' },
    behind: () => {
      const { cx, cy, r, inner, ring } = ROUNDEL;
      return `
        <rect width="${C}" height="${C}" fill="${P.ink}"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${P.sun}" stroke-width="${ring}"/>
        <circle cx="${cx}" cy="${cy}" r="${inner}" fill="none" stroke="${P.sun}" stroke-width="${px(ring * 0.35)}" opacity="0.5"/>`;
    },
    above: () => label('SHIP IT', {
      x: SAFE.x, y: px(ROUNDEL.cy + ROUNDEL.r + C * 0.045), w: SAFE.w, h: px(C * 0.032),
    }, { fill: P.brand, align: 'center', tracking: 0.34 }),
  },

  {
    id: 'ticket',
    name: 'Ticket',
    description: 'Boarding-pass rules and a dashed edge. Quietest of the six.',
    textBox: {
      x: SAFE.x + px(C * 0.03),
      y: px(C * 0.20),
      w: SAFE.w - px(C * 0.06),
      h: px(C * 0.50),
    },
    textStyle: { weight: 750, tracking: -0.005, lineHeight: 1.1, maxFontSize: 92, minFontSize: 32 },
    textFill: P.ink,
    lockup: { fill: P.brandDk, align: 'left' },
    behind: () => {
      const inset = px(C * 0.035);
      const rule = px(C * 0.006);
      return `
        <rect width="${C}" height="${C}" fill="${P.cream}"/>
        <rect x="${inset}" y="${inset}" width="${px(C - inset * 2)}" height="${px(C - inset * 2)}"
              fill="none" stroke="${P.ink}" stroke-width="${rule}"
              stroke-dasharray="${px(C * 0.022)} ${px(C * 0.018)}" opacity="0.5"/>
        <path d="M ${SAFE.x} ${px(C * 0.175)} H ${px(C - SAFE.x)}" stroke="${P.ink}" stroke-width="${rule}"/>
        <path d="M ${SAFE.x} ${px(C * 0.735)} H ${px(C - SAFE.x)}" stroke="${P.ink}" stroke-width="${rule}"/>`;
    },
    above: () => label('PRODUCTCON SF · SHIPPED LIVE', {
      x: SAFE.x, y: px(C * 0.115), w: SAFE.w, h: px(C * 0.032),
    }, { fill: P.brandDk, align: 'left', tracking: 0.2 }),
  },

  {
    id: 'terminal',
    name: 'Terminal',
    description: 'Prompt on near-black. Left aligned, engineering register.',
    textBox: {
      x: px(C * 0.155),
      y: px(C * 0.17),
      w: px(C - C * 0.155 - SAFE_INSET),
      h: px(C * 0.54),
    },
    textStyle: {
      weight: 700, tracking: 0.005, lineHeight: 1.18,
      maxFontSize: 80, minFontSize: 28, align: 'left', vAlign: 'top',
    },
    textFill: P.mint,
    lockup: { fill: P.mint, align: 'left' },
    behind: () => `
      <rect width="${C}" height="${C}" fill="#0B0D10"/>
      <rect x="0" y="0" width="${C}" height="${px(C * 0.085)}" fill="#16191F"/>
      <g fill="#3A414D">
        <circle cx="${px(C * 0.055)}" cy="${px(C * 0.0425)}" r="${px(C * 0.0135)}"/>
        <circle cx="${px(C * 0.105)}" cy="${px(C * 0.0425)}" r="${px(C * 0.0135)}"/>
        <circle cx="${px(C * 0.155)}" cy="${px(C * 0.0425)}" r="${px(C * 0.0135)}"/>
      </g>
      ${label('>', { x: SAFE.x, y: px(C * 0.17), w: px(C * 0.10), h: px(C * 0.10) },
              { fill: P.brand, align: 'left', tracking: 0, weight: 800, size: px(C * 0.10) })}`,
  },

  {
    id: 'rays',
    name: 'Rays',
    description: 'Diagonal stripes behind a white panel. Best for medium lines.',
    textBox: {
      x: px(C * 0.115),
      y: px(C * 0.175),
      w: px(C * 0.77),
      h: px(C * 0.46),
    },
    textStyle: { weight: 850, tracking: -0.012, lineHeight: 1.03, maxFontSize: 100, minFontSize: 32 },
    textFill: P.ink,
    lockup: { fill: P.paper, align: 'left' },
    behind: () => {
      const stripes = [];
      const w = px(C * 0.075);
      for (let i = -C; i < C * 2; i += w * 2) {
        stripes.push(`<path d="M ${px(i)} 0 L ${px(i + C)} ${C} L ${px(i + C + w)} ${C} L ${px(i + w)} 0 Z" fill="${P.brand}"/>`);
      }
      return `
        <rect width="${C}" height="${C}" fill="${P.sun}"/>
        <g opacity="0.9">${stripes.join('')}</g>
        <rect x="${px(C * 0.085)}" y="${px(C * 0.145)}" width="${px(C * 0.83)}" height="${px(C * 0.52)}"
              rx="${px(C * 0.025)}" fill="${P.paper}"/>`;
    },
  },
];

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id);
export const getTemplate = (id) => TEMPLATES.find((t) => t.id === id);

/** Lockup markup for a template, from the fixed slot. */
export const templateLockup = (t) => lockupSvg(t.lockup);
