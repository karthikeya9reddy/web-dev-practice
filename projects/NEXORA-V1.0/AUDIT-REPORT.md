# NEXORA V1.1.0 — God Mode Audit & Hardening Report

**Audit basis:** User-supplied `NEXORA-V1.0.9-MOBILE-FLUIDITY-REPAIR.zip` and its included V1.0.8/V1.0 source snapshots.  
**Working release:** V1.1.0.  
**Original archive:** preserved untouched outside the working release.  
**Overall status:** Partial engineering hardening completed; full production/scalability certification is not complete.

## 1. Executive summary

The V1.0.9 project was inspected independently rather than accepting its included report as proof. Its 50-test claim and included browser checks were independently rerun. The supplied scroll fixture was variable across repeated runs; see `BROWSER-AUDIT/SCROLL-REPEATABILITY-NOTE.md`. The existing Node regression tests were extended with new runtime tests for the added bounded FFprobe semaphore and static regression checks for library scanning, diagnostics, stream cleanup and HEAD handling.

The V1.1.0 working release makes targeted backend hardening changes while keeping the V1.0.9 frontend logic and visual rules unchanged. It adds bounded FFprobe execution, safer handling of large recursive library results, cached library JSON serialization, cached/single-flight diagnostics, cleanup of media read streams on client disconnect, and HEAD short-circuiting for media and download requests.

The code passed syntax checks and 60/60 Node tests, and the latest completed included Chromium geometry/scroll fixture passed 6/6. The scroll fixture showed run-to-run variability, documented separately. These checks do not establish that NEXORA is production-ready for bulk audiences. A live Express runtime test and realistic concurrency/load test were blocked because dependency installation could not reach the npm registry and the archive did not include the media library.

## 2. Scope and baseline integrity

### Inputs inspected

- Active V1.0.9 files: `server.js`, `script.js`, `index.html`, `style.css`, `package.json`, `package-lock.json`.
- Preserved V1.0.8 source snapshot and SHA-256 manifest.
- Earlier V1.0 baseline snapshot.
- Existing tests, generated WebM fixtures, browser audit script, browser audit JSON/screenshots and release reports.

### Baseline verification

- The included V1.0.8 manifest hashes matched all six preserved baseline source/configuration files.
- The supplied V1.0.9 `RELEASE-MANIFEST.sha256` did **not** match seven files in the archive: `AUDIT-REPORT.md`, `BROWSER-AUDIT/BROWSER-AUDIT-OUTPUT.txt`, `BROWSER-AUDIT/BROWSER-AUDIT.json`, `MOBILE-FULLSCREEN-AND-NAV-AUDIT.md`, `RELEASE-VERIFICATION.json`, `TEST-OUTPUT.txt` and `tests/run-browser-audit.py`.
- This appears to be a stale release manifest rather than evidence that the application source was corrupted. V1.1.0 receives a newly generated manifest covering its shipped files.
- A separate `BASELINE-V1.0.9/` directory preserves the six original V1.0.9 active source/configuration files for rollback.

## 3. Findings discovered and fixes implemented

### Finding 1 — FFprobe was not consistently bounded

**Severity:** High for concurrency/resource management.  
**Evidence:** The existing FFmpeg semaphore covered thumbnail/preview encoding work, but primary video-stream discovery and embedded-subtitle discovery invoked `ffprobe` directly. Requests for many distinct media files could therefore start more metadata-probe processes than the configured FFmpeg process limit implied.

**Fix:** Added an independent FFprobe semaphore with a default of two active jobs and a bounded queue of 64 waiters. Primary stream inspection, embedded-subtitle probing, scene-duration metadata and diagnostics now use the probe gate. Queue saturation rejects work with a retryable busy error rather than allowing an unbounded child-process burst.

**Verification:** Added behavioural tests proving the active limit is not exceeded and a full waiting queue rejects additional work. Related source-path checks are also included in `tests/scalability-hardening.test.js`.

### Finding 2 — recursive library scanner used spread arguments for nested arrays

