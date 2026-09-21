// Product School brand, from Product School Foundations.
//
// White paper, a single near-black ink, and the spectrum used once. Not the
// legacy navy decks, and not the product-app blue.
//
// The lockup in assets/brand/lockup.svg is Product School's own wordmark,
// stripped of its baked-in fill so it can be recoloured per template.
//
// Type is Figtree + JetBrains Mono. The real faces are Saans / Antarctican
// Mono, which are licensed and not redistributable - see typeset.js.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CANVAS, SAFE_INSET } from './constants.js';
import { fitText, textToSvg } from './typeset.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCKUP_SVG_PATH = join(HERE, '../../assets/brand/lockup.svg');

export const PALETTE = {
  ink:       '#0A0A0B',
  paper:     '#FFFFFF',
  paperTint: '#F6F6F7',
  blue:      '#2B54E8',
  blueDeep:  '#4048DC',
  violet:    '#7B61E8',
  magenta:   '#C77BC0',
  coral:     '#E27A6C',
  orange:    '#F59A3F',
  orangeInk: '#E07B1E',
  ink80:     'rgba(10,10,11,0.78)',
  ink60:     'rgba(10,10,11,0.60)',
  ink45:     'rgba(10,10,11,0.45)',
  ink28:     'rgba(10,10,11,0.28)',
  ink12:     'rgba(10,10,11,0.12)',

  // Aliases kept for the print spike and older notes.
  navy:   '#0A0A0B',
  cream:  '#F6F6F7',
  mauve:  '#C77BC0',
  amber:  '#F59A3F',
  blueDk: '#4048DC',
};

export const RAMP = [PALETTE.orange, PALETTE.magenta, PALETTE.violet, PALETTE.blue];
export const COOL = [
  { offset: 0, color: PALETTE.blue },
  { offset: 0.55, color: PALETTE.blueDeep },
  { offset: 1, color: PALETTE.violet },
];
export const WARM = [
  { offset: 0, color: PALETTE.orange },
  { offset: 0.34, color: PALETTE.coral },
  { offset: 0.62, color: PALETTE.magenta },
  { offset: 1, color: PALETTE.violet },
];

export const LOCKUP_WORDMARK = 'PRODUCT SCHOOL';

// Fixed slot. The lockup sits in the same place at the same size on all six
// templates, and no attendee input can reach it.
export const LOCKUP = {
  h: Math.round(CANVAS * 0.034),
  x: SAFE_INSET,
  bottom: SAFE_INSET,
};

const lockupFile = existsSync(LOCKUP_SVG_PATH) ? readFileSync(LOCKUP_SVG_PATH, 'utf8') : null;

function stops(stops) {
  return stops.map((s, i, a) => {
    const offset = typeof s === 'string' ? (i / (a.length - 1)).toFixed(3) : s.offset;
    const color = typeof s === 'string' ? s : s.color;
    return `<stop offset="${offset}" stop-color="${color}"/>`;
  }).join('');
}

/** Spectrum rule. Orange to blue, left to right. The brand signature. */
export function spectrumDef(id = 'spectrum') {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${stops(RAMP)}</linearGradient>`;
}

/** Cool fill. Blue to violet, for the one loud template. */
export function coolDef(id = 'cool') {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${stops(COOL)}</linearGradient>`;
}

/** Warm fill. Orange to violet, for a moment. */
export function warmDef(id = 'warm') {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0.45">${stops(WARM)}</linearGradient>`;
}

/**
 * The lockup, as SVG, scaled into its slot and recoloured.
 *
 * The source file has had its fills stripped, so `fill` on the wrapping group
 * carries. Every template has a different ground and the mark has to sit on all
 * of them.
 */
export function lockupSvg({ fill = PALETTE.ink, align = 'left' } = {}) {
  if (lockupFile) {
    const viewBox = lockupFile.match(/viewBox="([^"]+)"/)?.[1];
    if (viewBox) {
      const inner = lockupFile.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
      const [, , vbW, vbH] = viewBox.trim().split(/[\s,]+/).map(Number);
      const scale = LOCKUP.h / vbH;
      const w = vbW * scale;
      const x = align === 'right' ? CANVAS - SAFE_INSET - w : LOCKUP.x;
      const y = CANVAS - LOCKUP.bottom - LOCKUP.h;
      return `<g fill="${fill}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(6)})">${inner}</g>`;
    }
  }

  // Fallback only: typeset the words if the asset ever goes missing, so a
  // sticker is never printed with no mark at all.
  const box = {
    x: align === 'right' ? CANVAS / 2 : LOCKUP.x,
    y: CANVAS - LOCKUP.bottom - LOCKUP.h,
    w: CANVAS / 2 - SAFE_INSET,
    h: LOCKUP.h,
  };
  return textToSvg(
    fitText(LOCKUP_WORDMARK, box, {
      face: 'mono', weight: 500, tracking: 0.2, maxFontSize: LOCKUP.h, minFontSize: 10, step: 1,
      align, vAlign: 'middle',
    }),
    { fill }
  );
}

export const USING_PLACEHOLDER_LOCKUP = !lockupFile;
