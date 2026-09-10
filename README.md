# Ship It - sticker station

Booth kiosk for the Product School stand at ProductCon San Francisco.

An attendee answers two questions, gets a line written for that exact pairing,
picks a look, and taps **Ship It**.
A volunteer glances at it and taps approve. About twenty seconds later they peel
a 50 mm sticker off the backing. A second screen shows a live wall of everything
printed today.

Three taps, about twenty seconds, no typing.

Six designed templates, no generative AI at run time, everything running on one
machine at the booth.

Built on the real Product School system: brand blue `#2758E2` and the deep navy
and off-white from the wordmark itself, the AIPMC decks' amber -> mauve ->
violet -> blue ramp, the actual lockup, and Figtree + JetBrains Mono.

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

## The two halves

    phones ──▶  hosted app (Vercel)  ◀── booth agent ──▶ VC-500W
                survey, queue,            claims jobs,
                tickets, the wall         renders, prints

The hosted app holds the queue and talks to phones. It has no printer and never
tries to print. The **booth agent** runs on the mini PC next to the Brother,
pulls approved stickers over `/api/agent/*`, renders them locally and prints.

The agent pulls rather than being pushed to: the booth sits behind whatever
network the venue provides, so an outbound poll needs no inbound port, no tunnel
and no fixed address. When the wifi drops the agent just keeps asking, and
nothing is lost because the queue is not on the booth machine.

Nothing stores pixels. `text` plus `templateId` reproduces a sticker exactly, so
the database stays small and the hosted app never needs a rasteriser - previews
go out as SVG with every glyph already an embedded path. `sharp` lives only on
the booth side.

**If the agent stops checking in, the booth reports itself down and stops
accepting submissions.** Silence counts as down: a queue that keeps taking work
while the printer is unplugged is the exact failure this is built to avoid.

## Run it

Node 22 or newer (the queue uses the built-in `node:sqlite`, so nothing native
has to compile on the Windows mini PC).

```bash
npm install
npm start            # the app: survey, queue, wall
npm run agent        # the booth side, next to the printer
```

`npm start` alone runs everything on one machine against SQLite, which is the
right setup for building and for a booth with no internet. Set `DATABASE_URL`
and it uses Postgres instead; set `VERCEL` or `STICKER_HOSTED=1` and it stops
printing and waits for an agent.

    phone    http://localhost:4173/            <- what the QR opens
    join QR  http://localhost:4173/join/        <- on a booth screen or printed
    approve  http://localhost:4173/approve/     <- the volunteer's tablet
    wall     http://localhost:4173/wall/

The approve tablet and the wall point at the booth machine over the LAN; the
start-up banner prints the address to use.

| variable | default | |
|---|---|---|
| `PORT` | `4173` | |
| `STICKER_PRINTER` | system default | printer name |
| `STICKER_PRINT_MODE` | by platform | `windows`, `macos` or `dry` |
| `STICKER_DATA_DIR` | `./data` | where the SQLite file lives |
| `STICKER_KIOSK` | off | `1` hides the pointer on the booth touchscreen |
| `STICKER_JOIN_URL` | the machine's LAN address | what the QR encodes |
| `STICKER_SECONDS` | `20` | hand-to-hand seconds per sticker, from the print spike |
| `STICKER_BUSY_MIN` | `5` | wait past which the booth says it is busy |
| `STICKER_CLOSED_MIN` | `12` | wait past which it stops accepting |
| `STICKER_COOLDOWN_MIN` | `10` | before the same phone can go again |
| `STICKER_AUTO_APPROVE` | `guided` | `guided`, `none` or `all` |
| `STICKER_DRY_MS` | `0` | fake print duration, for rehearsing without a printer |
| `DATABASE_URL` | unset | Postgres for the hosted app; SQLite without it |
| `STICKER_HOSTED` | off | `1` means no printer here - wait for the agent |
| `STICKER_AGENT_TOKEN` | unset | shared secret; the agent API is closed without it |
| `STICKER_API` | `http://localhost:4173` | where the agent looks for work |

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

## The copy

Everything an attendee can see lives in [`content/survey.json`](content/survey.json)
- the two questions, their options, and the hand-written line bank. A writer can
rewrite the entire voice of the booth without touching code.

The bank is a full 5 x 6 matrix: every identity crossed with every confession,
three lines each, 90 in total. Both answers have to be visible in the result -
if either could be dropped without changing the line, that question is
decoration. Same confession, different identity, genuinely different sticker:

    users    x jira -> "I talk to users. Jira talks to itself."
    meetings x jira -> "Never opened Jira. In every meeting about it."
    new      x jira -> "Six weeks in, still have not opened Jira" 

```bash
npm run lines
```

