# ContrastFour

Four-bar contrast desk for bedroom producers stuck in 8-bar loops.

AI tools and loop DAWs reprint the same eight bars forever. Session players write four bars of reduced density, a held bass, and a new color so the loop has a door to the next section.

Live samples only — FluidR3 acoustic grand, upright bass, nylon guitar, trumpet, violin, and acoustic kit from the PreEight sample CDN pinned to commit `d58301e4a494555f411a2afbc448b724136eee76`.

No oscillators. Audio never leaves the tab.

## Distinct from the line

| Tool | Job |
| --- | --- |
| TagFour | Four-bar last-line tag |
| LiftTwo | Two-bar pre-hook lift |
| PreEight | Eight-bar pre-chorus climb |
| SpaceFour | Four bars of air so the hook can slam |
| TensionFour | Four-bar tension hold |
| **ContrastFour** | Four bars of reduced-density contrast so the loop can break |

## Pricing

**Free** during early access. Full license gate and checkout coming with permanent deployment.

## License

MIT. workinwithai-create.

## Audio Engine Compliance

- Lookahead scheduler on AudioContext clock (LOOKAHEAD_MS=25, SCHEDULE_AHEAD=0.12)
- Live state (BPM, key, recipe, mutes) read every step; changes within one bar
- WAV via OfflineAudioContext, first downbeat at sample 0, exact length Math.round(bars*4*60/bpm*48000), tail folded, 48kHz 24-bit, peak ≤ -1 dBFS
- BPM 60–180 and key selector, persisted in localStorage
- Samples pinned to SHA, missing instruments named in UI
- Held notes sustain with gain ramps; ≥10ms release
- Per-chair gains → master compressor → destination
- AudioContext on first tap; visibilitychange stops cleanly
