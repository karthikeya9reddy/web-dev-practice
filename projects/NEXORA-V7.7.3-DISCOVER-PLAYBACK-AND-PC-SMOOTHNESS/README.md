# NEXORA V7.7.3 — Discover playback recovery and PC smoothness

This release is a focused repair built on the supplied stable V7.7.1 baseline as carried forward in V7.7.2. The page layout, navigation, ambience, media player, library scanner, card hover system, and media organization remain unchanged.

## Install

1. Stop the current NEXORA server.
2. Extract this ZIP into a **new folder** so your previous working installation remains available as a backup.
3. Copy your existing `Entertainment` folder into the new project folder. Do not replace, move, or delete your personal media.
4. In the new project folder run:

   ```bash
   npm install
   npm run check
   npm start
   ```

5. Open `http://localhost:3000` and hard-refresh with `Ctrl + Shift + R`.

The archive does not include personal media or generated thumbnail/preview caches. NEXORA creates its cache folders as needed.

## Discover featured-preview behavior

- The featured still poster is displayed first.
- Its three-second hold begins only after the poster/background crossfade has completed.
- The preview's playback request is issued after the full three-second hold. It does **not** wait for `loadeddata` or `canplay` event ordering; those events are diagnostic only.
- The poster remains visible while the browser buffers and decodes. The video layer fades in only after the browser confirms playback has actually started (`playing`, or a fulfilled `play()` promise with the element no longer paused).
- The first-frame and readiness listeners never pause the video.
- The preview is allowed to reach its natural `ended` event. The near-end guard is only a fallback and is placed close to the actual end to avoid cutting off the last part of the clip.
- Startup, stalled-playback, unexpected-pause, and overall safety timers release the hero hold if the browser cannot play the clip, so the quote/background rotation cannot remain locked indefinitely. A retry action is offered if the browser explicitly blocks muted autoplay.
- Mobile inline-playback hints and muted state are explicitly applied.

## PC smoothness

A small desktop-only rendering refinement reduces the blur cost of fixed ambient layers and the topbar backdrop. Hero and preview transitions use opacity compositing. Mobile styles and the existing mobile crossfade timing are left unchanged.

## Scope intentionally preserved

No redesign or functional changes to global ambience logic, quote content, navigation, mobile menu, library scanning, player controls, card hover behavior, subtitle handling, or media routes. Server changes are version metadata only; thumbnail and preview generation logic is unchanged from the baseline.
