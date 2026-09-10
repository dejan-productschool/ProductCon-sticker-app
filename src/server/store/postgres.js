// Postgres store, for the hosted app.
//
// The booth's SQLite copy gets atomicity for free by being single-threaded.
// Here several serverless invocations run at once on different machines, so
// every guard has to live inside a single SQL statement. That is the whole
// reason `insertIfRoom` is written as one INSERT ... SELECT ... WHERE rather
// than a count followed by an insert.

import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 8_000,
  ssl: process.env.DATABASE_URL?.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
});

const WAITING = `('pending','approved','printing','failed')`;
const query = async (sql, params = []) => (await pool.query(sql, params)).rows;

let ready;
async function init() {
  ready ??= query(`
    CREATE TABLE IF NOT EXISTS stickers (
      id           SERIAL PRIMARY KEY,
      text         TEXT        NOT NULL,
      template_id  TEXT        NOT NULL,
      status       TEXT        NOT NULL DEFAULT 'pending',
      flagged      BOOLEAN     NOT NULL DEFAULT FALSE,
      reasons      TEXT        NOT NULL DEFAULT '',
      answers      JSONB       NOT NULL DEFAULT '{}'::jsonb,
      device_id    TEXT        NOT NULL DEFAULT '',
      request_id   TEXT        NOT NULL DEFAULT '',
      attempts     INTEGER     NOT NULL DEFAULT 0,
      last_error   TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      decided_at   TIMESTAMPTZ,
      printed_at   TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_status ON stickers(status, id);
    CREATE INDEX IF NOT EXISTS idx_printed ON stickers(printed_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_request ON stickers(request_id) WHERE request_id <> '';
    CREATE INDEX IF NOT EXISTS idx_device ON stickers(device_id, id);

    -- One row. Serverless invocations share no memory, so the booth agent's
    -- liveness has to live somewhere every one of them can see it.
    CREATE TABLE IF NOT EXISTS booth (
      id            INTEGER PRIMARY KEY CHECK (id = 1),
      seen_at       TIMESTAMPTZ,
      printer_ok    BOOLEAN NOT NULL DEFAULT TRUE,
      detail        TEXT    NOT NULL DEFAULT '',
      last_print_ms INTEGER
    );
  `);
  return ready;
}

export const kind = 'postgres';

export async function insertIfRoom(row, maxDepth) {
  await init();
  const rows = await query(
    `INSERT INTO stickers (text, template_id, flagged, reasons, answers, device_id, request_id, status)
     SELECT $1, $2, $3, $4, $5::jsonb, $6, $7, $8
     WHERE (SELECT COUNT(*) FROM stickers WHERE status IN ${WAITING}) < $9
     ON CONFLICT (request_id) WHERE request_id <> '' DO NOTHING
     RETURNING id`,
    [row.text, row.templateId, !!row.flagged, row.reasons.join(','),
     JSON.stringify(row.answers ?? {}), row.deviceId, row.requestId, row.status, maxDepth]
  );
  return rows[0]?.id ?? null;
}

const one = async (sql, params) => { await init(); return (await query(sql, params))[0]; };
const many = async (sql, params) => { await init(); return query(sql, params); };

export const getByRequest = async (id) =>
  (id ? one(`SELECT * FROM stickers WHERE request_id = $1`, [id]) : undefined);
export const getSticker = async (id) => one(`SELECT * FROM stickers WHERE id = $1`, [id]);
export const waitingCount = async () =>
  Number((await one(`SELECT COUNT(*)::int AS n FROM stickers WHERE status IN ${WAITING}`)).n);
export const positionOf = async (id) =>
  Number((await one(`SELECT COUNT(*)::int AS n FROM stickers WHERE status IN ${WAITING} AND id < $1`, [id])).n) + 1;
export const liveTicketFor = async (d) => (d
  ? (await one(`SELECT id FROM stickers WHERE device_id = $1 AND status IN ${WAITING} ORDER BY id DESC LIMIT 1`, [d]))?.id
  : undefined);
export const lastPrintedFor = async (d) => (d
  ? await one(`SELECT id, printed_at FROM stickers WHERE device_id = $1 AND status = 'printed' ORDER BY id DESC LIMIT 1`, [d])
  : undefined);
export const listPending = async () => many(
  `SELECT id, text, template_id, flagged, reasons, status, last_error, created_at
   FROM stickers WHERE status IN ('pending','failed') ORDER BY id ASC`);
export const listInFlight = async () => many(
  `SELECT id, text, template_id, status, attempts, last_error
   FROM stickers WHERE status IN ('approved','printing') ORDER BY id ASC`);
export const listPrinted = async (limit = 200) => many(
  `SELECT id, text, template_id, printed_at FROM stickers WHERE status = 'printed'
   ORDER BY printed_at DESC, id DESC LIMIT $1`, [limit]);
export const printedCount = async () =>
  Number((await one(`SELECT COUNT(*)::int AS n FROM stickers WHERE status = 'printed'`)).n);
export const statusCounts = async () => Object.fromEntries(
  (await many(`SELECT status, COUNT(*)::int AS n FROM stickers GROUP BY status`)).map((r) => [r.status, Number(r.n)]));
export const allAnswers = async () =>
  (await many(`SELECT answers FROM stickers WHERE status = 'printed'`)).map((r) => JSON.stringify(r.answers));
export const approve = async (id) =>
  (await many(`UPDATE stickers SET status = 'approved', decided_at = now() WHERE id = $1 RETURNING id`, [id])).length > 0;
export const reject = async (id) =>
  (await many(`UPDATE stickers SET status = 'rejected', decided_at = now() WHERE id = $1 RETURNING id`, [id])).length > 0;

/**
 * Take the next job, atomically.
 *
 * SKIP LOCKED means two booth agents - or an agent and a retry of itself -
 * cannot both claim the same sticker and print it twice.
 */
export const claimNextPrintJob = async () => await one(
  `UPDATE stickers SET status = 'printing', attempts = attempts + 1
   WHERE id = (SELECT id FROM stickers WHERE status = 'approved'
               ORDER BY id ASC FOR UPDATE SKIP LOCKED LIMIT 1)
   RETURNING *`) ?? null;

export const markPrinted = async (id) => {
  await many(`UPDATE stickers SET status = 'printed', printed_at = now(), last_error = NULL WHERE id = $1`, [id]);
};
export const markFailed = async (id, status, error) => {
  await many(`UPDATE stickers SET status = $1, last_error = $2 WHERE id = $3`, [status, error, id]);
};
export const recoverInterrupted = async () =>
  (await many(`UPDATE stickers SET status = 'approved' WHERE status = 'printing' RETURNING id`)).length;

export const setBoothHeartbeat = async ({ printerOk, detail, lastPrintMs }) => {
  await many(
    `INSERT INTO booth (id, seen_at, printer_ok, detail, last_print_ms)
     VALUES (1, now(), $1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET
       seen_at = now(), printer_ok = EXCLUDED.printer_ok,
       detail = EXCLUDED.detail, last_print_ms = EXCLUDED.last_print_ms`,
    [!!printerOk, detail ?? '', lastPrintMs ?? null]
  );
};

export const getBoothHeartbeat = async () => {
  const row = await one(`SELECT seen_at, printer_ok, detail, last_print_ms FROM booth WHERE id = 1`);
  if (!row?.seen_at) return null;
  return {
    seenAt: new Date(row.seen_at).getTime(),
    printerOk: row.printer_ok,
    detail: row.detail,
    lastPrintMs: row.last_print_ms,
  };
};
