// SQLite store. The booth machine's own copy, and what local development uses.
//
// node:sqlite is synchronous, which is exactly what the queue wants: the
// capacity check and the insert cannot be interleaved by another request.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const DATA_DIR = process.env.STICKER_DATA_DIR ?? join(ROOT, 'data');
mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(join(DATA_DIR, 'stickers.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS stickers (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    text         TEXT    NOT NULL,
    template_id  TEXT    NOT NULL,
    status       TEXT    NOT NULL DEFAULT 'pending',
    flagged      INTEGER NOT NULL DEFAULT 0,
    reasons      TEXT    NOT NULL DEFAULT '',
    answers      TEXT    NOT NULL DEFAULT '{}',
    device_id    TEXT    NOT NULL DEFAULT '',
    request_id   TEXT    NOT NULL DEFAULT '',
    attempts     INTEGER NOT NULL DEFAULT 0,
    last_error   TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    decided_at   TEXT,
    printed_at   TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_status ON stickers(status, id);
  CREATE INDEX IF NOT EXISTS idx_printed ON stickers(printed_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_request ON stickers(request_id) WHERE request_id <> '';
  CREATE INDEX IF NOT EXISTS idx_device ON stickers(device_id, id);
`);

// Older booth databases predate some columns. Adding them beats making anyone
// throw away a day's stickers.
const columns = db.prepare(`PRAGMA table_info(stickers)`).all().map((c) => c.name);
for (const [name, ddl] of [
  ['answers', `ALTER TABLE stickers ADD COLUMN answers TEXT NOT NULL DEFAULT '{}'`],
  ['device_id', `ALTER TABLE stickers ADD COLUMN device_id TEXT NOT NULL DEFAULT ''`],
  ['request_id', `ALTER TABLE stickers ADD COLUMN request_id TEXT NOT NULL DEFAULT ''`],
]) {
  if (!columns.includes(name)) db.exec(ddl);
}

const WAITING = `('pending','approved','printing','failed')`;
const q = (sql) => db.prepare(sql);

const s = {
  insertIfRoom: q(`INSERT INTO stickers (text, template_id, flagged, reasons, answers, device_id, request_id, status)
                   SELECT ?, ?, ?, ?, ?, ?, ?, ?
                   WHERE (SELECT COUNT(*) FROM stickers WHERE status IN ${WAITING}) < ?`),
  byRequest: q(`SELECT * FROM stickers WHERE request_id = ?`),
  byId: q(`SELECT * FROM stickers WHERE id = ?`),
  waiting: q(`SELECT COUNT(*) AS n FROM stickers WHERE status IN ${WAITING}`),
  aheadOf: q(`SELECT COUNT(*) AS n FROM stickers WHERE status IN ${WAITING} AND id < ?`),
  liveForDevice: q(`SELECT id FROM stickers WHERE device_id = ? AND status IN ${WAITING} ORDER BY id DESC LIMIT 1`),
  lastForDevice: q(`SELECT id, printed_at FROM stickers WHERE device_id = ? AND status = 'printed' ORDER BY id DESC LIMIT 1`),
  pending: q(`SELECT id, text, template_id, flagged, reasons, status, last_error, created_at
              FROM stickers WHERE status IN ('pending','failed') ORDER BY id ASC`),
  inFlight: q(`SELECT id, text, template_id, status, attempts, last_error
               FROM stickers WHERE status IN ('approved','printing') ORDER BY id ASC`),
  printed: q(`SELECT id, text, template_id, printed_at FROM stickers WHERE status = 'printed'
              ORDER BY printed_at DESC, id DESC LIMIT ?`),
  countPrinted: q(`SELECT COUNT(*) AS n FROM stickers WHERE status = 'printed'`),
  countBy: q(`SELECT status, COUNT(*) AS n FROM stickers GROUP BY status`),
  answersAll: q(`SELECT answers FROM stickers WHERE status = 'printed'`),
  claimNext: q(`UPDATE stickers SET status = 'printing', attempts = attempts + 1
                WHERE id = (SELECT id FROM stickers WHERE status = 'approved' ORDER BY id ASC LIMIT 1)
                RETURNING *`),
  setStatus: q(`UPDATE stickers SET status = ?, decided_at = datetime('now') WHERE id = ?`),
  markPrinted: q(`UPDATE stickers SET status = 'printed', printed_at = datetime('now'), last_error = NULL WHERE id = ?`),
  markFailed: q(`UPDATE stickers SET status = ?, last_error = ? WHERE id = ?`),
  requeueStuck: q(`UPDATE stickers SET status = 'approved' WHERE status = 'printing'`),
  lastId: q(`SELECT last_insert_rowid() AS id`),
};

export const kind = 'sqlite';

/**
 * Insert only if the queue has room, in one statement.
 *
 * The check and the insert must not be separable. Doing them as two steps let a
 * burst of simultaneous submissions all read the same depth and all decide
 * there was space.
 */
export async function insertIfRoom(row, maxDepth) {
  const res = s.insertIfRoom.run(
    row.text, row.templateId, row.flagged ? 1 : 0, row.reasons.join(','),
    JSON.stringify(row.answers ?? {}), row.deviceId, row.requestId, row.status, maxDepth
  );
  return res.changes ? Number(res.lastInsertRowid) : null;
}

export const getByRequest = async (id) => (id ? s.byRequest.get(id) : undefined);
export const getSticker = async (id) => s.byId.get(id);
export const waitingCount = async () => s.waiting.get().n;
export const positionOf = async (id) => s.aheadOf.get(id).n + 1;
export const liveTicketFor = async (d) => (d ? s.liveForDevice.get(d)?.id : undefined);
export const lastPrintedFor = async (d) => (d ? s.lastForDevice.get(d) : undefined);
export const listPending = async () => s.pending.all();
export const listInFlight = async () => s.inFlight.all();
export const listPrinted = async (limit = 200) => s.printed.all(limit);
export const printedCount = async () => s.countPrinted.get().n;
export const statusCounts = async () =>
  Object.fromEntries(s.countBy.all().map((r) => [r.status, r.n]));
export const allAnswers = async () => s.answersAll.all().map((r) => r.answers);
export const approve = async (id) => s.setStatus.run('approved', id).changes > 0;
export const reject = async (id) => s.setStatus.run('rejected', id).changes > 0;
export const claimNextPrintJob = async () => s.claimNext.get() ?? null;
export const markPrinted = async (id) => { s.markPrinted.run(id); };
export const markFailed = async (id, status, error) => { s.markFailed.run(status, error, id); };
export const recoverInterrupted = async () => s.requeueStuck.run().changes;
