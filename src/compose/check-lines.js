// Checks the line bank against the templates.
//
//   npm run lines
//
// Because the copy is written in advance rather than typed on the day, we can
// guarantee things a free text field never could: every line fits, every line
// has at least three templates that can set it legibly, and every answer
// combination produces a full set of choices. Run this after editing
// content/survey.json - it is the writer's safety net.

import { fitText } from './typeset.js';
import { TEMPLATES } from './templates.js';
import { MIN_LEGIBLE_PX, pxToCapMm } from './constants.js';
import { MAX_CHARS, sanitise } from './sanitise.js';
import { allLines, allCombinations, linesFor, QUESTIONS, survey } from './survey.js';

const OFFERED = 3;
let problems = 0;

const legibleIn = (text) =>
  TEMPLATES.filter((t) => fitText(text, t.textBox, t.textStyle).fontSize >= MIN_LEGIBLE_PX);

console.log(`floor: ${MIN_LEGIBLE_PX}px cap height, ${OFFERED} templates needed per line\n`);

// --- every line ---------------------------------------------------------
const lines = allLines().sort((a, b) => b.length - a.length);
console.log('chars  legible  worst              line');
for (const line of lines) {
  const clean = sanitise(line);
  const ok = legibleIn(line);
  const sizes = TEMPLATES.map((t) => fitText(line, t.textBox, t.textStyle));
  const worst = Math.min(...ok.map((t) => fitText(line, t.textBox, t.textStyle).fontSize));

  const flags = [];
  if (line.length > MAX_CHARS) flags.push(`OVER ${MAX_CHARS} CHARS`);
  if (clean.text !== line) flags.push('CHANGED BY SANITISER');
  if (!clean.ok) flags.push(`FLAGGED (${clean.reasons.join(',')})`);
  if (ok.length < OFFERED) flags.push(`ONLY ${ok.length} LEGIBLE TEMPLATE(S)`);
  if (sizes.some((f) => !f.fits)) flags.push('OVERFLOWS');
  if (flags.length) problems++;

  console.log(
    String(line.length).padStart(5) + '  ' +
    String(ok.length).padStart(7) + '  ' +
    `${String(worst || 0).padStart(3)}px/${pxToCapMm(worst || 0).toFixed(1)}mm`.padEnd(18) + ' ' +
    (flags.length ? `!! ${flags.join('; ')}  ` : '') + `"${line}"`
  );
}

// --- every answer combination -------------------------------------------
// A cell that falls through to the fallback means one of the two questions
// stopped mattering for that pairing, which is the whole thing this file
// exists to catch.
console.log('\nanswer combinations');
let filled = 0;
for (const { who, confession } of allCombinations()) {
  const cell = survey.lines[who]?.[confession];
  const got = linesFor({ who, confession });

  if (!cell || cell.length === 0) {
    problems++;
    console.log(`  !! ${who} | ${confession}  MISSING - falls back to a generic line`);
    continue;
  }
  if (cell.length < OFFERED) {
    problems++;
    console.log(`  !! ${who} | ${confession}  only ${cell.length} line(s), want ${OFFERED}`);
    continue;
  }
  if (new Set(got).size < got.length) {
    problems++;
    console.log(`  !! ${who} | ${confession}  has duplicates`);
    continue;
  }
  filled++;
}
console.log(`  ${filled}/${allCombinations().length} combinations have their own ${OFFERED} lines`);

console.log(`\nquestions: ${QUESTIONS.map((q) => `${q.id} (${q.options.length})`).join(', ')}`);
console.log(problems ? `\n${problems} PROBLEM(S)` : '\nall good');
process.exitCode = problems ? 1 : 0;
