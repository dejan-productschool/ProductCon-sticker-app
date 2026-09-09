# Print spike results

Fill this in the first time the VC-500W prints the target. Everything else in
the build is standing on these numbers, and until they are real they are
assumptions.

    npm run spike -- --dry                       # render only, check it looks right
    npm run spike                                # print it
    npm run spike -- --printer "Brother VC-500W" # if it is not the default printer

Print `out/print-spike-target.png`, then measure the sticker itself.

| | assumed | measured |
|---|---|---|
| Date / who | | |
| Sticker width | 50 mm | |
| Sticker height | 50 mm | |
| Ruler 0 to 50 measures | 50 mm | |
| Roll width used | 50 mm | |
| Head movement | 6.25 s | |
| Hand to hand, one sticker | 15-20 s | |
| Stickers per hour, one unit | ~200 | |
| Edge rule surviving | all four sides | |
| Smallest separated line pair | 1 px | |
| Half cut leaves backing on | yes | |

## Colour on ZINK

How the palette actually landed. ZINK is not a screen.

| swatch | hex | looked like |
|---|---|---|
| brand | `#E8443A` | |
| brandDk | `#B22C24` | |
| sun | `#FFC531` | |
| mint | `#16C79A` | |
| sky | `#2B6CF6` | |
| ink | `#14141C` | |
| 50% grey | `#808080` | |
| cream | `#F6F1E7` | |

## What this changes

- [ ] `SAFE_INSET` in `src/compose/constants.js` (currently 6%) - raise it if the
      edge rule got clipped
- [ ] `PALETTE` in `src/compose/brand.js` - shift values if ZINK moved them
- [ ] The 200/hour throughput number, and therefore whether one unit is enough
- [ ] Whether the standard Windows print path is good enough, or b-PAC is needed
      for explicit half-cut control

## Notes

(Anything that fought back. Driver settings that mattered. What the queue felt
like.)
