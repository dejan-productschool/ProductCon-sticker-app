// SQLite, on the booth machine, in a file. No cloud database - the venue
// network is assumed to fail at some point on the day.
//
// Uses node:sqlite (built in from Node 22) rather than a native module, so
// standing this up on the Windows mini PC is `npm install` and nothing else.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DATA_DIR = process.env.STICKER_DATA_DIR ?? join(ROOT, 'data');
mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(join(DATA_DIR, 'stickers.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS stickers (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    text         TEXT    NOT NULL,
    template_id  TEXT    NOT NULL,
    png          BLOB    NOT NULL,
    -- pending -> approved -> printing -> printed
    --         -> rejected
    --                     -> failed (parked, needs a human)
    status       TEXT    NOT NULL DEFAULT 'pending',
    flagged      INTEGER NOT NULL DEFAULT 0,
    reasons      TEXT    NOT NULL DEFAULT '',
    attempts     INTEGER NOT NULL DEFAULT 0,
    last_error   TEXT,
    -- the survey answers behind this sticker, as JSON. Worth keeping: what a
    -- few hundred PMs say they are is a more interesting artifact than the
    -- stickers themselves.
    answers      TEXT    NOT NULL DEFAULT '{}',
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    decided_at   TEXT,
    printed_at   TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_status  ON stickers(status, id);
  CREATE INDEX IF NOT EXISTS idx_printed ON stickers(printed_at DESC);
`);

// Existing booth databases predate the survey. Add the column rather than
// making anyone throw away a day's stickers.
const columns = db.prepare(`PRAGMA table_info(stickers)`).all().map((c) => c.name);
if (!columns.includes('answers')) {
  db.exec(`ALTER TABLE stickers ADD COLUMN answers TEXT NOT NULL DEFAULT '{}'`);
}

const stmt = {
  insert: db.prepare(`INSERT INTO stickers (text, template_id, png, flagged, reasons, answers)
                      VALUES (?, ?, ?, ?, ?, ?)`),
  byId: db.prepare(`SELECT * FROM stickers WHERE id = ?`),
  pngById: db.prepare(`SELECT png FROM stickers WHERE id = ?`),
  answerTally: db.prepare(`SELECT answers FROM stickers WHERE status = 'printed'`),
  pending: db.prepare(`SELECT id, text, template_id, flagged, reasons, status, last_error, created_at
                       FROM stickers WHERE status IN ('pending','failed') ORDER BY id ASC`),
  inFlight: db.prepare(`SELECT id, text, template_id, status, attempts, last_error
                        FROM stickers WHERE status IN ('approved','printing') ORDER BY id ASC`),
  printed: db.prepare(`SELECT id, text, template_id, printed_at
                       FROM stickers WHERE status = 'printed' ORDER BY printed_at DESC, id DESC LIMIT ?`),
  countPrinted: db.prepare(`SELECT COUNT(*) AS n FROM stickers WHERE status = 'printed'`),
  countBy: db.prepare(`SELECT status, COUNT(*) AS n FROM stickers GROUP BY status`),
  claimNext: db.prepare(`SELECT * FROM stickers WHERE status = 'approved' ORDER BY id ASC LIMIT 1`),
  setStatus: db.prepare(`UPDATE stickers SET status = ?, decided_at = datetime('now') WHERE id = ?`),
  markPrinting: db.prepare(`UPDATE stickers SET status = 'printing', attempts = attempts + 1 WHERE id = ?`),
  markPrinted: db.prepare(`UPDATE stickers SET status = 'printed', printed_at = datetime('now'), last_error = NULL WHERE id = ?`),
  markFailed: db.prepare(`UPDATE stickers SET status = ?, last_error = ? WHERE id = ?`),
  requeueStuck: db.prepare(`UPDATE stickers SET status = 'approved' WHERE status = 'printing'`),
};

export const createSticker = ({ text, templateId, png, flagged, reasons, answers = {} }) =>
  Number(stmt.insert.run(
    text, templateId, png, flagged ? 1 : 0, reasons.join(','), JSON.stringify(answers)
  ).lastInsertRowid);

/** How the room answered, counted. Feeds the wall. */
export const answerTally = () => {
  const tally = {};
  for (const row of stmt.answerTally.all()) {
    let parsed;
    try { parsed = JSON.parse(row.answers); } catch { continue; }
    for (const [question, value] of Object.entries(parsed ?? {})) {
      if (!value) continue;
      tally[question] ??= {};
      tally[question][value] = (tally[question][value] ?? 0) + 1;
    }
  }
  return tally;
};

export const getSticker = (id) => stmt.byId.get(id);
export const getPng = (id) => stmt.pngById.get(id)?.png;
export const listPending = () => stmt.pending.all();
export const listInFlight = () => stmt.inFlight.all();
export const listPrinted = (limit = 200) => stmt.printed.all(limit);
export const printedCount = () => stmt.countPrinted.get().n;
export const statusCounts = () =>
  Object.fromEntries(stmt.countBy.all().map((r) => [r.status, r.n]));

export const approve = (id) => stmt.setStatus.run('approved', id).changes > 0;
export const reject = (id) => stmt.setStatus.run('rejected', id).changes > 0;

export const claimNextPrintJob = () => {
  const job = stmt.claimNext.get();
  if (!job) return null;
  stmt.markPrinting.run(job.id);
  return job;
};
export const markPrinted = (id) => stmt.markPrinted.run(id);
export const markFailed = (id, status, error) => stmt.markFailed.run(status, error, id);

/**
 * Anything left mid-print when the process died goes back on the queue.
 * A sticker somebody is standing there waiting for must never be lost quietly,
 * and the volunteer can reject a duplicate far more easily than chase a ghost.
 */
export const recoverInterrupted = () => stmt.requeueStuck.run().changes;
