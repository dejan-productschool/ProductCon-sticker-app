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

    src/compose/   text fitting, the six templates, PNG rendering
    src/print/     printer adapter + the day-one print spike
    src/server/    express server, SQLite queue, print worker
    public/        kiosk (/), approve tablet (/approve/), wall (/wall/)

## Things worth knowing

- Every dimension derives from `src/compose/constants.js`. Do not hardcode 616.
- Text is rendered from font outlines via fontkit, not by a font lookup, so
  output is identical on the Mac it was built on and the Windows booth machine
  with no fonts installed.
- `src/compose/brand.js` holds the real palette and loads the real wordmark from
  `assets/brand/lockup.svg`. It is the only file that carries a brand colour.
- Type is Figtree + JetBrains Mono (the AIPMC decks' pair). Product School's own
  saans / antarcticanMono are licensed and deliberately not vendored - see
  `FACES` in `src/compose/typeset.js`.
- Re-run `node src/compose/limit.js` after changing any template's text box.
- Node 22+ required: the queue uses the built-in `node:sqlite`, so there is no
  native module to compile on the Windows mini PC.
