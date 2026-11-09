# V1.0.7 scroll performance note

The live ambience does not apply a large CSS blur to a fixed full-screen image during scrolling. Instead, each low-resolution preview sample is preprocessed into a 480×270 canvas at a bounded capture frequency, then displayed as a composited opacity layer. The glass content surfaces use a restrained backdrop blur (5px desktop, 3px mobile for large containers). Main scrolling remains native and no custom scroll loop was added.

This is a rendering-cost reduction strategy, not proof of 120fps. Browser compositor behaviour, display refresh rate, integrated GPU, memory pressure and the media being played all affect actual frame pacing. A Chrome/Chromium Performance trace on target hardware remains required.
