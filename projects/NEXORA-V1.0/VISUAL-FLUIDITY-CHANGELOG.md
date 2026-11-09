# V1.0.7 visual fluidity changelog

- Live video frame sampling now drives the ambience rather than a one-time thumbnail capture.
- Two reusable canvas layers are crossfaded only after an incoming frame is ready.
- Colour palette changes are low-pass filtered to avoid abrupt hue pops.
- Ambient processing is capped according to device capability and reduced-motion preferences.
- Glass surfaces use translucent material layers with fine specular edges and small, local backdrop diffusion.
- Main page scrolling remains native; no JavaScript scroll simulation was introduced.
