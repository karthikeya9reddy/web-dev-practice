# Chromium scroll-test repeatability note

The latest completed browser-audit run passed all 6 checks. Its synthetic 32-card grid scroll test completed 4/4 clean trials, with a median P95 frame interval of approximately 16.8 ms and no observed Long Tasks.

A separate earlier run in the same audit session passed the five navigation/fullscreen geometry checks but failed the scroll stress check: one trial observed a 244 ms Long Task and a P95 frame interval around 33.3 ms. A subsequent retry timed out before producing a complete result. A later completed retry passed 6/6.

This run-to-run variability is retained as a limitation rather than hidden. The fixture is synthetic, headless and host-dependent. It is not evidence of physical Android smoothness, a 120 Hz result, or full-app responsiveness with the actual media library. Full-device profiling remains outstanding.
