# NEXORA V7.4.0 — preview engine repair

NEXORA is a self-hosted personal media library using Express, plain JavaScript and FFmpeg.

## What was wrong in V7.3.1

1. A new poster could start up to five FFmpeg extraction processes sequentially. The preview endpoint waited for the poster metadata, so a first Discover preview or card hover could appear frozen while the server sampled several points.
2. The browser's `play()` rejection was swallowed. A browser autoplay policy or decode error therefore left the poster visible without explaining why the preview did not start.
3. There was no runtime endpoint to distinguish a missing FFmpeg binary, missing FFprobe, missing `libx264`, or unwritable cache folders.
4. Opening the full player while a card preview was active could stop that preview and accidentally restart the Discover hero preview behind the player.

## V7.4.0 changes

- Poster generation now probes duration once, stores one stable scene timestamp, and extracts the poster with one FFmpeg process per size bucket. It no longer runs five sequential sample extractions for every new poster.
- The scene point is chosen deterministically within the middle 34–58% of the title. The same timestamp metadata is shared by the poster and preview clip.
- Thumbnail sizes are cached in 320px, 640px and 960px buckets.
- Preview clips are 6 or 8 seconds depending on the caller, H.264 baseline, yuv420p, silent, 640px wide, 20fps, with `faststart` for quicker startup.
- Preview playback waits for `loadeddata` before calling `play()`. Errors are logged. If muted autoplay is rejected, Discover adds a direct user-gesture **Play preview** fallback while preserving the regular Play now action.
- Hover preview and Discover preview use a single preview decoder. Opening the full player no longer restarts the hero clip behind it.
- `/api/diagnostics` reports FFmpeg, FFprobe, H.264 encoder availability and cache-folder write permissions.
- Existing safe path resolution, symlink checks, folder scanning, byte-range media streaming and download routes are retained.

## Requirements

- Node.js 18 or newer
- npm
- Express 4.21.2 (installed with `npm install`)
- FFmpeg and FFprobe on `PATH`
- FFmpeg build with the `libx264` encoder
- Your existing `Entertainment/` directory beside `server.js`

Check tools manually:

```bash
ffmpeg -version
ffprobe -version
ffmpeg -hide_banner -encoders | grep libx264
```

## Installation / update

1. Stop the running server with `Ctrl + C`.
2. Back up the current NEXORA folder.
3. Extract the ZIP into the NEXORA project directory, replacing the included application files.
4. Keep your existing `Entertainment/` folder and all your media untouched. The ZIP contains an empty placeholder only.
5. Run:

   ```bash
   npm install
   npm run check
   npm start
   ```

6. Open `http://localhost:3000` and hard-refresh with `Ctrl + Shift + R`.

## Diagnostics

Open this address in the same browser:

```text
http://localhost:3000/api/diagnostics
```

A working preview engine reports:

- `ffmpeg.available: true`
- `ffprobe.available: true`
- `libx264: true`
- `thumbnailCacheWritable: true`
- `previewCacheWritable: true`
- `previewEngineReady: true`

You can also test a single source directly (replace the path with one of your own videos):

```text
http://localhost:3000/api/thumbnail?path=Movies%2FAction%2Fyour-video.mp4&w=640
http://localhost:3000/api/preview?path=Movies%2FAction%2Fyour-video.mp4&duration=8
```

The first request generates and caches the assets. Later requests reuse the cached files. If an endpoint returns JSON with an `error` and `detail`, that detail is the actual failure reason.

## Preview behaviour

- Discover selects a featured video from your library, shows its representative poster and title, then tries to play an 8-second muted preview.
- Desktop cards attempt a 6-second muted hover preview after a short delay.
- Touch-only devices do not have hover previews; tapping a card still opens the full player.
- The poster stays visible if autoplay is blocked or the preview cannot be decoded. When the browser rejects autoplay with `NotAllowedError`, Discover offers a **Play preview** button that starts from a user click.
- The preview clip and poster are tied to the same saved scene timestamp.
- Generated clips and posters are cached under `assets/previews/` and `assets/thumbnails/` respectively.
- This is deterministic scene sampling, not AI scene understanding. It cannot guarantee that the selected frame is the most dramatic frame in every title.

## Original media structure

The scanner reads the first folder level as section, the second as genre, and the third as optional subgenre:

```text
Entertainment/
├── Anime/
│   ├── Demon-Slayer/
│   ├── Naruto/
│   └── One-Piece/
├── Documentaries/
├── Movies/
│   ├── Action/
│   ├── Comedy/
│   ├── Horror/
│   └── Romance/
├── Music/
│   ├── Music-Videos/
│   └── Songs/
└── Web-Series/
```

## Playback notes

- Original media is streamed using byte-range requests for seeking.
- Preview MP4s are H.264 baseline, silent and browser-friendly; original-file playback still depends on your browser's supported codecs.
- Quality switching requires alternate encodes or an HLS/DASH pipeline; NEXORA does not pretend that one source file has several qualities.
- Picture-in-picture depends on browser support and does not apply to audio-only playback.
- Share links work only for devices that can reach the same NEXORA server.
- There is no authentication. Keep the server on a trusted LAN; do not expose it publicly without authentication, HTTPS and a security review.