**Severity:** Moderate; can become high for very large/deep libraries.  
**Evidence:** `files.push(...nested.files)` and `folders.push(...nested.folders)` pass the entire nested result as function arguments. Very large arrays can exceed JavaScript's argument-count limit.

**Fix:** Replaced the spread appends with ordered `for...of` loops. File/folder ordering and result content remain unchanged.

**Verification:** Regression assertion confirms the spread form is absent and iteration is used.

### Finding 3 — the same library JSON was serialised for every visitor

**Severity:** Moderate under concurrent browsing.  
**Evidence:** The server cached the scanned library object for 15 seconds, but each `/api/library` request still used `res.json`, repeating JSON serialisation of the same catalogue for every visitor.

**Fix:** The JSON payload is now built once when the cached snapshot refreshes and reused for requests during the existing 15-second window. The JSON schema, file order and `Cache-Control: no-store` policy remain unchanged.

**Trade-off:** The cached object and its serialised string coexist in memory. This saves repeated CPU work but adds a second representation of the catalogue. Real-library memory profiling is still required to confirm the right trade-off for the user's library size and RAM budget.

### Finding 4 — diagnostics repeated expensive FFmpeg/FFprobe work

**Severity:** Moderate; potentially significant if the endpoint is polled or hit concurrently.  
**Evidence:** `/api/diagnostics` ran tool checks on each request and performed a second `ffmpeg -encoders` invocation after already checking encoders. Concurrent diagnostics requests could start repeated child processes.

**Fix:** Diagnostics now use the appropriate FFmpeg/FFprobe process gates, a single encoder scan, single-flight execution and a 30-second capability-result cache. Active-process counts remain live in each response.

**Verification:** Regression test checks the cache, in-flight coalescing, process gates and single encoder scan.

### Finding 5 — disconnected streaming clients did not explicitly release read streams

**Severity:** High for long media streams and resource exhaustion.  
**Evidence:** `/api/stream` created file read streams but did not explicitly destroy them when the HTTP response closed early. `/api/download` already had this cleanup.

**Fix:** Full-file and byte-range media streams now destroy their read stream when the response closes.

**Verification:** Added regression assertions for both stream paths. Live socket-disconnect integration remains untested because Express could not be installed in this environment.

### Finding 6 — HEAD requests could enter GET streaming handlers

**Severity:** Moderate for avoidable disk I/O and file-handle consumption.  
**Evidence:** Express normally falls back to a GET handler for HEAD when there is no explicit HEAD handler. Direct `createReadStream(...).pipe(res)` flows could consequently do unnecessary file work for a header-only request.

**Fix:** Full and ranged stream requests return their appropriate headers without opening a read stream for HEAD. Download HEAD requests also end after setting headers.

**Verification:** Added regression assertions. A real Express HEAD request test remains outstanding.

### Finding 7 — supported runtime range includes end-of-life Node versions

**Severity:** High operational/security hygiene.  
**Evidence:** Original package metadata declared `node >=18`, which permits Node 18 and Node 20, both end-of-life by the audit date.

**Fix:** Updated package and lockfile engine metadata to `node >=22`. No runtime dependency changed.

**Deployment requirement:** Use a current patched supported LTS release. The test environment had Node 22.16.0, which is not the latest patch in that line; production should use the latest security-patched runtime.

### Finding 8 — precomputed search index was built but not used

**Severity:** Moderate for large catalogues and repeated typing.
**Evidence:** `loadLibrary` populated `state.searchIndex`, but `applyFilters` rebuilt and lowercased the metadata/folder search text for every candidate on each search update. This created avoidable repeated string/array work in a keystroke-driven path.
**Fix:** The index now includes the complete folder path terms and `applyFilters` reuses the precomputed per-file string, retaining a fallback for files missing from the index. Search matching still includes filename, path, category, genre, subgenre and nested folder terms.
**Verification:** Added a regression test for index construction and use. A mocked full-page large-library browser run is still required to measure the user-visible gain on the target device.

## 4. Changes made to release V1.1.0

### Backend (`server.js`)

