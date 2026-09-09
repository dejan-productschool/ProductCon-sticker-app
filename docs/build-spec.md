# Ship It: sticker station build spec

ProductCon San Francisco, Product School booth.
Repo: https://github.com/dejan-productschool/ProductCon-sticker-app

Paste this as the first message in a new session inside that repo.

---

## What we are building

A booth kiosk where an attendee types one line, sees it set into a Product School
sticker, taps Ship It, and peels the printed sticker off the backing about twenty
seconds later. A second screen shows a live wall of everything printed today.

## Hardware, already bought, not negotiable

Brother VC-500W. ZINK, so full colour with no ink cartridges ever.

- 313 x 313 dpi
- 8 mm per second print speed
- Maximum print width 50 mm. Supported roll widths: 9, 12, 19, 25, 50 mm.
- Maximum label length 17 inches
- Built in cutter, full cut and half cut. Half cut leaves the backing on so the
  sticker peels properly.
- Driven from a **Windows** mini PC. Brother's b-PAC SDK is Windows only.

Two large screens at the booth. One volunteer on station.

## The canvas, derive everything from this

- 50 mm roll, 50 x 50 mm square sticker
- At 313 dpi that is exactly **616 x 616 px**. Render at that size, not scaled to it.
- 50 mm at 8 mm/s is about 6.25 seconds of printing. Budget 15 to 20 seconds end to
  end with cut and handling. One unit does roughly 200 stickers an hour.

## The flow

1. Attendee reads the prompt on screen one and types one line
2. App shows that line set into three of the six templates
3. Attendee picks one and taps Ship It
4. Composed PNG enters the approve queue
5. Volunteer taps approve on a tablet
6. Print service sends it to the Brother
7. Sticker appears on the wall on screen two, counter increments

## Hard rules

**No generative AI at run time.** Six designed templates, decided and final. The
attendee's text is typeset by the app with a real font. Nothing is model generated
while the booth is running. This is what makes the station fast, predictable, on
brand, and able to survive the venue network dying.

**The Product School lockup is part of the template**, at a fixed position and size.
Nothing the attendee does can move, scale, recolour or overlap it.

**Nothing prints without a volunteer tap.** The approve step is the real safeguard.
A profanity filter is a convenience, not a control.

**Everything runs locally on the booth machine.** No cloud calls in the hot path.
Assume the venue wifi fails at some point on the day, because it will.

## Typesetting

Pick a character limit that fits the tightest of the six templates and enforce it in
the input field, not after submission. Auto-fit down to a minimum size, then stop.

Test with: all caps, emoji, accented characters, one very long unbroken word, a
single character, and empty input.

## Components

### Kiosk, screen one
Full screen, no browser chrome, no shortcuts out, no exposed USB, no route to the OS.
On-screen keyboard with system functions stripped. Attract loop that resets the form
after a period of no input. Touch targets and type sized to be read standing up.

### Compose service
In: the line plus a template id. Out: a 616 x 616 px sRGB PNG ready to print.
Render server side rather than screenshotting a browser, so output is deterministic.
Sanitise input before it reaches the renderer.

### Approve queue
A list on a tablet, newest first, showing the sticker exactly as it will print.
Approve or reject in one tap, no confirmation dialog. Log rejects rather than
dropping them silently.

### Print service
Local Windows service. Takes an approved PNG and sends it to the VC-500W.
Start with the standard Windows print path at exact physical size. Only reach for
b-PAC if you need explicit half cut control.

Handle printer offline, out of paper, and jams, and surface each one on the approve
tablet where a human is looking. Retry once, then park the job and alert. Never
silently lose a sticker that someone is standing there waiting for.

### Wall, screen two
Live grid of today's stickers, newest first, with a running count. Display only.
State lives on the server so a refresh does not empty the wall.

## Build order

1. **Print spike on day one.** A hardcoded PNG, the real printer, the real stock,
   printed from code. Measure the true end to end time for one sticker. Everything
   downstream is guesswork until that number is real, and if the printer fights back
   there is still time to change plan.
2. Compose service and the six templates
3. Kiosk UI
4. Approve queue
5. Wall
6. Failure handling and offline behaviour
7. Dress rehearsal: one hour, real people who are not on the team, and watch where
   the queue jams

## Stack

Keep it boring. It runs on one machine, for one day.

- Node or Python, whichever the builder is fastest in
- Server side image compositing (sharp, or Pillow)
- SQLite for the queue and the wall feed. No cloud database.
- Plain local HTTP. Both screens and the tablet point at the booth machine.

## Definition of done

- 200 stickers in an hour during rehearsal with nobody restarting anything
- Pull the network cable mid session and it keeps working
- Kill the print service and the queue recovers when it returns
- Someone who has never seen it walks up and uses it without being told how

## Open questions for the team

- The six template designs, and who is designing them
- The prompt question, or the rotating set of them
- Character limit, once the templates exist
- Whether the wall shows the text or only the artwork
- What happens to the typed lines after the event
