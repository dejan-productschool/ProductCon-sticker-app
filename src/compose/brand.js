// Product School brand.
//
// Colours come from two places, both checked rather than guessed:
//   1. app.productschool.dev  - the product surface. Brand blue #2758E2, deep
//      navy #07182C, off-white #FCFCFC.
//   2. The AIPMC 2026.1 module decks in ps-content-library - the ink ground and
//      the amber -> mauve -> violet -> blue accent ramp.
//
// The lockup in assets/brand/lockup.svg is Product School's own wordmark, taken
// from ps-content-studio and stripped of its baked-in fill so it can be
// recoloured per template.
//
// Type is Figtree + JetBrains Mono, the open pair the decks use. The real faces
// are saans / saansDisplay / antarcticanMono, which are licensed and not
// redistributable - see the note in typeset.js.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CANVAS, SAFE_INSET } from './constants.js';
import { fitText, textToSvg } from './typeset.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCKUP_SVG_PATH = join(HERE, '../../assets/brand/lockup.svg');

export const PALETTE = {
  // grounds
  ink:    '#0A0A0B',   // deck ground, near black
  navy:   '#07182C',   // the wordmark's own dark
  paper:  '#FCFCFC',   // the wordmark's own light
  cream:  '#F4F4F4',   // app surface grey

  // primary
  blue:   '#2758E2',   // brand blue, app
  blueDk: '#1A2B6B',   // deep blue, app

  // the deck's accent ramp, used sparingly
  violet: '#7B61E8',
  mauve:  '#C77BC0',
  amber:  '#F59A3F',
};

export const RAMP = [PALETTE.amber, PALETTE.mauve, PALETTE.violet, PALETTE.blue];

export const LOCKUP_WORDMARK = 'PRODUCT SCHOOL';

// Fixed slot. The lockup sits in the same place at the same size on all six
// templates, and no attendee input can reach it.
export const LOCKUP = {
  h: Math.round(CANVAS * 0.034),
  x: SAFE_INSET,
  bottom: SAFE_INSET,
};

const lockupFile = existsSync(LOCKUP_SVG_PATH) ? readFileSync(LOCKUP_SVG_PATH, 'utf8') : null;

/**
 * The lockup, as SVG, scaled into its slot and recoloured.
 *
 * The source file has had its fills stripped, so `fill` on the wrapping group
 * carries. Every template has a different ground and the mark has to sit on all
 * of them.
 */
export function lockupSvg({ fill = PALETTE.paper, align = 'left' } = {}) {
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
      weight: 700, tracking: 0.14, maxFontSize: LOCKUP.h, minFontSize: 10, step: 1,
      align, vAlign: 'middle',
    }),
    { fill }
  );
}

export const USING_PLACEHOLDER_LOCKUP = !lockupFile;
