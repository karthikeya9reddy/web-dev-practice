# NEXORA V1.0.5 — Visual Experience Research

**Research date:** 9 November 2026  
**Scope:** Visual design, interaction feel, animation, rendering smoothness, discovery presentation, and ethical repeat-use design.  
**Explicitly out of scope:** Playback logic, player state, mini-player logic, media scanning, API routes, server behavior, data models, navigation semantics, feature additions/removals, authentication, and text-selection behavior.

## Executive direction

NEXORA does not need more motion for its own sake. It needs a more deliberate visual rhythm: fast feedback for frequent actions, graceful transitions where context changes, rich but restrained atmosphere, and a clear distinction between the cinematic controls and the media content itself.

The design objective is **premium, fluid and inviting—not addictive or attention-extractive**. Repeat visits should be earned through a comfortable, legible library, useful discovery, recognisable visual identity, and frictionless return to existing content—not by exploiting variable rewards, endless feeds, fake urgency, or pressure notifications.

## What the research supports

### 1. How people discover content on streaming services

A 2026 paper, *Contingent Discoverability: Understanding Platform Guidance and User Autonomy on Streaming Services*, analyses a weighted national web survey of 1,501 people in Norway. The underlying survey was conducted in November 2022, so the article is recent but its behavioural data are not a 2026 live measurement. The results describe multiple modes rather than one universal user journey:

- **76%** reported sometimes or often exploring categories or genres (28% often, 48% sometimes).
- **55%** reported always or often browsing by scrolling through titles (13% always, 42% often).
- **63%** used “My List” / “My Content” to save titles for later (28% often, 35% sometimes).
- **64%** used algorithm-based recommendations in exploratory browsing (23% often, 41% sometimes).
- **64%** used recommendations based on viewing history (23% often, 41% sometimes).
- **84%** found content through recommendations from friends or family (31% often, 53% sometimes).

The study distinguishes searching for a known title, browsing without a specific target, monitoring for relevant content, and becoming aware of content through external cues. It also warns that platform organization and recommendations can shape what users discover. This is useful evidence for making NEXORA's existing search, category/genre browsing, Recently Added, saved items and Continue Watching surfaces easy to scan. It is **not** evidence that a particular animation or visual trick increases retention, and it is not globally representative: it is one national sample with a specific age, market and broadband context.

A numerical caution: the paper states that 88% often or sometimes use search, but the parenthetical components shown alongside that total (39% + 44%) add to 83%. This report intentionally does not use the 88% figure as a precise benchmark.

