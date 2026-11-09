# NEXORA V1.0.3 — Accessibility & Integration Review

## Executive summary

NEXORA retains its cinematic dark interface, hero treatment, shelf/card design and player layout. The V1.0.3 corrective release implements targeted semantic, keyboard and connection-state fixes without redesigning the product.

## Findings implemented

### 1. Missing accessible names

- Added names to Autoplay next, Shuffle playback and Repeat current title toggles.
- Changed media cards to native, independent Play and Bookmark buttons. The Play button has a title-specific accessible label; the Bookmark button has a state-specific label and `aria-pressed`.
- A controlled Chromium sample with a synthetic library found no visible unnamed buttons or links.

### 2. Heading hierarchy

- The document now exposes one H1 for the active page.
- That H1 is visually hidden but available to assistive technology and updates between Discover and Your collection.
- Hero, collection and shelf titles are H2 headings.

### 3. Contrast

The faint text token and search placeholder were raised. Contrast calculations for solid pairs:

| Foreground | Background | Contrast |
|---|---|---:|
| `#8491a3` | `#121a25` | 5.47:1 |
| `#929daa` | `#17191e` | 6.39:1 |
| `#8491a3` | `#080b10` | 6.16:1 |

All listed pairs exceed the 4.5:1 normal-text AA threshold. This does not certify small labels over every dynamic poster/hero gradient; those still need context-specific measurement.

### 4. Keyboard focus

- Global interactive elements receive a visible 2px `:focus-visible` outline.
- Search fields use a parent `:focus-within` treatment as a fallback, so the search focus cue does not rely only on the CSS `:has()` selector.
- Chromium confirmed the focused section-search shell displayed a 3px focus shadow.

## Frontend/backend integration findings implemented

- Separate initial loading from the true empty-library state; the title counter no longer says `0 TITLES` before the API has answered.
- Health check timeout: 5 seconds.
- Library request timeout: 20 seconds.
- Failed requests display an offline banner and Retry button.
- Previously loaded library data remains visible when a later refresh fails.
- Subtitle discovery starts after the selected video's metadata is ready, not immediately after setting the media source.

## Backend findings already present in the source

- `/api/health` endpoint.
- 15-second in-memory library snapshot cache with concurrent scan coalescing.
- Byte-range/partial-content support.
- Canonical media-root containment and symlink rejection.
- FFprobe metadata probing and bounded FFmpeg work.
- Subtitle sidecar size cap and sanitised API errors.
- API request guard with tighter limits for generated media routes.

SQLite persistence, filesystem watchers, codec badges and automatic remuxing were not added. These changes would introduce additional architecture and should be driven by measurements and real-media tests, not by audit suggestions alone.

## Runtime issue fixed

The prior runtime attempted to `require('./lib/media-security')`, which failed when the helper module was absent from the active project folder. The required path and range helpers are now defined inside `server.js`, removing that separate module dependency. The package version is `1.0.3`, matching the runtime and cache-busting identifiers.

## Product constraints preserved

- No sign-in, login prompt, credentials, HTTP authentication or account layer.
- No custom text-selection colour; native text selection and copying remain intact.
- No visible redesign or altered core player behaviour.

## Verification

- 30/30 automated tests passed.
- `node --check server.js` and `node --check script.js` passed.
- CSS parser: zero syntax errors.
- 154 DOM IDs, all unique.
- Chromium mock test: offline banner visible, counter says OFFLINE, Retry recovers, one H1, navigation updates the page heading, sampled visible buttons/links named, search focus visible, no page errors and no horizontal overflow at 390px.

## Not yet verified

The Chromium test used mocked API responses, not the Express server. Dependency installation did not complete in the build environment, so a live `npm start` test is still required on Ubuntu. Real screen-reader testing, every complex-gradient contrast combination, actual media seeking, codec handling and real subtitle extraction are not certified by this review.
