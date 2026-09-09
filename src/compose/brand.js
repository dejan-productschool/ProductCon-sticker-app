// PLACEHOLDER BRAND VALUES.
//
// These are stand-ins so the build can proceed before the real assets land.
// Everything in this file must be replaced with Product School's actual palette
// and lockup before anything is printed in public. Nothing else in the codebase
// hardcodes a brand colour, so this is the only file that has to change.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CANVAS, SAFE_INSET } from './constants.js';
import { fitText, textToSvg } from './typeset.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCKUP_SVG_PATH = join(HERE, '../../assets/brand/lockup.svg');

export const PALETTE = {
  ink:     '#14141C',
  paper:   '#FFFFFF',
  brand:   '#E8443A',  // PLACEHOLDER
  brandDk: '#B22C24',  // PLACEHOLDER
  cream:   '#F6F1E7',
  sky:     '#2B6CF6',  // PLACEHOLDER
  mint:    '#16C79A',  // PLACEHOLDER
  sun:     '#FFC531',  // PLACEHOLDER
};

export const LOCKUP_WORDMARK = 'PRODUCT SCHOOL';

// Fixed slot. The lockup sits in the same place at the same size on all six
// templates, and no attendee input can reach it.
export const LOCKUP = {
  h: Math.round(CANVAS * 0.032),
  x: SAFE_INSET,
  bottom: SAFE_INSET,
};

/**
 * The lockup, as SVG.
 *
 * If a real assets/brand/lockup.svg exists it is scaled into the slot and used
 * verbatim. Until then we typeset the wordmark, so layouts can be judged at the
 * right visual weight.
 */
export function lockupSvg({ fill = PALETTE.ink, align = 'left' } = {}) {
  if (existsSync(LOCKUP_SVG_PATH)) {
    const raw = readFileSync(LOCKUP_SVG_PATH, 'utf8');
    const viewBox = raw.match(/viewBox="([^"]+)"/)?.[1];
    const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    if (viewBox) {
      const [, , vbW, vbH] = viewBox.trim().split(/[\s,]+/).map(Number);
      const scale = LOCKUP.h / vbH;
      const w = vbW * scale;
      const x = align === 'right' ? CANVAS - SAFE_INSET - w : LOCKUP.x;
      const y = CANVAS - LOCKUP.bottom - LOCKUP.h;
      return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(6)})">${inner}</g>`;
    }
  }

  const box = {
    x: align === 'right' ? CANVAS / 2 : LOCKUP.x,
    y: CANVAS - LOCKUP.bottom - LOCKUP.h,
    w: CANVAS / 2 - SAFE_INSET,
    h: LOCKUP.h,
  };
  const fitted = fitText(LOCKUP_WORDMARK, box, {
    weight: 700,
    tracking: 0.14,
    maxFontSize: LOCKUP.h,
    minFontSize: 10,
    step: 1,
    align,
    vAlign: 'middle',
  });
  return textToSvg(fitted, { fill });
}

export const USING_PLACEHOLDER_LOCKUP = !existsSync(LOCKUP_SVG_PATH);
