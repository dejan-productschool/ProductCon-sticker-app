# Ship It - sticker station

Booth kiosk for the Product School stand at ProductCon San Francisco.

An attendee types one line, sees it set into three sticker designs, picks one and
taps **Ship It**. A volunteer glances at it and taps approve. About twenty
seconds later they peel a 50 mm sticker off the backing. A second screen shows a
live wall of everything printed today.

Six designed templates, no generative AI at run time, everything running on one
machine at the booth.

## The numbers everything derives from

Brother VC-500W, already bought:

| | |
|---|---|
| Resolution | 313 x 313 dpi |
| Max print width | 50 mm |
| Print speed | 8 mm/s |
| Sticker | 50 x 50 mm = **616 x 616 px** |
| Head movement per sticker | 6.25 s |
| Hand to hand | 15-20 s |
| Throughput, one unit | ~200/hour |

`src/compose/constants.js` derives all of it. Change `STICKER_MM` or `DPI` and
the rest follows. Nothing hardcodes 616.

## Run it

Node 22 or newer (the queue uses the built-in `node:sqlite`, so nothing native
has to compile on the Windows mini PC).

```bash
npm install
npm start
```

    kiosk    http://localhost:4173/
    approve  http://localhost:4173/approve/     <- the tablet
    wall     http://localhost:4173/wall/

The approve tablet and the wall point at the booth machine over the LAN; the
start-up banner prints the address to use.

| variable | default | |
|---|---|---|
| `PORT` | `4173` | |
| `STICKER_PRINTER` | system default | printer name |
| `STICKER_PRINT_MODE` | by platform | `windows`, `macos` or `dry` |
| `STICKER_PROMPT` | "What did you ship that you are proud of?" | the question on screen one |
| `STICKER_DATA_DIR` | `./data` | where the SQLite file lives |
| `STICKER_KIOSK` | off | `1` hides the pointer on the booth touchscreen |

A physical keyboard works everywhere: letters type, Enter advances, Backspace
deletes, Escape goes back, arrows move between the three options. There is no
keyboard at the booth, but there is one while you are building, and a volunteer
can plug one in to fix a typo. Add `?kiosk=1` to the kiosk URL to see it exactly
as the booth screen will look.

## Do the print spike first

Before any of the above matters, with the real printer and the real label stock
on the desk:

```bash
cd ~/Github/ProductCon-sticker-app
npm run spike
```

If the Brother is not the system default printer, name it. Quotes get stripped
on the way through npm, so a name with spaces is fine either way:

```bash
npm run spike -- --printer "Brother VC-500W"
```

That prints one hardcoded target: a millimetre ruler, corner registration
crosses, the palette, and line pairs down to one pixel. Measure the sticker that
comes out and write the answers into `docs/print-spike-results.md`.

This is the only genuinely unknown part of the system. If the Brother fights
back, week one is when you want to find out.

## Look at the templates

```bash
npm run proof                      # all six with a default line
npm run proof -- "your line here"
npm run proof -- --stress          # the awkward inputs
node src/compose/limit.js          # what the character limit should be
```

Writes to `out/`.

## How it fits together

    kiosk (screen one)  --  types a line, picks one of three
            |
    compose service     --  fits the text, renders a 616 x 616 PNG
            |
    approve queue       --  SQLite; a volunteer taps yes or no on a tablet
            |
    print service       --  local, USB, one at a time, one retry then park
            |
    wall (screen two)   --  live grid + counter

Text is drawn from font outlines with fontkit rather than by a font lookup, so
the same line renders to identical pixels on the Mac it was designed on and on
the booth machine with no fonts installed.

## Hard rules

- **No generative AI at run time.** Six templates, decided and final. This is
  what makes the station fast, predictable, on brand, and able to survive the
  venue network dying.
- **The lockup is part of the template**, fixed slot, fixed size. Nothing an
  attendee types can move, scale, recolour or overlap it.
- **Nothing prints without a volunteer tap.** The profanity filter is a
  convenience, not a control.
- **Everything runs locally.** No cloud calls in the hot path.

## Failure behaviour

- Printer offline, out of paper, jammed: one retry, then the job parks as
  `failed` and shows up on the approve tablet with **PRINT AGAIN** on it.
- A job that is approved but not yet printed shows on the tablet as in flight,
  so a sticker is never invisible to the person the attendee is standing at.
- Kill the server mid-print and the interrupted job goes back on the queue at
  start-up. Nothing that somebody is waiting for is dropped silently.
- Rejects are logged, not deleted, so an over-eager filter is visible afterwards.
- Both screens reconnect on their own and re-read state from the server, so a
  refresh does not empty the wall.

## Still open

- [ ] **Real brand assets.** `src/compose/brand.js` is placeholder colours and a
      typeset wordmark. Drop a real `assets/brand/lockup.svg` in and replace the
      palette. Check with whoever owns the brand before pushing - this repo is
      public.
- [ ] **The six designs**, reviewed by a designer. The software is the small part.
- [ ] The prompt question, or a rotating set.
- [ ] Whether the wall shows the text or only the artwork.
- [ ] What happens to the typed lines after the event.
- [ ] Offline fallback pack of pre-rendered designs.
- [ ] Dress rehearsal: one hour, real people who are not on the team.

## Definition of done

- 200 stickers in an hour during rehearsal with nobody restarting anything
- Pull the network cable mid session and it keeps working
- Kill the print service and the queue recovers when it returns
- Someone who has never seen it walks up and uses it without being told how
