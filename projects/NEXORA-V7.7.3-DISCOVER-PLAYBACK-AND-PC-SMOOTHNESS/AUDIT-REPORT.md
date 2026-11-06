# NEXORA V7.7.3 — Discover playback recovery and PC smoothness audit

## Baseline and scope

Built from the user's stable V7.7.2 project, which already incorporates the user's supplied baseline. Changes are limited to the Discover featured-preview state machine, a desktop-only CSS rendering refinement, and release/version references. The server's media scanning, poster generation, preview generation, range streaming, subtitles, player, navigation, ambience, and library functionality are otherwise unchanged.

## Reported failure addressed

The Discover title could remain on its poster while the quote/background cycle also stopped. The previous implementation made the playback start depend on the browser's `loadeddata`/`canplay` readiness-event ordering. It then held the quote cycle while waiting for the preview. Different desktop/mobile browsers may sequence media readiness and playback events differently; if the expected sequence is delayed, the still can remain on screen.

## Changes

1. Playback is now requested when the three-second poster hold completes. It no longer waits for `loadeddata` or `canplay` to be delivered in a particular order.
2. The still poster remains visible while the browser buffers/decodes. The video layer is revealed only when playback is confirmed by `playing` or by a fulfilled `play()` promise while the element is no longer paused.
3. `loadeddata` and `canplay` listeners are diagnostic only. They do not call `pause()` or gate playback.
4. Muted state, zero volume, `playsinline`, and `webkit-playsinline` are explicitly applied for inline autoplay compatibility. The code does not set the `autoplay` attribute, so the clip cannot bypass the three-second still hold.
5. Startup timeout, playback-progress watchdog, unexpected-pause handling, natural `ended` handling, and an independent 45-second sequence safety release are present. An autoplay-policy rejection offers a retry control and releases the sequence if no retry is made.
6. The near-end fallback is now only 40ms from the reported duration; the normal `ended` event remains the primary completion signal.
7. Desktop-only ambient-layer and topbar blur costs are reduced, with opacity-only compositor-friendly hero/preview transitions. Mobile styles and timing remain unchanged.
8. Versioned CSS/JS references and server/package metadata identify V7.7.3. Media generation algorithms and cache settings were not changed.

## Validation performed

- `node --check script.js`: passed.
- `node --check server.js`: passed.
- `npm run check`: passed.
- HTML audit: 144 IDs, all unique.
- CSS parser: zero top-level parse errors.
- Static playback-state assertions: playback request is gated by the three-second hold only; first-frame events do not pause or gate playback; reveal occurs on playback confirmation; startup and progress watchdogs are present; independent sequence failsafe is installed after preview setup.
- Actual local `/api/library` integration call against a generated test media folder: passed.
- Actual `/api/preview` integration call: HTTP 206 range response; verified generated preview stream via FFprobe at 1920×1080, H.264 High Profile, approximately 7.97 seconds.
- Actual `/api/thumbnail` integration call: JPEG at 1920×1080; response marks poster as preview-aligned and reports the same stream index/timestamp as the clip.
- Full generated preview decoded with FFmpeg: passed.
- Poster and first decoded preview frame dimensions match (1920×1080); synthetic-fixture mean absolute per-channel difference approximately 1.48/255.
- Desktop CSS refinement is scoped to `min-width: 1024px` and `prefers-reduced-motion: no-preference`.
- ZIP archive integrity: checked after packaging.

## Testing limitation

A full interactive desktop/mobile browser pass could not be run in this environment because Chromium navigation is blocked by the execution environment (`ERR_BLOCKED_BY_ADMINISTRATOR`). Server/media endpoints and source logic were tested, but this does not prove behavior on the user's specific browser, phone, PC GPU, network, or personal media files. The first on-device check should be the Discover featured-video sequence on both desktop and mobile.

## Personal media

No personal media is bundled or modified. Copy the user's existing `Entertainment` folder into the extracted project folder during installation.
