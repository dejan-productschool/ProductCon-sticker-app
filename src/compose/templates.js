// The six templates. Decided and final at run time: the attendee picks one of
// these, and nothing here is generated on the day.
//
// Product School Foundations: white paper, ink type, square corners, the
// spectrum used once. Display is Figtree Medium; eyebrows and Terminal use
// JetBrains Mono. Template ids stay put so a queued sticker still renders.
//
// The lockup is added by the compositor afterwards, from a fixed slot no
// template may write into.

import { CANVAS as C, SAFE, SAFE_INSET } from './constants.js';
import { PALETTE as P, spectrumDef, warmDef, lockupSvg } from './brand.js';
import { fitText, textToSvg } from './typeset.js';

const px = (n) => Number(n.toFixed(2));

/** Small fixed label. Mono, tracked out. */
function eyebrow(text, box, { fill, align = 'left', tracking = 0.2, size } = {}) {
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

// Hairline and the spectrum rule, scaled so they still read on 50 mm ZINK.
const HAIR = Math.max(1, Math.round(C * 0.0025));
const RULE = Math.max(4, Math.round(C * 0.013));

const FRAME = (() => {
  const inset = SAFE_INSET;
  const stroke = px(C * 0.008);
  const y = inset;
  const h = px(C - inset - LOCKUP_BAND - inset * 0.35);
  return { x: inset, y, w: C - inset * 2, h, stroke };
})();

const CARD = (() => {
  const inset = SAFE_INSET;
  const y = inset;
  const h = px(C - inset - LOCKUP_BAND - inset * 0.35);
  return { x: inset, y, w: C - inset * 2, h };
})();

/** The faint graph paper, ink at 12%. */
const gridBg = (stroke = P.ink, opacity = 0.12) => {
  const step = px(C / 7);
  const lines = [];
  for (let i = step; i < C; i += step) {
    lines.push(`<path d="M ${px(i)} 0 V ${C}"/><path d="M 0 ${px(i)} H ${C}"/>`);
  }
  return `<g stroke="${stroke}" stroke-width="1" opacity="${opacity}">${lines.join('')}</g>`;
};

export const TEMPLATES = [
  {
    id: 'block',
    name: 'Block',
    description: 'Warm gradient field, oversized ink type. The loudest of the six.',
    textBox: TEXT_AREA,
    textStyle: { weight: 500, tracking: -0.03, lineHeight: 1.0, maxFontSize: 132, minFontSize: 40 },
    textFill: P.ink,
    lockup: { fill: P.ink, align: 'left' },
    behind: () => `
      <defs>${warmDef('block-warm')}</defs>
      <rect width="${C}" height="${C}" fill="url(#block-warm)"/>`,
  },

  {
    id: 'bubble',
    name: 'Card',
    description: 'Hairline card on paper, spectrum edge. Reads as something said.',
    textBox: {
      x: CARD.x + px(C * 0.05), y: CARD.y + px(C * 0.045),
      w: CARD.w - px(C * 0.10), h: CARD.h - px(C * 0.09) - RULE,
    },
    textStyle: { weight: 500, tracking: -0.02, lineHeight: 1.08, maxFontSize: 104, minFontSize: 34 },
    textFill: P.ink,
    lockup: { fill: P.ink, align: 'left' },
    behind: () => {
      const { x, y, w, h } = CARD;
      return `
        <defs>${spectrumDef('card-spectrum')}</defs>
        <rect width="${C}" height="${C}" fill="${P.paper}"/>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${P.paper}" stroke="${P.ink28}" stroke-width="${HAIR}"/>
        <rect x="${x}" y="${px(y + h - RULE)}" width="${w}" height="${RULE}" fill="url(#card-spectrum)"/>`;
    },
  },

  {
    id: 'roundel',
    name: 'Frame',
    description: 'Square ink frame on paper. Holds short lines best.',
    textBox: {
      x: FRAME.x + px(C * 0.07), y: FRAME.y + px(C * 0.10),
      w: FRAME.w - px(C * 0.14), h: FRAME.h - px(C * 0.18),
    },
    textStyle: { weight: 500, tracking: -0.02, lineHeight: 1.02, maxFontSize: 86, minFontSize: 26 },
    textFill: P.ink,
    lockup: { fill: P.ink, align: 'left' },
    behind: () => {
      const { x, y, w, h, stroke } = FRAME;
      return `
        <rect width="${C}" height="${C}" fill="${P.paper}"/>
        <rect x="${px(x + stroke / 2)}" y="${px(y + stroke / 2)}" width="${px(w - stroke)}" height="${px(h - stroke)}"
              fill="none" stroke="${P.ink}" stroke-width="${stroke}"/>`;
    },
    above: () => eyebrow('SHIP IT', {
      x: FRAME.x, y: px(FRAME.y + C * 0.028), w: FRAME.w, h: px(C * 0.026),
    }, { fill: P.ink60, align: 'center', tracking: 0.24 }),
  },

  {
    id: 'ticket',
    name: 'Ticket',
    description: 'Hairline rules on paper. Quietest of the six.',
    textBox: {
      x: SAFE.x + px(C * 0.03), y: px(C * 0.20),
      w: SAFE.w - px(C * 0.06), h: px(C * 0.50),
    },
    textStyle: { weight: 500, tracking: -0.02, lineHeight: 1.1, maxFontSize: 92, minFontSize: 32 },
    textFill: P.ink,
    lockup: { fill: P.ink, align: 'left' },
    behind: () => `
      <defs>${spectrumDef('ticket-spectrum')}</defs>
      <rect width="${C}" height="${C}" fill="${P.paper}"/>
      <rect x="0" y="0" width="${C}" height="${RULE}" fill="url(#ticket-spectrum)"/>
      <path d="M ${SAFE.x} ${px(C * 0.175)} H ${px(C - SAFE.x)}" stroke="${P.ink28}" stroke-width="${HAIR}"/>
      <path d="M ${SAFE.x} ${px(C * 0.735)} H ${px(C - SAFE.x)}" stroke="${P.ink28}" stroke-width="${HAIR}"/>`,
    above: () => eyebrow('PRODUCTCON SF · SHIPPED LIVE', {
      x: SAFE.x, y: px(C * 0.118), w: SAFE.w, h: px(C * 0.028),
    }, { fill: P.ink60, align: 'left', tracking: 0.16 }),
  },

  {
    id: 'terminal',
    name: 'Terminal',
    description: 'Mono on ink. The one dark exception.',
    textBox: {
      x: px(C * 0.155), y: px(C * 0.20),
      w: px(C - C * 0.155 - SAFE_INSET), h: px(C * 0.50),
    },
    textStyle: {
      face: 'mono', weight: 500, tracking: -0.01, lineHeight: 1.25,
      maxFontSize: 64, minFontSize: 24, align: 'left', vAlign: 'top',
    },
    textFill: P.paper,
    lockup: { fill: P.paper, align: 'left' },
    behind: () => `
      <defs>${spectrumDef('term-spectrum')}</defs>
      <rect width="${C}" height="${C}" fill="${P.ink}"/>
      ${gridBg(P.paper, 0.12)}
      <rect x="0" y="0" width="${C}" height="${RULE}" fill="url(#term-spectrum)"/>
      ${eyebrow('>', { x: SAFE.x, y: px(C * 0.205), w: px(C * 0.09), h: px(C * 0.055) },
                { fill: P.paper, align: 'left', tracking: 0, size: px(C * 0.055) })}`,
  },

  {
    id: 'ramp',
    name: 'Rule',
    description: 'Ink on paper, spectrum rule. The Foundations lockup.',
    textBox: {
      x: SAFE.x, y: px(C * 0.135),
      w: SAFE.w, h: px(C * 0.62),
    },
    textStyle: { weight: 500, tracking: -0.03, lineHeight: 1.02, maxFontSize: 116, minFontSize: 34 },
    textFill: P.ink,
    lockup: { fill: P.ink, align: 'left' },
    behind: () => `
      <defs>${spectrumDef('rule-spectrum')}</defs>
      <rect width="${C}" height="${C}" fill="${P.paper}"/>
      <rect x="0" y="${px(C * 0.955)}" width="${C}" height="${px(C * 0.045)}" fill="url(#rule-spectrum)"/>`,
    above: () => eyebrow('PRODUCTCON SF', {
      x: SAFE.x, y: px(C * 0.075), w: SAFE.w, h: px(C * 0.028),
    }, { fill: P.ink45, align: 'left', tracking: 0.24 }),
  },
];

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id);
export const getTemplate = (id) => TEMPLATES.find((t) => t.id === id);
export const templateFurniture = (t) => lockupSvg(t.lockup);
