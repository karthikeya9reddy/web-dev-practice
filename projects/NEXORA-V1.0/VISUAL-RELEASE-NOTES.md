# NEXORA V1.0.7 — Visual release notes

### Preview ambience
- Replaced static thumbnail ambience updates with a continuously sampled view of the existing hero/global preview.
- Added low-resolution canvas processing, a smoothed colour palette and dual-layer opacity handoff.
- Kept the last valid ambience visible during preview replacement; incoming ambience activates only after its first valid frame.

### Liquid Glass
- Refined translucent surface fills, edge reflections and inner highlights.
- Kept large-surface blur restrained to reduce expensive compositing.
- Preserved legible content and reduced-transparency support.

### Scrolling
- Kept native scroll behaviour.
- Removed reliance on animated full-screen CSS blur for live preview ambience.
- No new scroll event loop or JavaScript scroll interpolation.

### Frozen application behaviour
Playback, hero progression, card hover, mini-player, API routes, library scanner, server/media behaviour and dependencies are unchanged.
