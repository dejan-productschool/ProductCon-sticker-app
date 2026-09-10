// Vercel entry point.
//
// The same Express app the booth machine runs, as a serverless function. It
// holds the queue and talks to phones; it has no printer and never tries to
// print. The booth agent claims jobs from it over /api/agent/*.

import { app } from '../src/server/app.js';

export default app;