Source: [Solvoll et al., “Contingent Discoverability” (2026)](https://journals.sagepub.com/doi/full/10.1177/15274764251410583), especially Methods and Data and Descriptive Findings.

### 2. What good motion should feel like

Apple's Human Interface Guidelines describe motion as a way to communicate feedback, preserve context and make transitions understandable—not as decoration that runs constantly. Frequent interactions should feel immediate; movement should be purposeful and brief, and users should not be trapped in long transitions. Apple's guidance is directly relevant to NEXORA's cinematic identity, but it should be interpreted as a design principle rather than copied as a literal timing prescription.

For web rendering, web.dev recommends preferring `transform` and `opacity` for animation where possible. Animating layout- or paint-triggering properties can cause work that harms smoothness. Blur and shadow effects can be expensive to paint; `will-change` should not be applied indiscriminately because unnecessary layer promotion can itself create costs. Chrome DevTools' Performance, FPS meter and Paint Flashing tools are appropriate ways to diagnose real jank.

Useful performance targets:

- Treat **60 frames per second** as a common visual target where the device can sustain it; each frame has roughly **16.7 ms** available at 60 Hz. This is a frame-budget concept, not a promise that every 2 GB device will sustain 60 fps during video decode.
- Use **Interaction to Next Paint (INP) ≤200 ms at the 75th percentile** as the “good” responsiveness target. INP captures user interaction latency over a visit; it is not the same as animation frame rate.
- Assess actual devices and interactions. A CSS-only unit test cannot prove low dropped-frame rates, and a desktop benchmark cannot stand in for a constrained laptop or phone.

Sources:

- [Apple Human Interface Guidelines — Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
- [web.dev — How to create high-performance CSS animations](https://web.dev/articles/animations-guide)
- [web.dev — Optimize Interaction to Next Paint](https://web.dev/articles/optimize-inp)
- [web.dev — Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds)

### 3. Liquid Glass should frame content, not compete with it

Apple's Materials guidance positions Liquid Glass primarily as a material for the functional layer—navigation, toolbars, controls and transient UI—while standard materials are generally better for content surfaces. This distinction matters especially for NEXORA, where poster artwork and video imagery should remain visually dominant.

The practical direction is:

- Keep the recognisable glass treatment on the top navigation, floating player, player controls and transient overlays.
- Use more stable, opaque/standard surfaces for shelves, grids, taxonomy, cards and long text regions.
- Reserve the strongest translucency for controls that sit over moving artwork; increase opacity where legibility is at risk.
- Keep ambience behind content as atmosphere rather than making every content surface translucent.

Source: [Apple Human Interface Guidelines — Materials](https://developer.apple.com/design/human-interface-guidelines/materials).

### 4. Expressive design can improve clarity—but intensity is not the goal

Google Research's 2026 CHI study compared designs across 10 applications with 48 participants. In that study, Material 3 Expressive designs were associated with participants fixating on the correct screen element 33% faster, completing tasks 20% faster, and rating the experiences more positively than earlier Material designs. This is a small, controlled mobile-app study, not a guarantee that a more expressive NEXORA interface will produce the same result. Its useful lesson is that visual hierarchy, emphasis and recognizable controls can improve findability when applied thoughtfully.

Source: [Google Research — Usability Hasn't Peaked (CHI 2026)](https://research.google/pubs/usability-hasnt-peaked-exploring-how-expressive-design-overcomes-the-usability-plateau/).

### 5. Repeat use: useful familiarity versus addictive design

There is a meaningful difference between helping someone return because a product is useful and pressuring them to stay longer than intended. The UK Centre for Data Ethics and Innovation's AI Barometer describes autoplay, infinite scrolling, push notifications, dark patterns, reciprocity and variable rewards as persuasive-design patterns that may contribute to excessive use, particularly in combination. The report also notes that the boundary is context-dependent and that a feature can be useful in one circumstance while contributing to overuse in another.

A 2025 study of streaming interface features (287 young adults; cross-sectional survey) examined perceived usability and attitudes around recommendations, previews and autoplay. It should not be read as causal proof that autoplay creates addiction or improves retention. The safe lesson is to keep playback and discovery features legible and under user control.

**NEXORA's ethical retention principle:** make the library worth returning to; do not make it hard to leave.

Use visual design to reinforce existing, user-beneficial features:

- Make Continue Watching easy to recognise so users can resume intentionally.
- Give Recently Added and existing genre/category areas a clear scan path.
- Present saved items and favourites as dependable personal organization, not as rewards that expire.
- Keep search visually obvious and immediately available.
- Let users understand where they are and how to return to the previous context.
- Avoid fake scarcity, streaks, random reward animations, deceptive notification badges, forced autoplay, infinite-feed traps or guilt-based reminders.

Sources:

- [UK Government — CDEI AI Barometer, Addictive Design](https://www.gov.uk/government/publications/cdei-ai-barometer/cdei-ai-barometer)
- [Designed to binge? Exploring user perceptions of interface features on video streaming platforms (Acta Psychologica, 2025)](https://doi.org/10.1016/j.actpsy.2025.105210)

### 6. Motion accessibility is part of premium quality

WCAG 2.2's Animation from Interactions guidance explains that non-essential interaction-triggered motion can cause dizziness, nausea, headaches or distraction for some people. It identifies `prefers-reduced-motion` and a user preference to prevent animation as sufficient techniques. NEXORA should preserve its reduced-motion handling and never make essential information depend on decorative movement.

Source: [W3C — Understanding SC 2.3.3: Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions).

## NEXORA V1.0.5 visual direction

### Visual principles

1. **Cinema first:** artwork and video are the focus. Controls provide context without competing with the content.
2. **Glass with restraint:** glass is reserved for functional chrome and floating controls; content shelves use stable surfaces.
3. **Immediate micro-feedback:** card hover, filters and small controls respond quickly and consistently.
4. **Cohesive transitions:** larger surfaces move with a softer curve, but do not hold up frequent navigation.
5. **Low repaint area:** avoid broad blur and oversized shadows across large regions; favor transform/opacity and restrained local effects.
6. **Legibility under ambience:** preserve contrast over gradients and moving artwork.
7. **Respect motion preferences:** reduced-motion and reduced-transparency preferences must remain effective.
8. **Predictability:** keep layout, control placement and hierarchy consistent so the user can build familiarity.

### Practical timing system

The following are NEXORA design tokens, not universal user-preference facts:

| Interaction | Candidate duration | Intent |
|---|---:|---|
| Hover/focus/control feedback | 160–190 ms | Feels immediate |
| Card poster response | 250–300 ms | Allows a controlled visual settle |
| Navigation/surface transition | 220–280 ms | Maintains context without delay |
| Large cinematic/ambient transition | 600–700 ms | Soft atmosphere, used sparingly |

Actual perceived smoothness depends on frame pacing, device load, video decode, paint cost and input latency—not duration alone.

### Locked functionality: visual-only contract

V1.0.5 is deliberately restricted to presentation-layer work. `server.js` and `script.js` must remain byte-identical to V1.0.4. The only HTML change is the stylesheet cache-busting version. Package metadata may identify the release, but runtime dependencies and application behavior must not change.

The following are frozen: media routes, media scanning, search semantics, collection state, navigation actions, playback, hero preview, card preview, mini-player playback and the mini-player hover repair. No sign-in/authentication feature and no custom text-selection highlighting are allowed. Normal browser text selection remains enabled.

## Visual-only roadmap

### Phase A — Motion and perceived speed

- Measure card hover, shelf scrolling, navigation transitions, player overlays and mini-player movement on real hardware.
- Inspect frame drops, paint flashing and rendering work in DevTools.
- Reduce the area affected by blur/shadow; avoid global layer promotion.
- Keep animation on transform/opacity where visually suitable.

### Phase B — Composition and hierarchy

- Refine typography scale, weight, line length and metadata contrast.
- Tune poster size, spacing, title alignment and shelf rhythm.
- Improve artwork-to-interface balance without changing card information or click behavior.
- Refine light falloff, border treatment and glass material depth while keeping content surfaces legible.

### Phase C — Micro-detail

- Tune hover/focus states, active navigation indicators, button press feedback and transition easing.
- Ensure motion never obscures labels or creates layout jumps.
- Preserve consistent interaction timing across similar components.

### Phase D — Device validation

Test on the actual Ubuntu setup, a mobile viewport and a constrained 2 GB environment. Record:

- FPS and dropped-frame percentage while scrolling and hovering.
- INP for representative click, keypress and tap actions.
- LCP and CLS on initial load.
- memory use during prolonged browsing and video playback.
- subjective ratings for visual quality, smoothness and ease of discovery.

Core Web Vitals thresholds are useful external benchmarks, but NEXORA should also be tested against the actual tasks that matter for a local media library.

## Limitations and interpretation

- “Modern users” are not one homogeneous group. Preferences vary by age, device, culture, accessibility needs, content library and network conditions.
- The streaming survey's data were gathered in Norway in November 2022 and published in a 2026 article. It is directional, not universal or a current global poll.
- Google Research's expressive-design results come from a 48-participant controlled study over 10 mobile applications; they should inform hierarchy, not justify indiscriminate decoration.
- The CDEI discussion explains risk patterns; it does not prove every use of autoplay, recommendations or scrolling is harmful.
- CSS tests prove source constraints, not real-world FPS. Device-side profiling and user feedback remain necessary.

## References

1. Apple, [Motion](https://developer.apple.com/design/human-interface-guidelines/motion).
2. Apple, [Materials](https://developer.apple.com/design/human-interface-guidelines/materials).
3. Solvoll, Kristensen, Tallerås & Øfsti (2026), [Contingent Discoverability](https://journals.sagepub.com/doi/full/10.1177/15274764251410583).
4. Google web.dev, [High-performance CSS animations](https://web.dev/articles/animations-guide).
5. Google web.dev, [Optimize INP](https://web.dev/articles/optimize-inp).
6. Google web.dev, [Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds).
7. W3C WAI, [Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions).
8. UK Government CDEI, [AI Barometer — Addictive Design](https://www.gov.uk/government/publications/cdei-ai-barometer/cdei-ai-barometer).
9. Google Research, [Usability Hasn't Peaked (CHI 2026)](https://research.google/pubs/usability-hasnt-peaked-exploring-how-expressive-design-overcomes-the-usability-plateau/).
10. Acta Psychologica (2025), [Designed to binge?](https://doi.org/10.1016/j.actpsy.2025.105210).
