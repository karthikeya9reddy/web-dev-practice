# Ambience & Scroll Rendering Changes — V1.0.9

## Live preview ambience

- Continues to use the existing hero preview video; no second decoder is added.
- Decoded-frame callbacks remain the source of new ambience frames.
- Sampling interval: 33ms normal, 40ms constrained, 50ms Save-Data, 420ms reduced-motion.
- Time-based temporal blend constant: 44ms normal, 54ms constrained.
- Existing low-resolution 480×270 canvas, blur/colour treatment, smoothed palette and dual-layer opacity handoff remain unchanged.

## Poster-grid scrolling

- Initial and subsequent poster-grid DOM insertion batches are 32 instead of 64.
- The 680px observer prefetch margin is unchanged.
- The grid still uses `content-visibility: auto` and an intrinsic placeholder size.
- All files are rendered in order; no search, filtering, playback or library semantics change.

## Test observation

A headless Chromium 390×844 synthetic grid test with 32 cards measured 91 frames in approximately 1.5 seconds, with a median frame interval of 16.7ms, p95 of 16.8ms and no Long Task entries. This reflects a 60Hz Linux host and should not be presented as a 120fps or Android GPU result.
