# NEXORA V1.0.4 — Mini-player Hover Preview Repair

## Issue
Card hover previews were explicitly blocked whenever the floating mini-player was visible. The guard in `startCardPreview()` returned early for both the expanded player and the minimized player.

## Fix
The guard now suppresses card previews only while the expanded player layer is open. The mini-player remains an independent floating playback surface and card previews continue using their separate reusable video decoder. No mini-player controls, playback state, layout, or visual styling were changed.

## Preserved behaviour
- Card hover previews remain disabled while the expanded player is presented.
- The mini-player continues playback independently.
- Card previews continue to use their own muted decoder and do not pause/reset the mini-player or hero preview.
- Touch devices and save-data / low-memory conditions retain their existing preview restrictions.
- Sign-in remains removed; normal browser text selection remains unchanged.

## Regression coverage
Added a dedicated test asserting that the minimized state no longer blocks the card-preview path while expanded-player suppression remains. Run `npm run check`.

## Verification boundary
Static source regression and automated tests are included. A live media hover test on the user's real library still requires running the package locally with Express, FFmpeg, and the media folder available.
