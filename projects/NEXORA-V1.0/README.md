# NEXORA V7.8.3 — Unified Featured Sequence & Quote Removal

This release makes one focused refinement to V7.8.2: the quote panel and quote rotation are removed entirely, and the visible Discover hero plus off-screen collection-page ambience now share one featured-video sequence and one cursor.

## Install safely

1. Stop the currently running NEXORA server.
2. Extract this ZIP into a **new folder**. Keep V7.8.2 and V7.7.3 as backups until you have verified the new release locally.
3. Copy your existing `Entertainment` folder into the new project folder. Do not move or delete your original media.
4. Run `npm install`, then `npm run check`, then `npm start`.
5. Open `http://localhost:3000` and hard-refresh with `Ctrl + Shift + R`.

## One shared featured-video sequence

- Discover hero previews and the invisible ambience preview on collection pages use the same A–Z ordered video list and the same `featuredSequenceLastId` cursor. There is no second ambience cursor or independent background sequence.
- When leaving Discover, the currently featured video is handed off to the invisible ambience preview without advancing the cursor. When returning to Discover, the active ambience video is handed back to the visible hero, again without advancing the cursor.
- When moving between Movies, Anime, Music, Docs, Web-Series, Library, and Saved/Favourites, the active ambience preview continues uninterrupted. It does not restart or choose a separate title per section.
- When a preview ends or fails, the shared cursor advances once to the next video; the same next video is used regardless of which section is currently open.
- Each preview contributes a representative video frame to the existing global ambience layers. The frame is downsampled for extraction and crossfades across the entire interface.
- The visible hero remains live-video-only with its title and original actions. It does not request or display a poster/thumbnail.
- The existing preview element is reused, so the ambience system does not create a second video decoder. Background-only previews use the existing 720p-capable preview endpoint for reduced workload.
- If the browser cannot expose a decoded frame to canvas, playback and sequence timing continue and the last successful ambience remains in place.

## Quotes removed

- The quote panel has been removed from Discover and every other section.
- Quote arrays, quote rotation timers, quote markup and quote-only CSS have been removed.
- The featured video's title remains in the hero; it is not a quote and continues to update with the active preview.

## Preserved behaviour

The Midnight Cinema design, hero buttons, card thumbnails and hover previews, row navigation arrows, player, library/folder structure, favourites, watch progress, subtitles, streaming/download routes, server-side media processing and responsive layouts are retained. The server processing routes are unchanged apart from release metadata.
