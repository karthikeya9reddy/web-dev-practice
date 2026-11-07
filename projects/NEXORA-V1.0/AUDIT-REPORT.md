# NEXORA V7.8.3 — Unified Featured Sequence & Quote Removal

## Release summary

- **Release:** NEXORA V7.8.3
- **Baseline:** NEXORA V7.8.2, with the previously working V7.8.1 hero/navigation repairs retained.
- **Scope:** remove the quote feature completely and make the Discover hero preview plus the global ambience preview use one shared video sequence and one sequence cursor.
- **No redesign:** the hero layout/actions, cards, card previews, row navigation, player, library, and existing visual system were not intentionally redesigned.

## 1. One shared sequence drives the whole site

The independent ambience cursor and hero cursor used by earlier versions have been removed. The application now uses one `featuredSequenceLastId` cursor and one stable A–Z ordered list of library videos.

### Expected behaviour

- On Discover, the current item is shown in the visible hero preview with its matching title and existing hero actions.
- When leaving Discover, the same currently featured video is handed to the existing off-screen preview element for global ambience. This handoff does not advance the sequence.
- When moving between collection pages (for example Movies → Anime → Library), the same active ambience preview continues. Navigation does not create a section-specific sequence or restart the current item.
- When returning to Discover, the same active ambience item is handed back to the visible hero. This handoff does not advance the sequence.
- When the active preview ends or fails, the shared cursor advances to the next video once. The next item is therefore the same regardless of which page is currently open.
- Newly discovered videos are included in the ordered library sequence. The currently active item is retained when possible; subsequent selection proceeds from its position in the refreshed list.

The existing preview video element is reused for visible hero playback and the hidden ambience preview. No additional background video decoder was introduced. The ambience-only preview path remains capped at the existing 720p-capable preview option; the visible hero keeps its existing 1080p-capable path.

## 2. Ambience behaviour

- The currently active featured preview is the only source for ambience frame extraction.
- A representative frame is sampled from that active preview and applied to the existing global ambience layers.
- The resulting visual atmosphere is global: Discover and all collection sections share the same active ambience.
- There is no separate ambience video cursor, no independent per-section ambience sequence, and no quote-driven ambience.
- If frame extraction is unavailable (for example, a browser/canvas restriction), preview playback and sequence progression continue; the last successfully generated ambience is retained rather than interrupting playback.

## 3. Quote feature removed

The quote feature is removed from the application, not merely hidden:

- Quote panel markup removed from `index.html`.
- Quote arrays and quote-rotation code removed from `script.js`.
- Quote-only styles removed from `style.css`.
- Hero heading is now `hero-title` and continues to display the active video's title. It is not a quote.

## 4. Preserved features

The following were retained from the baseline:

- Discover hero design, video title, and Play now / Explore actions.
- Hero video preview without a hero poster/thumbnail request.
- Media card appearance, card thumbnails, and hover previews.
- Desktop horizontal-row navigation controls and mobile touch scrolling.
- Player, watch progress, favourites, library/folder structure, subtitles, and existing media/server processing routes.
- Existing responsive styling and global ambience layers.

The Express routes and FFmpeg/media-processing implementation were not changed for this release; server source changes are limited to release metadata.

## 5. Validation completed

| Check | Result |
|---|---|
| `npm run check` (`node --check server.js` and `node --check script.js`) | **Passed** |
| Focused shared-sequence tests | **Passed** |
| Shared sequence order and wraparound | **Passed** |
| Newly added video inclusion in subsequent sequence selection | **Passed** |
| Discover → collection same-video handoff | **Passed** |
| Collection → Discover same-video handoff | **Passed** |
| Collection → collection preserves active preview | **Passed** |
| Re-clicking active section does not restart sequence | **Passed** |
| Quote panel / quote code / quote-specific CSS removal check | **Passed** |
| HTML parser and duplicate-ID check | **Passed** — 138 IDs, all unique |
| Hero title and existing media elements | **Passed** — one `hero-title`; existing two static video elements remain |
| CSS parsing with PostCSS | **Passed** |
| Package version and server release metadata | **Passed** — V7.8.3 |

The focused tests exercised the actual shared chooser and isolated the actual navigation function with controlled mock state. They verify sequence selection and page-transition handoffs, but they do not replace a real browser test.

## 6. Browser and live integration testing limitations

A headless Chromium visual pass was attempted against a local fixture, but Chromium failed to launch/complete in this environment (sandbox/zygote errors and timeout). No usable rendered screenshot or browser interaction trace was produced. Therefore this report does **not** claim browser-rendered visual verification or physical-device testing.

The Express dependency was not installed in this sandbox, so a live Express-backed run against the user's real `Entertainment` library and media endpoints was not completed. Server and client JavaScript syntax checks did pass.

## 7. Safe installation

1. Stop the currently running NEXORA server.
2. Extract this ZIP into a **new folder**. Keep V7.8.2 and V7.8.1 as backups until you have tested the new release locally.
3. Copy your existing `Entertainment` folder and its media into the new project folder. Do not delete or move your only copy of the original media.
4. Run:

   ```bash
   npm install
   npm run check
   npm start
   ```

5. Open `http://localhost:3000` and hard-refresh with `Ctrl + Shift + R`.
6. Test the following: allow the Discover hero to move to another video; open Movies or Library before the next preview transition; confirm the ambience continues changing there; switch to another collection page and confirm the same sequence continues; return to Discover and confirm the same currently active video is handed back to the hero.

The ZIP contains the application and cache-folder placeholders, not your personal media. Existing `Entertainment` media should be copied from your current working installation.
