# Living Cinema implementation notes

## Preview-driven ambience

The renderer consumes the existing `previewVideo` element used for the hero/global preview. It does not create or play a second video element. `requestVideoFrameCallback` is used when supported, with a timer fallback.

Each accepted frame is drawn into the inactive 480×270 canvas layer. The source crop follows a cover calculation and is processed using a canvas filter (`blur(15px)`, saturation, brightness and contrast). A tiny 24×14 canvas samples colour, skipping near-black pixels; the RGB target is low-pass filtered with a 1.35-second time constant. Additional radial colour washes are rendered into the same canvas.

The inactive layer is made visible only after its first valid frame has been rendered. The incoming and outgoing layers crossfade through CSS opacity over 2.1 seconds. The frame callback is cancelled when the active preview stops or changes; the last visible ambience remains until an incoming layer is ready.

Sampling is capped at about 12Hz for regular devices, about 4Hz when data saver/low device memory/low hardware concurrency is detected, and about 2.4Hz when reduced motion is requested. This sampling rate controls only decorative ambience capture; it does not modify the video preview playback rate.

## Glass surfaces

The visual styling uses layered translucency, fine border reflections, subtle inner highlights, controlled shadows and restrained backdrop diffusion. Large content sections use a 5px backdrop blur on desktop and 3px on small screens; compact controls use higher local blur where appropriate. The actual text and cards are not blurred. `prefers-reduced-transparency` keeps a readable opaque fallback.

## Scroll/performance intent

The ambience is preprocessed into a small canvas and the fixed full-screen CSS layers do not run a large CSS filter on every scroll frame. Main page scrolling is native (`scroll-behavior: auto`); no custom scroll interpolation or scroll listener was added. The ambience layer uses `contain: paint` and opacity transitions.

## Known limitations

No target-machine 120Hz frame trace, memory profile, or real-library stress test was performed in this environment. 120fps is a device/display-dependent target, not a verified guarantee. The next practical validation is a browser performance trace on the user's Ubuntu machine, with a real media library and 60Hz/120Hz displays if available.
