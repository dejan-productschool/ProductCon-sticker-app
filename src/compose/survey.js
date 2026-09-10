// The guided survey.
//
// Two taps narrow the attendee down to a handful of hand-written lines. Nothing
// is generated at run time - the whole voice of the booth is content/survey.json,
// so it can be rewritten by whoever writes the copy without touching code.
//
// This replaced a free text field for three reasons: typing was the actual
// bottleneck at the booth (about 60 stickers an hour against a printer that can
// do 200), a blank page in a queue produces "Hello" or a walk-away, and every
// way this can embarrass Product School came in through that field.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SURVEY_PATH = join(HERE, '../../content/survey.json');

export const survey = JSON.parse(readFileSync(SURVEY_PATH, 'utf8'));

export const QUESTIONS = survey.questions;
export const FREE_TEXT_ALLOWED = survey.freeText !== false;

const optionIds = (qid) =>
  QUESTIONS.find((q) => q.id === qid)?.options.map((o) => o.id) ?? [];

/** Is this a real option for that question? Anything else is treated as unanswered. */
const valid = (qid, value) => optionIds(qid).includes(value);

export function optionLabel(qid, value) {
  return QUESTIONS.find((q) => q.id === qid)?.options.find((o) => o.id === value)?.label ?? null;
}

/**
 * Lines for a set of answers, most specific first.
 *
 * `who|confession` beats `*|confession` beats `who|*`. A writer can therefore
 * start with one set per confession and add exact pairs only where the
 * combination is funnier than its parts - which is the difference between this
 * and mad libs.
 */
export function linesFor(answers = {}, count = 3) {
  const who = valid('who', answers.who) ? answers.who : null;
  const confession = valid('confession', answers.confession) ? answers.confession : null;

  const keys = [
    who && confession ? `${who}|${confession}` : null,
    confession ? `*|${confession}` : null,
    who ? `${who}|*` : null,
  ].filter(Boolean);

  const out = [];
  for (const key of keys) {
    for (const line of survey.lines[key] ?? []) {
      if (!out.includes(line)) out.push(line);
    }
  }
  for (const line of survey.fallback) {
    if (out.length >= count) break;
    if (!out.includes(line)) out.push(line);
  }

  return out.slice(0, count);
}

/**
 * What the live preview shows part-way through.
 *
 * The sticker assembles as they answer rather than appearing at the end - that
 * is where "I made this" comes from when nobody is typing.
 */
export function previewText(answers = {}) {
  if (valid('confession', answers.confession)) return linesFor(answers, 1)[0];
  if (valid('who', answers.who)) return optionLabel('who', answers.who);
  return null;
}

/** Every line the bank can ever produce. Used by the check script. */
export function allLines() {
  return [...new Set([...Object.values(survey.lines).flat(), ...survey.fallback])];
}

/** Every answer combination, for exhaustive checking. */
export function allCombinations() {
  const combos = [];
  for (const who of optionIds('who')) {
    for (const confession of optionIds('confession')) combos.push({ who, confession });
  }
  return combos;
}