Checks every line against every template - that it fits, and that at least three
templates set it above the legibility floor - and fails if any of the 30 cells is
missing, short, or has duplicates. A missing cell would silently fall back to a
generic line, which is exactly how a question stops mattering. Run it after
editing the copy.

### Why a survey and not a text field

Typing was the bottleneck. An on-screen keyboard, for a stranger composing a
sentence they have not thought of yet, runs 50-70 seconds - about 60 stickers an
hour against a printer that can do 200. Four taps runs about 20. A blank page in
a queue also produces "Hello" or a walk-away, and every way this can embarrass
Product School came in through that field.

The free-text escape hatch is still there for the minority who want it. Set
`freeText: false` in the survey file to close it.

## Rehearsing without a printer

```bash
STICKER_PRINT_MODE=dry STICKER_DRY_MS=20000 npm start
```

A dry run that returns instantly makes the queue look infinitely fast and hides
the behaviour a rehearsal exists to test. `STICKER_DRY_MS` makes the fake
printer take as long as the real one.

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

## The queue

One printer, a room full of phones. The printer does one sticker roughly every
20 seconds and that number does not move, so the only real decision is what
happens when more people want stickers than the hardware can make.

The failure everyone pictures is a jam. The likelier one is quieter: the booth
accepts 400 submissions in twenty minutes, tells everybody "printing now", and
by hour two there are 180 people holding phones that lied to them. So the booth
would rather turn somebody away honestly than take a job it cannot finish.

- **It says no before you start.** The join screen shows the real wait. Past
  `STICKER_CLOSED_MIN` of queued work, submissions are refused with "come back
  in a few minutes" rather than accepted and disappointed.
- **Admission is atomic.** The capacity check and the insert happen in the same
  tick, so a burst of simultaneous taps cannot all read the same queue depth and
  all decide there is room. Sixty phones tapping at once gets exactly as many
  through as there is room for.
- **One sticker per phone at a time**, then a cooldown, so the queue is not eaten
  by a handful of people discovering they can resubmit.
- **Retries are free.** Every submission carries a request id; a phone retrying
  on a flaky connection gets its existing ticket back rather than a second
  sticker.
- **Everyone can see their place.** A ticket number, position, and an honest
  wait, polled rather than streamed - a phone in a pocket suspends its tab and
  silently drops an event stream.
- **A closed tab is not a lost sticker.** Scanning again lands you back on your
  ticket.
- **The volunteer is not the bottleneck.** Lines from the bank print straight
  through; only free text waits for a tap. At one sticker every 20 seconds a
  human gate is the thing that jams the booth, and there is nothing to moderate
  in a line that was written weeks earlier. `STICKER_AUTO_APPROVE=none` puts the
  tap back on everything.

## Failure behaviour

- Printer offline, out of paper, jammed: one retry, then the job parks as
  `failed` and shows up on the approve tablet with **PRINT AGAIN** on it.
- A job that is approved but not yet printed shows on the tablet as in flight,
  so a sticker is never invisible to the person the attendee is standing at.
- Kill the server mid-print and the interrupted job goes back on the queue at
  start-up. Nothing that somebody is waiting for is dropped silently.
- Rejects are logged, not deleted, so an over-eager filter is visible afterwards.
- While the printer is down the booth stops accepting and says so, on the join
  screen and on every phone already holding a ticket.
- Both screens reconnect on their own and re-read state from the server, so a
  refresh does not empty the wall.

## Still open

- [ ] **Type licensing.** Product School's own faces are saans / saansDisplay /
      antarcticanMono, which are licensed and not redistributable, so the
      templates use Figtree + JetBrains Mono - the open pair the AIPMC decks
      already use. If the licence covers this, drop the .ttf into
      `assets/fonts` and change `FACES` in `src/compose/typeset.js`.
- [ ] **The repo is public** and now carries the real wordmark and palette.
      Worth a nod from whoever owns the brand before pushing.
- [ ] **The six designs**, reviewed by a designer. The software is the small part.
- [ ] **The line bank.** 90 lines is enough to open with; it wants a writer and a
      pass with people who will actually be at the booth. This is the critical
      path, alongside the designs.
- [ ] Whether the confession options rotate through the day, so the wall does
      not fill with six repeated phrases.
- [ ] Whether the wall shows the text, the artwork, or the answer tally -
      `/api/wall` already returns the counts.
- [ ] What happens to the typed lines after the event.
- [ ] Offline fallback pack of pre-rendered designs.
- [ ] Dress rehearsal: one hour, real people who are not on the team.

## Definition of done

- 200 stickers in an hour during rehearsal with nobody restarting anything
- Pull the network cable mid session and it keeps working
- Kill the print service and the queue recovers when it returns
- Someone who has never seen it walks up and uses it without being told how
