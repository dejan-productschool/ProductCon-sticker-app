// The guided survey.
//
// Two taps produce a message. The message is a function of BOTH answers - the
// bank is a full 5 x 6 matrix, so there is no combination where the first
// question quietly stops mattering. If either answer could be dropped without
// changing the line, the question was decoration.
//
// Nothing is generated at run time. The whole voice of the booth is
// content/survey.json, so it can be rewritten by whoever writes the copy
// without touching code.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SURVEY_PATH = join(HERE, '../../content/survey.json');

export const survey = JSON.parse(readFileSync(SURVEY_PATH, 'utf8'));

export const QUESTIONS = survey.questions;
export const FREE_TEXT_ALLOWED = survey.freeText !== false;

export const optionIds = (qid) =>
  QUESTIONS.find((q) => q.id === qid)?.options.map((o) => o.id) ?? [];

const valid = (qid, value) => optionIds(qid).includes(value);

export function optionLabel(qid, value) {
  return QUESTIONS.find((q) => q.id === qid)?.options.find((o) => o.id === value)?.label ?? null;
}

/** True once every question has a real answer. */
export const isComplete = (answers = {}) =>
  QUESTIONS.every((q) => valid(q.id, answers[q.id]));

/**
 * The lines for a complete set of answers.
 *
 * Returns [] until both questions are answered - a half-answered survey has no
 * message, and showing one would make the remaining question look pointless.
 */
export function linesFor(answers = {}) {
  if (!isComplete(answers)) return [];
  return survey.lines[answers.who]?.[answers.confession] ?? survey.fallback;
}

/** Labels for what has been chosen so far, for the progress panel. */
export function chosenLabels(answers = {}) {
  return QUESTIONS
    .map((q) => (valid(q.id, answers[q.id]) ? optionLabel(q.id, answers[q.id]) : null))
    .filter(Boolean);
}

/** Every line the bank can produce. Used by the check script. */
export function allLines() {
  const out = new Set(survey.fallback);
  for (const byConfession of Object.values(survey.lines)) {
    for (const lines of Object.values(byConfession)) lines.forEach((l) => out.add(l));
  }
  return [...out];
}

/** Every answer combination, for exhaustive checking. */
export function allCombinations() {
  const combos = [];
  for (const who of optionIds('who')) {
    for (const confession of optionIds('confession')) combos.push({ who, confession });
  }
  return combos;
}
