// Rasterising a sticker for the printer.
//
// This is the only file that needs sharp, and the only place a PNG is made.
// It runs on the booth machine; the hosted app imports ./svg.js instead.

import sharp from 'sharp';
import { CANVAS, DPI } from './constants.js';
import { composeSvg, offerTemplates, TEMPLATE_IDS } from './svg.js';
import { sanitise } from './sanitise.js';

/**
 * Render a print-ready PNG.
 *
 * `text` is sanitised here even if the caller already did it - this is the last
 * gate before pixels, and it must never be possible to reach the renderer with
 * raw input.
 */
export async function compose(rawText, templateId, { skipSanitise = false } = {}) {
  const clean = skipSanitise
    ? { text: rawText, ok: true, reasons: [], dropped: [] }
    : sanitise(rawText);
  if (clean.text.length === 0) throw new Error('nothing to compose: empty text');

  const { svg, fitted, template } = composeSvg(clean.text, templateId);

  const png = await sharp(Buffer.from(svg))
    .resize(CANVAS, CANVAS, { fit: 'fill' })
    .png({ compressionLevel: 9, palette: false })
    // pHYs at 313 dpi, so the print path can size the label physically rather
    // than guessing from pixel count.
    .withMetadata({ density: DPI })
    .toBuffer();

  return {
    png,
    meta: {
      text: clean.text,
      templateId: template.id,
      templateName: template.name,
      fits: fitted.fits,
      fontSize: fitted.fontSize,
      lines: fitted.lines,
      reasons: clean.reasons,
      dropped: clean.dropped,
      width: CANVAS,
      height: CANVAS,
      dpi: DPI,
    },
  };
}

export { composeSvg, offerTemplates, TEMPLATE_IDS };
