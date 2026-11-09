# Exact next action

## Resume point

Continue from the supplied **NEXORA V1.1.0 — God Mode targeted hardening** source. Do not rebuild the app from scratch and do not treat the prior report as production certification.

## Next engineering sequence

1. Verify the current release archive and `RELEASE-MANIFEST.sha256`.
2. Use a network-enabled build environment to run `npm ci` from the exact lockfile and an `npm audit`/dependency review. Record Node/npm versions and full output.
3. Run Express integration tests using temporary media fixtures; test API routes, media HEAD, byte ranges, client disconnect cleanup, bounded FFprobe work and diagnostics.
4. Profile the full app: click-to-next-paint/INP, scroll frame pacing, long tasks, Liquid Glass compositing, memory and CPU. Use reproducible browser/device conditions.
5. Run realistic mixed browsing + streaming load tests on the actual origin/topology. Record workload shape, concurrency, p50/p95/p99, errors, CPU, RAM, disk, network and saturation point. Do not invent user capacity.
6. Review and fix verified findings in small changesets; run focused tests and full regression after each phase.
7. Perform the independent OMEGA second-pass review and update the final report.
8. Track the Live AI Subtitle Engine as a separate implementation workstream: architecture selection, audio-capture feasibility, self-hosted ASR/model/licence review, single shared session for expanded and mini-player, latency/accuracy benchmarks, resource limits and failure handling. Existing subtitle support must remain intact.

## Completion rule

No production-scale or live-subtitle feature claim is allowed until the corresponding real integration, resource and regression tests pass. If environment constraints prevent a test, mark it INCOMPLETE/NOT TESTED and preserve the exact blocker for the next session.
