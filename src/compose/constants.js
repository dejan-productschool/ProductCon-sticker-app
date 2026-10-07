import { capRatio } from './typeset.js';

// Every number here is derived from the Brother VC-500W spec sheet.
// Change DPI or STICKER_MM and the whole system follows. Nothing downstream
// should hardcode 616.

export const DPI = 313;              // VC-500W native resolution, 313 x 313
export const MM_PER_INCH = 25.4;
export const PRINT_SPEED_MM_S = 8;   // used only for time estimates

export const STICKER_MM = 50;        // 50 mm roll, square sticker
export const MAX_PRINT_WIDTH_MM = 50; // hard ceiling on the VC-500W

export const mmToPx = (mm) => Math.round((mm / MM_PER_INCH) * DPI);

export const CANVAS = mmToPx(STICKER_MM); // 616

// ZINK edge registration drifts a little roll to roll. Artwork bleeds to the
// edge, but nothing that carries meaning may sit outside this box. Shapes
// (cards, frames, spectrum bars) stay on this line and may bleed. Headlines,
// eyebrows, and the lockup use H_INSET, which is wider on the horizontal.
export const SAFE_INSET = Math.round(CANVAS * 0.06); // 37 px, 3.0 mm
export const SAFE = {
  x: SAFE_INSET,
  y: SAFE_INSET,
  w: CANVAS - SAFE_INSET * 2,
  h: CANVAS - SAFE_INSET * 2,
};

// Horizontal print band, both sides, for headlines, eyebrows, and the lockup.
//
// Calibration sticker, same booth path (616 px PNG, 313 dpi, lp fit-to-page
// on 50x50 mm): the 2 px border prints on the top and the bottom, so there
// is no vertical loss and the scale is 1:1. On the left and the right the
// border is gone and the first stripe still visible is the 1 to 2 mm stripe,
// about 1.5 mm lost per side. Content keeps the usual 3 mm past that loss.
// The 10 mm insets were a guess; they shrank the headline away from the preview.
export const H_LOSS_MM = 1.5;
export const H_INSET = SAFE_INSET + mmToPx(H_LOSS_MM); // 55 px, 4.5 mm

// Legibility floor. A sticker is read at arm's length, so what matters is cap
// height in millimetres, not pixels. Below this the line stops reading as a
// statement and starts reading as small print.
export const CAP_RATIO = capRatio();   // read from the display face itself
export const MIN_CAP_MM = 2.5;
export const MIN_LEGIBLE_PX = Math.ceil((MIN_CAP_MM / CAP_RATIO) * (DPI / MM_PER_INCH));
export const pxToCapMm = (px) => (px * CAP_RATIO * MM_PER_INCH) / DPI;

// About 6.25 s of head movement for a 50 mm label, before cut and handling.
export const PRINT_SECONDS = STICKER_MM / PRINT_SPEED_MM_S;

if (CANVAS !== 616) {
  console.warn(`[constants] canvas is ${CANVAS}px, spec assumed 616px`);
}
