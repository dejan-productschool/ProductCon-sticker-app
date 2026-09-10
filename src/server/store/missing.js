// No store configured.
//
// Reached when the app is hosted but no DATABASE_URL is attached. Every call
// fails with the same clear message rather than the function crashing on a
// read-only filesystem, so the deployment can say what is wrong instead of
// returning a 500 with no explanation.

const MESSAGE =
  'No database attached. Add a Postgres store to the project and set DATABASE_URL.';

const fail = async () => { throw new Error(MESSAGE); };

export const kind = 'none';
export const reason = MESSAGE;
export const insertIfRoom = fail;
export const getByRequest = fail;
export const getSticker = fail;
export const waitingCount = fail;
export const positionOf = fail;
export const liveTicketFor = fail;
export const lastPrintedFor = fail;
export const listPending = fail;
export const listInFlight = fail;
export const listPrinted = fail;
export const printedCount = fail;
export const statusCounts = fail;
export const allAnswers = fail;
export const approve = fail;
export const reject = fail;
export const claimNextPrintJob = fail;
export const markPrinted = fail;
export const markFailed = fail;
export const recoverInterrupted = fail;
export const setBoothHeartbeat = fail;
export const getBoothHeartbeat = fail;
