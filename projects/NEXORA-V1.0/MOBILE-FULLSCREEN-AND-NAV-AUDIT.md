# Mobile Fullscreen & Navigation Browser Audit

All measurements were captured in Chromium headless on Linux using actual generated WebM video files and the release stylesheet. These are browser geometry checks, not a physical Android certification.

## Fullscreen framing

Landscape viewport: 915×412. Portrait viewport: 412×915. In every test, the fullscreen stage occupied the whole browser viewport from (0,0), and the video used centred `object-fit: contain`.

| Orientation | Source ratio | Viewport | Contained picture | Result |
|---|---:|---:|---:|---|
| Landscape | 16:9 | 915×412 | 732.44×412.0 | Pass |
| Landscape | 4:3 | 915×412 | 549.33×412.0 | Pass |
| Landscape | 21:9 | 915×412 | 915.0×392.14 | Pass |
| Portrait | 16:9 | 412×915 | whole source frame contained | Pass |

The fullscreen stage uses the dynamic viewport (`100dvh`, with fallback), fills the fullscreen element, and keeps the whole source picture visible. Letterboxing is expected when source and display ratios differ; cropping is not. Controls are inset from safe-area edges. Android OS bars may still depend on browser and vendor immersive-mode policy, which a webpage cannot universally override.

## Wrapped navigation indicator

Mobile viewport: 345×800. The selected Anime button is on the second row at offset (5, 44) with size 66.27×36px. After the 420ms selection transition settled, the indicator measured 66×36px and its transform matched the same x/y offset. It did not stretch over other rows.

## Scrolling stress fixture

Four independent warmed-up runs of the 32-card synthetic mobile grid were measured for 2 seconds each. All 4/4 runs had zero Long Task entries during the measured scroll interval. The median frame interval was 16.7ms and the median of per-run p95 frame intervals was 16.8ms. Each run recorded 121 animation frames over the two-second window.

The audit harness was corrected after an earlier version observed Long Tasks with `buffered: true` after the warm-up, which could include page-setup tasks from before scrolling began. The current observer starts without buffering, so it records only tasks that occur during the measured scroll interval. The current results are 4/4 clean runs. These are host-browser results at approximately 60Hz, not an Android or 120Hz measurement.

## Repeatable artifacts

- `tests/run-browser-audit.py` runs the Chromium browser checks when Python Playwright and a Chromium binary are installed.
- Three small video fixtures are packaged under `tests/fixtures/` (16:9, 4:3, 21:9).
- `BROWSER-AUDIT/mobile-navigation.png` shows the wrapped second-row indicator.
- `BROWSER-AUDIT/fullscreen-landscape-16x9.png` shows the landscape fullscreen sample.
- `BROWSER-AUDIT/fullscreen-portrait-16x9.png` shows the portrait fullscreen sample.
- `BROWSER-AUDIT/BROWSER-AUDIT.json` contains raw trial measurements and limitations.

## Remaining device validation

Confirm on the target Android handset that the browser hides its own chrome as expected, system bars behave acceptably, and real media playback remains smooth. Sustained 120Hz performance requires a 120Hz device trace.
