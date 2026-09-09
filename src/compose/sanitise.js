// Input sanitising. Runs before anything reaches the renderer, and before the
// text is stored.
//
// The kiosk field enforces the character limit as you type; this is the server
// side backstop for it, not a second, different rule.

import { hasGlyph } from './typeset.js';

export const MAX_CHARS = 64;

// A convenience filter, not a control. The volunteer tap is the control.
// Deliberately short and obvious: a long list produces false positives on
// ordinary product words, which is worse at a booth than a rare miss that a
// human then catches.
const BLOCKED = [
  'fuck', 'shit', 'cunt', 'bitch', 'bastard', 'dick', 'cock', 'pussy',
  'asshole', 'nigger', 'faggot', 'retard', 'whore', 'slut', 'rape', 'nazi',
];

const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };

// C0/C1 controls, zero-width marks, bidi overrides, BOM. Built from escapes so
// no invisible character ever lives in this source file.
const INVISIBLE = new RegExp(
  '[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF]',
  'g'
);

/**
 * Clean a raw kiosk submission.
 * Returns { text, ok, reasons, dropped } - `text` is always safe to render.
 */
export function sanitise(raw) {
  const reasons = [];
  const dropped = [];

  let text = String(raw ?? '')
    .normalize('NFC')
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Drop anything the font cannot draw (emoji, most notably) rather than
  // printing .notdef boxes on a sticker somebody is standing there waiting for.
  let kept = '';
  for (const ch of text) {
    if (ch === ' ' || hasGlyph(ch.codePointAt(0))) kept += ch;
    else dropped.push(ch);
  }
  text = kept.replace(/\s+/g, ' ').trim();
  if (dropped.length) reasons.push('unsupported-characters');

  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS).trim();
    reasons.push('truncated');
  }

  if (text.length === 0) {
    return { text: '', ok: false, reasons: [...reasons, 'empty'], dropped };
  }

  if (containsBlocked(text)) reasons.push('flagged');

  return { text, ok: !reasons.includes('flagged'), reasons, dropped };
}

const MASKS = /[*#!%^&?.-]/;
const VOWELS = ['a', 'e', 'i', 'o', 'u'];

// A blocked word only counts inside a token if what surrounds it is an actual
// prefix or inflection. Without this, "Scunthorpe" and "cocktail hour" get
// flagged, and a volunteer rejecting harmless stickers is a worse failure at a
// booth than a rare miss the same volunteer would catch anyway.
const PREFIXES = ['', 'mother', 'bull', 'dip', 'jack', 'dumb', 'horse', 'clusterf', 'cluster'];
const SUFFIXES = ['', 's', 'es', 'ed', 'ing', 'er', 'ers', 'y', 'ies', 'head', 'hole', 'bag'];

function tokenHits(token) {
  return BLOCKED.some((word) => {
    let i = token.indexOf(word);
    while (i !== -1) {
      const prefix = token.slice(0, i);
      const suffix = token.slice(i + word.length);
      if (PREFIXES.includes(prefix) && SUFFIXES.includes(suffix)) return true;
      i = token.indexOf(word, i + 1);
    }
    return false;
  });
}

const tokenise = (s) => s.split(/[^a-z*]+/).filter(Boolean);

export function containsBlocked(text) {
  const lower = text.toLowerCase();

  // Straight check: leet folded. Catches "sh1t", "a$$hole".
  const folded = [...lower].map((c) => LEET[c] ?? c).join('');
  if (tokenise(folded).some((t) => tokenHits(t.replace(/\*/g, '')))) return true;

  // Censored check: "f*ck", "sh!t". A mask stands in for a vowel, so try each.
  // Bounded at two masks - past that we are guessing, and the volunteer tap is
  // the actual safeguard.
  const masked = [...lower]
    .map((c) => (LEET[c] ? LEET[c] : MASKS.test(c) ? '*' : c))
    .join('');

  return tokenise(masked).some((token) => {
    const positions = [...token].flatMap((c, i) => (c === '*' ? [i] : []));
    if (positions.length === 0 || positions.length > 2) return false;
    const candidates = positions.reduce(
      (acc, i) => acc.flatMap((t) => VOWELS.map((v) => t.slice(0, i) + v + t.slice(i + 1))),
      [token]
    );
    return candidates.some(tokenHits);
  });
}
