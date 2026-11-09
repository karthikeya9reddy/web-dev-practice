# NEXORA V1.1.0 — God Mode Infrastructure & Scalability Hardening

This release is based on the supplied NEXORA V1.0.9 project. It preserves the V1.0.9 frontend experience and makes targeted internal backend changes for concurrency control, large-library handling, stream cleanup and diagnostics efficiency.

## Install

Use a maintained Node.js release (22 or newer; prefer a current supported LTS release with its latest security patches).

1. Extract the ZIP into a new folder.
2. Place your existing `Entertainment` media folder beside `server.js`.
3. From the extracted NEXORA folder, run:

```bash
npm ci
npm run check
npm start
```

The package version is `1.1.0`. The application listens on `0.0.0.0:3000` by default; configure `HOST` and `PORT` for your deployment topology.

This release has **no built-in sign-in**, account system, credentials or HTTP authentication challenge. It also preserves normal browser text selection and does not add a custom text-highlight feature.

## V1.1.0 engineering changes

### Bounded FFprobe execution

- Added an independent FFprobe semaphore, defaulting to 2 active probes and a maximum of 64 queued waiters.
- Primary video-stream discovery and embedded-subtitle probing now use that gate.
- Scene-duration metadata probing uses the probe gate instead of occupying an FFmpeg encoder slot.
- Queue saturation fails promptly with a retryable busy error instead of spawning unlimited metadata processes.

### Media stream cleanup and HTTP HEAD

- Full-file and byte-range stream requests now destroy their file streams when the client connection closes.
- HEAD requests return the same relevant media headers without opening and reading the media file.
- Download HEAD requests also avoid creating a read stream.

### Large-library handling

- Recursive scanner merges now iterate nested results rather than spreading arbitrarily large arrays into `push`, avoiding argument-count limits on deep/large folders.
- The library JSON payload is serialized once when a cached library snapshot is refreshed and reused for visitors during the existing 15-second snapshot window. The API response shape and `no-store` policy remain unchanged.

### Search efficiency

- The per-file search index prepared during library loading is now reused by filtering instead of rebuilding metadata text on every query update. Nested folder terms remain searchable.

### Diagnostics

- FFmpeg/FFprobe checks are process-gated.
- The duplicate FFmpeg encoder scan was removed.
- Tool capability checks are single-flight and cached for 30 seconds; live active-process counters are still returned on each diagnostics response.

### Baseline and compatibility

- The visual design, markup and player behaviours are retained. `script.js` has one internal search-path optimisation that reuses the prebuilt search index.
- `index.html` changes only the cache-busting release query strings.
- `style.css` changes only the release comment.
- Existing media routes, player features, no-sign-in requirement and native browser text selection are preserved.
- No new runtime dependency was added. The direct dependency remains Express `^5.3.0`.
- The Node engine requirement is now `>=22`; Node 18 and 20 are end-of-life and should not be used for new deployments.

## Verification in this build environment

- `node --check server.js`: passed.
- `node --check script.js`: passed.
- `npm run check`: 60/60 Node tests passed (see `TEST-OUTPUT-FINAL.txt`).
- Chromium headless browser audit: latest completed run 6/6 checks; an earlier synthetic scrolling run showed one 244 ms long task and a subsequent retry timed out. This variability is disclosed in the audit report.
- Chromium CSSOM parse: passed; 1,313 total CSS rules were parsed.
- The source diff confirms no markup, styling-rule, animation or player-flow changes; one internal search-index reuse optimisation was added.
- V1.0.8 and V1.0.9 baseline file hashes verify against their manifests.
- Fresh ZIP extraction: archive integrity clean, 68/68 release-manifest entries verified, and 60/60 Node tests passed from the extracted copy.

## Explicit verification limitations

This environment could not complete `npm ci`: requests to `registry.npmjs.org` failed with DNS `EAI_AGAIN`. Express was therefore unavailable, and the live Express server, real HTTP integration, FFmpeg/FFprobe endpoint integration, and exact-lockfile `npm audit` were not run. The archive also does not contain the user's `Entertainment` library.

The Chromium tests exercise the included synthetic navigation, fullscreen and 32-card scroll fixtures. They are not a physical Android test, a 120 Hz measurement or a full real-library UI performance trace. No real multi-user load test, Cloudflare Tunnel test, long-duration endurance test or production benchmark was performed.

See `GOD-MODE-AUDIT-REPORT.md` for findings, implemented changes, remaining risks and required next verification steps. The scroll-test repeatability caveat is in `BROWSER-AUDIT/SCROLL-REPEATABILITY-NOTE.md`.