- Added bounded FFprobe process scheduling.
- Moved scene-duration metadata work from the FFmpeg encoder slot to the FFprobe slot.
- Bounded primary video stream and embedded subtitle probes.
- Added reusable library JSON payload caching per existing snapshot.
- Added a single-flight 30-second diagnostics cache.
- Removed the duplicate encoder scan.
- Routed diagnostics subprocesses through process gates.
- Added stream cleanup on response close for both normal and ranged stream responses.
- Added HEAD short-circuiting for streaming and download routes.
- Reused the already-built per-file search index during search filtering, including nested folder terms, instead of rebuilding search text on every query update.
- Updated release/version metadata.

### Frontend preservation

- `script.js` differs from V1.0.9 only in the internal search-index reuse described above; no user-facing feature behaviour or design change was intended.
- `style.css` differs only in its release comment; no visual rule changed.
- `index.html` differs only in the CSS/JS cache-busting version query strings.
- No markup, visual CSS rules, animation definitions, player interaction flows or layout code were changed in V1.1.0.

### Dependency policy

- No new runtime dependency was added.
- Express remains `^5.3.0`.
- The lockfile dependency graph remains the same; only package version and Node engine metadata changed.

## 5. Tests actually executed

| Test | Result | Notes |
|---|---:|---|
| `node --check server.js` | Pass | V1.1.0 source |
| `node --check script.js` | Pass | Unchanged V1.0.9 frontend JS |
| `npm run check` | 60/60 pass | Includes 10 dedicated scalability hardening tests |
| Chromium browser audit | 6/6 latest completed run | Wrapped navigation, fullscreen geometry/aspect ratios and synthetic 32-card scroll fixture; earlier scroll result was noisy and one retry timed out |
| Chromium CSSOM parse | Pass | 1,313 total CSS rules parsed |
| V1.0.8 source manifest | 6/6 match | Original baseline hashes |
| V1.0.9 source manifest | 7 stale hashes | Existing manifest inconsistency found |
| Fresh ZIP extraction smoke test | PASSED | ZIP integrity clean; 68/68 manifest entries verified after extraction; 60/60 Node tests passed from extracted copy |

## 6. Important limitations — not certified

The following tasks were not completed and must not be represented as passed:

1. **Live Express startup and HTTP integration:** `npm ci` could not complete because registry requests failed with `EAI_AGAIN` for `registry.npmjs.org`; Express was unavailable in the environment.
2. **Exact lockfile dependency audit:** `npm audit` could not be completed because the npm registry was unreachable. Public vulnerability lookup indicated no direct known advisory for Express 5.3.0, but that is not a substitute for an exact lockfile `npm audit` including transitive dependencies.
3. **Real media integration:** The archive did not contain the user's `Entertainment` directory. Included WebM files are test fixtures only.
4. **Large-library profiling:** No real library size/count or real image/network decode workload was available.
5. **Bulk-user load test:** No concurrent HTTP/media load test was run. No maximum user capacity is claimed.
6. **Production tunnel test:** No live Cloudflare Tunnel/origin setup was supplied or exercised.
7. **Physical Android test:** Not run. OS system-bar/immersive fullscreen behaviour remains device/browser dependent.
8. **120 Hz performance:** Not measured. The included scroll fixture runs at approximately 60 Hz in the headless Linux browser.
9. **Full-page UI INP/click profiling:** Not performed. The included browser audit focuses on synthetic navigation geometry, fullscreen fixtures and a 32-card scroll fixture; it does not load the full production application with the real media library.
10. **Endurance and failure injection:** No long-duration production workload, process restart, real disconnect storm or memory-pressure test was performed.

## 7. Outstanding infrastructure risks and recommendations

### Public exposure without sign-in

The server defaults to `HOST=0.0.0.0`, exposes `/api/library`, `/api/stream` and `/api/download`, and has no built-in authentication by explicit product requirement. If published through a public Cloudflare Tunnel, visitors who can reach the hostname can access the exposed catalogue and media routes. The current per-process IP bucket limiter is useful as an application guard but is not equivalent to an edge firewall, distributed rate limiter or access-control boundary.

For a public audience, configure Cloudflare edge DDoS/WAF and rate-limiting rules, restrict direct origin reachability to the tunnel, and decide explicitly which library/media paths are intended to be public. Do not add in-app authentication without user authorisation.

