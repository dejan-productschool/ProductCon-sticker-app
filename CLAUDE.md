# Ship It sticker station

Booth kiosk for ProductCon SF. Attendee types one line, picks a template, a
volunteer approves it, a Brother VC-500W prints it as a 50 mm sticker.

Read `docs/build-spec.md` first. It is the agreed brief, and the four hard rules
in it are not up for renegotiation without asking.

## Hard rules

- **No generative AI at run time.** Six designed templates, text typeset by the
  app. Nothing model generated while the booth is running.
- **The Product School lockup is fixed.** Same slot, same size, on all six.
  No attendee input can move, scale, recolour or overlap it.
- **Nothing prints without a volunteer tap.** The profanity filter is a
  convenience; the approve step is the control.
- **Everything runs locally.** No cloud calls in the hot path. Assume the venue
  wifi dies, because it will.

## Where things are

    content/       the survey questions and the hand-written line bank
    src/compose/   text fitting, the six templates, survey resolution, rendering
    src/print/     printer adapter + the day-one print spike
    src/server/    express server, SQLite queue, print worker
    public/        kiosk (/), approve tablet (/approve/), wall (/wall/)

## Things worth knowing

- Every dimension derives from `src/compose/constants.js`. Do not hardcode 616.
- Text is rendered from font outlines via fontkit, not by a font lookup, so
  output is identical on the Mac it was built on and the Windows booth machine
  with no fonts installed.
- `src/compose/brand.js` holds the palette and loads the lockup. Light
  templates use `assets/brand/lockup-color.svg`; the dark template uses
  `assets/brand/lockup-color-dark.svg`. The mark colour lives in those SVGs.
- Type is Figtree + JetBrains Mono, standing in for Saans + Antarctican Mono
  from Product School Foundations. The licensed faces are not vendored - see
  `FACES` in `src/compose/typeset.js`.
- Re-run `node src/compose/limit.js` after changing any template's text box, and
  `npm run lines` after editing content/survey.json.
- The attendee picks from hand-written lines rather than typing. That is what
  keeps the booth at printer speed rather than keyboard speed, and it is why
  there is almost no moderation surface left.
- Node 22+ required: the queue uses the built-in `node:sqlite`, so there is no
  native module to compile on the Windows mini PC.
