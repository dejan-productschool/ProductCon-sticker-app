// Product School brand.
//
// White paper, a single near-black ink for the sticker type, and the spectrum
// used once. The lockups are the horizontal marks from brand.productschool.com,
// with their fills left as approved: Brand Blue Deep on the mark, ink or white
// on the wordmark. Do not recolour them.
//
// Type is Figtree + JetBrains Mono. The real faces are Saans / Antarctican
// Mono, which are licensed and not redistributable - see typeset.js.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CANVAS, SAFE_INSET } from './constants.js';
import { fitText, textToSvg } from './typeset.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BRAND_DIR = join(HERE, '../../assets/brand');

export const PALETTE = {
  ink:       '#0A0A0B',
  paper:     '#FFFFFF',
  paperTint: '#F6F6F7',
  // Brand Blue Deep. The mark, and the blue end of the spectrum.
  blue:      '#2758E2',
  // Next darker official blue (primary-300), for the cool gradient only.
  blueDeep:  '#1241B0',
  // Ink of the wordmark on the full-color lockup. Sticker type stays `ink`.
  wordmark:  '#262626',
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
  blueDk: '#1241B0',
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

// Approved lockups. `color` on light grounds, `dark` on dark grounds.
// Monochrome files are the fallbacks from the brand site; nothing in the six
// templates asks for them.
export const LOCKUP_FILES = {
  color: 'lockup-color.svg',
  dark: 'lockup-color-dark.svg',
  black: 'lockup-black.svg',
  white: 'lockup-white.svg',
};

function readLockup(name) {
  const path = join(BRAND_DIR, name);
  if (!existsSync(path)) return null;
  const svg = readFileSync(path, 'utf8');
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1];
  if (!viewBox) return null;
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const parts = viewBox.trim().split(/[\s,]+/).map(Number);
  const vbW = parts[2];
  const vbH = parts[3];
  if (!vbW || !vbH) return null;
  return { inner, vbW, vbH, file: name };
}

const lockups = Object.fromEntries(
  Object.entries(LOCKUP_FILES).map(([key, name]) => [key, readLockup(name)]),
);

const metricsSource = lockups.color || lockups.dark || lockups.black || lockups.white;

// Target height. The previous shield sat near 21px; this is the larger slot.
// The new lockup is wider, so 90px tall runs past the safe area on the right.
// Width is capped to the safe box and the height follows, same on every template.
const LOCKUP_TARGET_H = 90;

function lockupSlot(vbW, vbH) {
  const maxW = CANVAS - SAFE_INSET * 2;
  const aspect = vbW / vbH;
  let h = LOCKUP_TARGET_H;
  let w = h * aspect;
  if (w > maxW) {
    w = maxW;
    h = w / aspect;
  }
  h = Number(h.toFixed(2));
  w = Number((h * aspect).toFixed(2));
  return { h, w, x: SAFE_INSET, bottom: SAFE_INSET, targetH: LOCKUP_TARGET_H };
}

export const LOCKUP = metricsSource
  ? lockupSlot(metricsSource.vbW, metricsSource.vbH)
  : { h: LOCKUP_TARGET_H, w: CANVAS - SAFE_INSET * 2, x: SAFE_INSET, bottom: SAFE_INSET, targetH: LOCKUP_TARGET_H };

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
 * The lockup, scaled into its fixed slot.
 *
 * `variant` picks an approved file. Fills stay as drawn in the SVG: the brand
 * does not allow recolouring the lockup. Light templates use `color` (ink
 * wordmark, blue mark). Dark templates use `dark` (white wordmark, blue mark).
 */
export function lockupSvg({ variant = 'color', align = 'left', fill = PALETTE.ink } = {}) {
  const asset = lockups[variant] || lockups.color;
  if (asset) {
    const scale = LOCKUP.h / asset.vbH;
    const w = asset.vbW * scale;
    const x = align === 'right' ? CANVAS - SAFE_INSET - w : LOCKUP.x;
    const y = CANVAS - LOCKUP.bottom - LOCKUP.h;
    return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(6)})">${asset.inner}</g>`;
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

export const USING_PLACEHOLDER_LOCKUP = !lockups.color;
