// Print service.
//
// Runs on the booth machine because the VC-500W is on USB. Everything here is
// local: no queue in the cloud, no dependency on the venue network.
//
// Windows is the target - Brother's tooling is Windows only - but macOS and a
// dry run are supported so the rest of the system can be built and rehearsed
// before the mini PC exists.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { STICKER_MM } from '../compose/constants.js';

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const PS1 = join(HERE, 'print-image.ps1');

/** dry | windows | macos - override with STICKER_PRINT_MODE. */
export function printMode() {
  const forced = process.env.STICKER_PRINT_MODE;
  if (forced) return forced;
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  return 'dry';
}

/**
 * Read at call time, never captured at import.
 *
 * As a module-level const this silently ignored anything that set
 * STICKER_PRINTER after the first import - which is exactly what `--printer`
 * does - and fell back to the system default without saying so.
 */
export const printerName = () => process.env.STICKER_PRINTER ?? '';

async function tempPng(png) {
  const dir = join(tmpdir(), 'ship-it-stickers');
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${randomUUID()}.png`);
  await writeFile(path, png);
  return path;
}

/** Printers the OS can see. Used by the spike and the health check. */
export async function listPrinters() {
  const mode = printMode();
  try {
    if (mode === 'windows') {
      const { stdout } = await run('powershell', [
        '-NoProfile', '-Command',
        '(Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name) -join "`n"',
      ]);
      return stdout.split('\n').map((s) => s.trim()).filter(Boolean);
    }
    if (mode === 'macos') {
      const { stdout } = await run('lpstat', ['-p']);
      return stdout.split('\n')
        .map((l) => l.match(/^printer (\S+)/)?.[1])
        .filter(Boolean);
    }
  } catch (err) {
    return [];
  }
  return [];
}

/**
 * Send one PNG to the printer at its true physical size.
 *
 * Resolves { ok, ms, mode, detail } and rejects only on a real failure, so the
 * caller can decide whether to retry. Nothing here retries on its own: a
 * silent retry at a booth means two stickers coming out for one person.
 */
export async function printSticker(png, {
  widthMm = STICKER_MM, heightMm = STICKER_MM, copies = 1, printer = printerName(),
} = {}) {
  const mode = printMode();
  const started = Date.now();
  const path = await tempPng(png);

  if (mode === 'dry') {
    // A dry run that returns instantly makes the queue look infinitely fast,
    // which hides exactly the behaviour a rehearsal is meant to test. Set
    // STICKER_DRY_MS to the real hand-to-hand time and the booth behaves like
    // the booth.
    const fake = Number(process.env.STICKER_DRY_MS ?? 0);
    if (fake > 0) await new Promise((r) => setTimeout(r, fake));
    return { ok: true, ms: Date.now() - started, mode, detail: `dry run (${fake}ms), wrote ${path}` };
  }

  // Say "there is no printer" rather than surfacing the driver's version of it.
  // On the day this message is read by a volunteer, not by whoever wrote this.
  const available = await listPrinters();
  if (available.length === 0) {
    throw new Error(
      'no printers are set up on this machine. Connect the VC-500W and add it in ' +
      (mode === 'windows' ? 'Settings > Bluetooth & devices > Printers & scanners' : 'System Settings > Printers & Scanners')
    );
  }
  if (printer && !available.includes(printer)) {
    throw new Error(`no printer named "${printer}". Available: ${available.join(', ')}`);
  }

  if (mode === 'windows') {
    const args = [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1,
      '-ImagePath', path,
      '-WidthMm', String(widthMm),
      '-HeightMm', String(heightMm),
      '-Copies', String(copies),
    ];
    if (printer) args.push('-PrinterName', printer);
    const { stdout, stderr } = await run('powershell', args, { timeout: 60_000 });
    return { ok: true, ms: Date.now() - started, mode, detail: (stdout || stderr).trim() };
  }

  // macOS, for building and rehearsing away from the booth machine.
  const args = ['-o', `media=Custom.${widthMm}x${heightMm}mm`, '-o', 'fit-to-page', '-n', String(copies)];
  if (printer) args.unshift('-d', printer);
  const { stdout } = await run('lp', [...args, path], { timeout: 60_000 });
  return { ok: true, ms: Date.now() - started, mode, detail: stdout.trim() };
}
