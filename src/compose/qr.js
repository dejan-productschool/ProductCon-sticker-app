// The QR code in the sticker's bottom-right corner.
//
// Two physical constraints drive everything here:
//
// 1. Module size. A phone needs roughly 0.33 mm per module to scan reliably at
//    arm's length. On an 11 mm tile that is about 33 modules including the
//    quiet zone, which is a version 2 code - roughly 25 characters of URL.
//    A longer URL forces a denser code and the modules shrink below what will
//    scan. Keep the URL short; this file warns when it is not.
//
// 2. Contrast. Always dark modules on a light tile, even on the dark
//    templates. Inverted QR codes scan on some phones and not others, and a
//    booth is the wrong place to find out which.

import QRCode from 'qrcode';
import { mmToPx, MM_PER_INCH, DPI } from './constants.js';

export const QR_MM = 11;                 // the printed tile, including quiet zone
export const QR_PX = mmToPx(QR_MM);
export const MIN_MODULE_MM = 0.33;       // below this, scanning gets unreliable
const QUIET = 2;                         // modules of margin inside the tile

const cache = new Map();

/** Module size in mm for a given payload, so callers can judge it before printing. */
export function moduleMm(url) {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: 'M' });
  return QR_MM / (modules.size + QUIET * 2);
}

export function qrInfo(url) {
  const { modules, version } = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const mm = QR_MM / (modules.size + QUIET * 2);
  return {
    url,
    version,
    size: modules.size,
    moduleMm: mm,
    dots: (mm / MM_PER_INCH) * DPI,
    scannable: mm >= MIN_MODULE_MM,
  };
}

/**
 * The QR as SVG, laid into a box.
 *
 * Modules are emitted as one path rather than hundreds of rects - librsvg is
 * markedly faster with it, and this runs on every compose.
 */
export function qrSvg(url, { x, y, size = QR_PX, dark = '#000', light = '#FFF', radius = 6 } = {}) {
  const key = `${url}|${size}|${dark}|${light}|${radius}|${x}|${y}`;
  if (cache.has(key)) return cache.get(key);

  const { modules } = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const n = modules.size;
  const total = n + QUIET * 2;
  const unit = size / total;

  let d = '';
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (!modules.data[row * n + col]) continue;
      const mx = x + (col + QUIET) * unit;
      const my = y + (row + QUIET) * unit;
      // Half a unit of overlap, so neighbouring modules meet cleanly rather
      // than leaving hairlines the printer will smear.
      d += `M${mx.toFixed(2)} ${my.toFixed(2)}h${(unit + 0.35).toFixed(2)}v${(unit + 0.35).toFixed(2)}h-${(unit + 0.35).toFixed(2)}z`;
    }
  }

  const svg = `<g>
    <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" fill="${light}"/>
    <path d="${d}" fill="${dark}" shape-rendering="crispEdges"/>
  </g>`;

  cache.set(key, svg);
  return svg;
}
