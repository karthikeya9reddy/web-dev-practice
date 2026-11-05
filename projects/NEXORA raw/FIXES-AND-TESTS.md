# NEXORA V7.4.0 — deep preview-feature audit and validation

## Root causes found in V7.3.1

### 1. Slow poster generation blocked previews

The former `makeRepresentativeThumbnail()` loop launched up to five FFmpeg child processes in sequence. `/api/preview` first awaited the thumbnail metadata, so it could not produce the moving preview until those extractions finished. A first preview could appear to do nothing on a lower-powered VM.

### 2. Silent autoplay / decoding failure

The previous frontend caught `video.play()` rejection and only removed the playing class. It did not distinguish `NotAllowedError` (browser policy) from media/codec or server errors. That made the poster remain static without a user-facing recovery path.

### 3. No runtime dependency check

The previous build did not expose whether FFmpeg, FFprobe, `libx264` or cache-directory permissions were actually available. The new `/api/diagnostics` endpoint reports these conditions.

### 4. Preview decoder state conflict

Opening the main player while a card preview was active could call the card-stop routine, which in Discover resumed the hero preview. V7.4 explicitly disables hero-resume when opening the full player.

## Code changes

- Replaced five sequential thumbnail samples with one fast scene-timestamp selection plus one representative-frame extraction per thumbnail size bucket.
- Store one metadata record (duration and selected timestamp) per source file version. Poster and preview share it.
- Use atomic temporary output files before renaming into cache, reducing risk of incomplete cache entries.
- Generate previews as silent H.264 baseline MP4, yuv420p, 640px wide, 20fps, GOP 40, `faststart`.
- Use `loadeddata` before preview `play()` and inspect its promise. On autoplay denial, Discover offers a user-gesture Play preview action.
- Add structured JSON errors and `/api/diagnostics`.
- Preserve media scanning, section/genre/subgenre metadata, safe path resolution, symlink checks, range streaming and downloads.

## Validation performed in this environment

- `node --check server.js`: passed.
- `node --check script.js`: passed.
- `npm run check`: passed (the check script runs Node syntax checks only).
- CSS parsed with `tinycss2`: no top-level parse errors.
- HTML ID audit: all statically referenced IDs exist; `hero-play` and `hero-explore` are created dynamically by the featured-hero renderer.
- FFmpeg and FFprobe were present in this environment; `libx264` encoder was present.
- `/api/diagnostics` returned `previewEngineReady: true` and both cache folders writable.
- Generated a 320×180 JPEG poster from a synthetic 24-second H.264 source: valid image.
- Generated a 6-second preview MP4: FFprobe reported exactly 6.000 seconds.
- Generated an 8-second preview MP4: FFprobe reported exactly 8.000 seconds.
- HTTP range test against the preview route returned `206 Partial Content`, `Content-Range: bytes 0-1023/...`, and a 1,024-byte body.
- Path traversal test for `../package.json` returned HTTP 400.

## Testing limitations

- The test media was synthetic; your private video files and your Parrot OS browser were not available in this environment.
- Express could not be downloaded in this environment because registry DNS/network access was unavailable. The route tests were run with a small Express-compatible test shim, which exercised the actual NEXORA route functions and FFmpeg processes. The release ZIP does not contain that test shim; normal runtime uses the declared Express 4.21.2 dependency.
- Browser automation was blocked from connecting to the local test server by the execution environment (`ERR_BLOCKED_BY_ADMINISTRATOR`). Therefore the final hover/autoplay behaviour was checked by code-path and media-route validation, not a live browser test here.
- Browser autoplay policies can differ by browser settings, mobile power-saving modes and user preferences. MDN recommends handling the `play()` promise and providing a fallback; the new build does so.

## Useful references

- FFmpeg `thumbnail` filter selects a representative frame from a batch of consecutive frames; the batch size affects the work it performs: https://ffmpeg.org/ffmpeg-filters.html#thumbnail
- FFmpeg input seeking and accurate-seek behaviour: https://ffmpeg.org/ffmpeg.html#Main-options
- MDN autoplay guide and browser autoplay blocking: https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay
- MDN `HTMLMediaElement.play()` rejection cases, including `NotAllowedError`: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play
- Express 4 `res.sendFile()` options, including accepting byte ranges by default: https://expressjs.com/en/4x/api/response/#res.sendFile