### Cloudflare cache and origin bandwidth

The `/api/stream` route sends `Cache-Control: no-store`. Cloudflare's documented default cache behaviour bypasses responses carrying `no-store`, `private`, `no-cache` or `max-age=0`. Therefore, normal media streams are not edge-cache hits under the current response policy; each viewer's media bytes must be supplied by the origin path. This makes origin upload bandwidth and storage throughput hard ceilings for concurrent streaming. Do not change the `no-store` policy without deciding whether the media is public and what privacy/caching behaviour is acceptable.

### Reverse proxy topology

The app trusts loopback proxies. Verify that `cloudflared` reaches Node through a loopback address and that the client IP is forwarded as expected. If the proxy runs in a separate container/host, `req.ip` may resolve to the proxy address and the per-IP limiter may group many users together unless the trusted-proxy configuration matches the actual topology.

### Large catalogue transfer size

The application still returns the entire library metadata catalogue in `/api/library` and marks it `no-store`. V1.1.0 reduces repeated server-side serialization but does not reduce the response body size or bytes transferred to each user. Backward-compatible catalogue pagination, conditional revalidation or a shared metadata cache would require a separate client/API compatibility design.

### Stream concurrency and machine limits

There is no measured active-media-stream cap in this release. The practical limit depends on open file descriptors, disk throughput, RAM, CPU, upload bandwidth, codec/bitrate mix and proxy behaviour. A controlled load test on the actual host is required before selecting a stream cap or claiming bulk-user readiness.

### Runtime support

The Node engine floor is now 22. Use a currently patched supported LTS version and rerun tests on the deployment runtime. The Node release schedule marks Node 18 and 20 as end-of-life; current supported LTS lines include 22, 24 and 26.

## 8. Final certification matrix

| Area | Verdict | Reason |
|---|---|---|
| V1.1.0 JavaScript syntax | PASSED | Node syntax checks passed |
| Existing automated regression suite | PASSED | 60/60 tests |
| Bounded FFprobe limiter | PASSED WITH LIMITATIONS | Behaviour tested in isolation; no live route integration |
| Large nested scanner merge | PASSED WITH LIMITATIONS | Source change and regression check; no enormous real library scan |
| Library JSON cache | PASSED WITH LIMITATIONS | Source/test verification; real memory/CPU profile absent |
| Diagnostic single-flight/cache | PASSED WITH LIMITATIONS | Unit/source verification; no live process endpoint test |
| Stream disconnect/HEAD handling | PASSED WITH LIMITATIONS | Source assertions; no live Express socket integration |
| Existing visual/functional preservation | PASSED WITH LIMITATIONS | No design/markup/style changes; internal search index reuse added; full app device comparison not run |
| Mobile fullscreen fixture | PASSED WITH LIMITATIONS | Chromium geometry only; physical Android not tested |
| Scroll stress fixture | PASSED WITH LIMITATIONS | Latest completed run: 4/4 clean trials, median P95 ~16.8 ms; earlier run had one 244 ms long task and a retry timed out |
| Full UI click/INP performance | NOT TESTED | No full-page real workload trace |
| Real media pipeline | NOT TESTED | No Entertainment library and Express unavailable |
| Dependency audit | NOT TESTED | npm registry DNS unavailable |
| Production concurrency capacity | NOT TESTED | No live deployment/load environment |
| Cloudflare Tunnel resilience | NOT TESTED | No deployed tunnel available |
| Endurance/failure injection | NOT TESTED | Requires controlled live runtime |

## 9. Final verdict

V1.1.0 is a **targeted internal hardening release**, not a completed God Mode production certification. It fixes several genuine backend scalability weaknesses discovered in the supplied V1.0.9 code while keeping the frontend behaviour and visual rules unchanged. All locally executable syntax, Node regression and included Chromium fixture checks passed.

The most consequential remaining work is to install the exact dependencies on the user's machine or a connected build host, run live Express/FFmpeg integration against the real media library, profile the full UI on the target devices, and execute progressive mixed browsing/streaming load tests through the actual Cloudflare Tunnel and origin network.
