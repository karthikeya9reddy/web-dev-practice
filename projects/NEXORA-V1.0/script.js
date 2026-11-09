(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const byId = id => document.getElementById(id);

  const CATEGORY = {
    movies: "Movies",
    anime: "Anime",
    music: "Music",
    documentaries: "Documentaries",
    series: "Web-Series",
    library: "All",
    favourites: "Favourites"
  };

  function safeRead(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function safeWrite(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`[NEXORA] Storage write failed: ${key}`, error);
    }
  }

  const storedFavourites = safeRead("nexora-favourites", []);
  const storedProgress = safeRead("nexora-progress", {});

  const state = {
    files: [],
    fileById: new Map(),
    folders: [],
    page: "discover",
    genre: "All",
    subgenre: "All",
    folderPathFilters: [],
    picksIds: [],
    query: "",
    sort: "recent",
    favourites: new Set(Array.isArray(storedFavourites) ? storedFavourites : []),
    progress: storedProgress && typeof storedProgress === "object" ? storedProgress : {},
    ambientBackIndex: 0,
    ambientCaptureToken: 0,
    ambientFrameCallbackId: null,
    ambientFrameTimer: null,
    ambientPaletteRgb: [88, 114, 153],
    ambientPreviewTimer: null,
    heroFeaturedId: null,
    featuredSequenceLastId: null,
    heroTimer: null,
    heroPreviewWaiting: false,
    heroPreviewFailsafeTimer: null,
    heroTransitionCleanupTimer: null,
    heroErasePending: false,
    heroTitleReadyToErase: false,
    heroTitleFinished: false,
    heroPreviewFinished: false,
    heroAdvanceTriggered: false,
    heroExitRequested: false,
    heroEraseNow: null,
    heroResumeAfterPreview: null,
    previewToken: 0,
    previewAbort: null,
    previewStartTimer: null,
    previewPlaybackStartTimer: null,
    previewPlaybackWatchdog: null,
    cardPreviewToken: 0,
    cardPreviewAbort: null,
    cardPreviewStartTimer: null,
    cardPreviewFallbackTimer: null,
    cardPreviewTarget: null,
    cardPreviewFile: null,
    activePreviewTarget: null,
    activePreviewFile: null,
    activePreviewKind: null,
    activeHoverCard: null,
    typingTimer: null,
    typingToken: 0,
    queue: [],
    queueIndex: 0,
    queueRegistry: new Map(),
    queueSerial: 0,
    currentFile: null,
    playerLoadToken: 0,
    pendingMetadataMedia: null,
    pendingMetadataHandler: null,
    activeMedia: null,
    audio: null,
    subtitleTracks: [],
    subtitleNodes: [],
    selectedSubtitleId: "off",
    shuffle: false,
    repeat: false,
    autoplay: true,
    libraryBusy: false,
    libraryLoaded: false,
    libraryOffline: false,
    subtitleDiscoveryFor: null,
    searchIndex: new Map(),
    lastProgressPersistAt: 0,
    sharedHandled: false,
    saveTimer: null,
    controlsTimer: null,
    wasMinimized: false,
    settingsOpen: false,
    libraryPollTimer: null,
    cardPointerRaf: 0,
    pendingCardPointer: null,
    miniTransitionToken: 0,
    miniAnimations: [],
    miniHideTimer: null,
    miniPointer: null,
    miniPointerFrame: 0,
    miniSeeking: false,
    miniPosition: safeRead("nexora-mini-position", null),
    pageAnimationTimer: null
  };

  const video = byId("media");
  const playerLayer = byId("player-layer");
  const playerWindow = byId("player-window");
  const miniPlayer = byId("mini-player");
  const miniVideoSlot = byId("mini-video-slot");
  const previewVideo = byId("preview-player");

  // A floating mini-player must not block the Discover hero preview. It only
  // blocks the separate ambience cycle on collection pages.
  function isFullPlayerPresented() {
    return !playerLayer.hidden;
  }

  function isPlayerPresented() {
    return isFullPlayerPresented() || !miniPlayer.hidden;
  }
  previewVideo.muted = true;
  previewVideo.defaultMuted = true;
  previewVideo.setAttribute("muted", "");
  previewVideo.playsInline = true;
  previewVideo.setAttribute("playsinline", "");
  previewVideo.preload = "none";
  previewVideo.loop = false;

  // One separate decoder is reserved for card hover. It is reused for every
  // card and never takes the hero video element away from Discover.
  const cardPreviewVideo = document.createElement("video");
  cardPreviewVideo.className = "preview-video card-preview";
  cardPreviewVideo.muted = true;
  cardPreviewVideo.defaultMuted = true;
  cardPreviewVideo.setAttribute("muted", "");
  cardPreviewVideo.playsInline = true;
  cardPreviewVideo.setAttribute("playsinline", "");
  cardPreviewVideo.preload = "none";
  cardPreviewVideo.loop = true;
  cardPreviewVideo.setAttribute("aria-hidden", "true");
  cardPreviewVideo.tabIndex = -1;

  const audio = document.createElement("audio");
  audio.preload = "metadata";
  audio.style.display = "none";
  audio.id = "nexora-audio";
  document.body.appendChild(audio);

  state.audio = audio;

  // Keep broken artwork from leaving empty image boxes. This delegated handler
  // is compatible with the strict self-only script CSP (no inline onerror).
  document.addEventListener("error", event => {
    const image = event.target;
    if (image instanceof HTMLImageElement && image.dataset.removeOnError === "true") image.remove();
  }, true);

  /* ---------- Formatting and helpers ---------- */

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function titleOf(file) {
    return String(file?.name || file?.fileName || "Untitled")
      .replace(/\.[^.]+$/, "")
      .replace(/\s*[-_]?(SnapYT\.App|Snapyt|Downloaded|1080p|720p|480p|WEB-DL|WEBRip|BluRay).*$/i, "")
      .replace(/[._]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  }

  function formatSize(bytes) {
    let value = Number(bytes);
    if (!Number.isFinite(value) || value < 0) return "Unknown size";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit++;
    }
    return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`;
  }

  function toast(message) {
    const node = byId("toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("show"), 2800);
  }

  function folderParts(folder) {
    return String(folder || "").replace(/\\/g, "/").split("/").filter(Boolean);
  }

  function partsOf(file) {
    if (Array.isArray(file?.folders) && file.folders.length) {
      return file.folders.map(String);
    }
    const parts = String(file?.path || "").replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.length) parts.pop();
    return parts;
  }

  function categoryOf(file) {
    return String(file?.category || partsOf(file)[0] || "Uncategorized");
  }

  function genreOf(file) {
    return String(partsOf(file)[1] || file?.genre || "Unsorted");
  }

  function subgenreOf(file) {
    return String(partsOf(file)[2] || "");
  }

  function thumbnailURL(file, width = 720, frame = "representative") {
    if (frame === "preview") {
      return `/api/thumbnail?path=${encodeURIComponent(file.path)}&w=${width}&frame=preview&duration=8&v=8`;
    }
    return `/api/thumbnail?path=${encodeURIComponent(file.path)}&w=${width}&v=7`;
  }

  function previewURL(file, seconds = 8, quality = 1080) {
    // Version 6 invalidates previous 720p/low-resolution preview responses.
    return `/api/preview?path=${encodeURIComponent(file.path)}&duration=${seconds}&quality=${quality}&v=6`;
  }

  function rgbToHsl(rgb) {
    let [r, g, b] = rgb.map(value => Math.max(0, Math.min(255, Number(value) || 0)) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0;
    const l = (max + min) / 2;
    let sat = 0;
    if (delta) {
      sat = delta / (1 - Math.abs(2 * l - 1));
      if (max === r) h = ((g - b) / delta) % 6;
      else if (max === g) h = (b - r) / delta + 2;
      else h = (r - g) / delta + 4;
      h = (h * 60 + 360) % 360;
    }
    return [h, sat, l];
  }

  function hslToRgb(h, s, l) {
    const hue = ((h % 360) + 360) % 360 / 360;
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const x = chroma * (1 - Math.abs((hue * 6) % 2 - 1));
    const m = l - chroma / 2;
    let values;
    const sector = Math.floor(hue * 6);
    if (sector === 0) values = [chroma, x, 0];
    else if (sector === 1) values = [x, chroma, 0];
    else if (sector === 2) values = [0, chroma, x];
    else if (sector === 3) values = [0, x, chroma];
    else if (sector === 4) values = [x, 0, chroma];
    else values = [chroma, 0, x];
    return values.map(value => Math.round((value + m) * 255));
  }

  function ambienceAccentPalette(rgb) {
    const [h, saturation, lightness] = rgbToHsl(rgb || [88, 114, 153]);
    const vivid = Math.max(.42, Math.min(.78, saturation * .86 + .24));
    const light = Math.max(.38, Math.min(.58, lightness * .92 + .08));
    return [
      hslToRgb(h + 42, vivid, light),
      hslToRgb(h + 205, Math.max(.38, vivid * .92), Math.max(.40, Math.min(.60, light + .015)))
    ];
  }

  function stopPreviewAmbienceFrames() {
    if (state.ambientFrameCallbackId != null && typeof previewVideo.cancelVideoFrameCallback === "function") {
      try { previewVideo.cancelVideoFrameCallback(state.ambientFrameCallbackId); } catch {}
    }
    state.ambientFrameCallbackId = null;
    clearTimeout(state.ambientFrameTimer);
    state.ambientFrameTimer = null;
  }

  function startPreviewAmbienceStream(file) {
    stopPreviewAmbienceFrames();
    const captureToken = ++state.ambientCaptureToken;
    if (!file || !["hero", "ambience"].includes(state.activePreviewKind)) return;

    const incomingIndex = state.ambientBackIndex === 0 ? 1 : 0;
    const incomingLayer = byId(incomingIndex === 0 ? "ambient-a" : "ambient-b");
    const outgoingLayer = byId(state.ambientBackIndex === 0 ? "ambient-a" : "ambient-b");
    const canvas = byId(incomingIndex === 0 ? "ambient-frame-a" : "ambient-frame-b");
    if (!incomingLayer || !canvas) return;

    const width = 480;
    const height = 270;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!context) return;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#07101b";
    context.fillRect(0, 0, width, height);

    // Keep one low-resolution history buffer. Each newly decoded preview frame
    // is softly blended with the previous ambience frame before presentation;
    // this hides the visible stepping of a deliberately low-resolution effect.
    const historyCanvas = document.createElement("canvas");
    historyCanvas.width = width;
    historyCanvas.height = height;
    const historyContext = historyCanvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!historyContext) return;
    historyContext.imageSmoothingEnabled = true;
    historyContext.imageSmoothingQuality = "medium";
    let hasHistoryFrame = false;

    // A tiny sampler keeps the palette tied to the moving preview without
    // reading back the full ambience canvas or forcing layout/style updates.
    const sampler = document.createElement("canvas");
    sampler.width = 24;
    sampler.height = 14;
    const samplerContext = sampler.getContext("2d", { willReadFrequently: true });
    let targetRgb = (state.ambientPaletteRgb || [88, 114, 153]).slice();
    let smoothRgb = targetRgb.slice();
    let lastPaletteSampleAt = -Infinity;
    let lastDrawAt = -Infinity;
    let lastPaletteStepAt = 0;
    let layerActivated = false;

    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const deviceMemory = Number(navigator.deviceMemory) || 8;
    const lowPower = Boolean(connection?.saveData || deviceMemory <= 4 ||
      (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4));
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // The video remains the only decoder. Sample up to 30fps on capable devices,
    // reduce work on constrained devices, and temporally blend adjacent frames.
    // Stay close to the decoded preview cadence on mobile. The earlier 66ms
    // low-power interval skipped frames on common 24fps video and made the
    // blurred atmosphere look like a flickering sequence. Sampling remains
    // bounded, but low-power devices now target ~24fps instead of ~15fps.
    const frameInterval = reducedMotion ? 420 : connection?.saveData ? 50 : (lowPower ? 40 : 33);
    const temporalBlendMs = lowPower ? 54 : 44;

    const isCurrent = () => captureToken === state.ambientCaptureToken &&
      state.activePreviewFile?.id === file.id &&
      ["hero", "ambience"].includes(state.activePreviewKind) &&
      previewVideo.isConnected;

    const samplePalette = now => {
      if (!samplerContext || now - lastPaletteSampleAt < 480) return;
      lastPaletteSampleAt = now;
      try {
        samplerContext.drawImage(previewVideo, 0, 0, sampler.width, sampler.height);
        const pixels = samplerContext.getImageData(0, 0, sampler.width, sampler.height).data;
        let red = 0, green = 0, blue = 0, count = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
          const brightness = (r + g + b) / 3;
          if (brightness < 18) continue;
          red += r; green += g; blue += b; count++;
        }
        if (count) targetRgb = [red / count, green / count, blue / count];
      } catch {
        // Keep the last usable palette if a browser blocks canvas readback.
      }
    };

    const drawColourAtmosphere = (surface = context) => {
      const [secondary, tertiary] = ambienceAccentPalette(smoothRgb);
      surface.save();
      surface.globalCompositeOperation = "screen";
      const washes = [
        { x: width * .18, y: height * .18, radius: width * .76, rgb: smoothRgb, alpha: .26 },
        { x: width * .84, y: height * .25, radius: width * .72, rgb: secondary, alpha: .23 },
        { x: width * .60, y: height * .94, radius: width * .76, rgb: tertiary, alpha: .19 }
      ];
      for (const wash of washes) {
        const gradient = surface.createRadialGradient(wash.x, wash.y, 0, wash.x, wash.y, wash.radius);
        gradient.addColorStop(0, `rgba(${wash.rgb.join(",")},${wash.alpha})`);
        gradient.addColorStop(1, `rgba(${wash.rgb.join(",")},0)`);
        surface.fillStyle = gradient;
        surface.fillRect(0, 0, width, height);
      }
      surface.globalCompositeOperation = "source-over";
      const shade = surface.createLinearGradient(0, 0, 0, height);
      shade.addColorStop(0, "rgba(3,6,12,.04)");
      shade.addColorStop(.62, "rgba(3,6,12,.02)");
      shade.addColorStop(1, "rgba(3,6,12,.24)");
      surface.fillStyle = shade;
      surface.fillRect(0, 0, width, height);
      surface.restore();
    };

    const drawLiveFrame = now => {
      if (!isCurrent() || previewVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
          !previewVideo.videoWidth || !previewVideo.videoHeight || previewVideo.currentTime < .18) return;
      if (now - lastDrawAt < frameInterval) return;
      const elapsedFrameMs = lastDrawAt > -Infinity ? Math.max(1, now - lastDrawAt) : frameInterval;
      lastDrawAt = now;
      // Time-based temporal blending is cadence-independent: it smooths
      // 24fps mobile previews and 30fps desktop previews to a similar degree.
      // It avoids hard stepping without adding another media decoder.
      const incomingFrameAlpha = Math.min(.74, Math.max(.46, 1 - Math.exp(-elapsedFrameMs / temporalBlendMs)));

      const scale = Math.max(width / previewVideo.videoWidth, height / previewVideo.videoHeight) * 1.16;
      const drawWidth = previewVideo.videoWidth * scale;
      const drawHeight = previewVideo.videoHeight * scale;
      const drawX = (width - drawWidth) / 2;
      const drawY = (height - drawHeight) / 2;

      // The ambience is blurred once at 480×270 before it is enlarged by CSS.
      // This preserves the soft look without re-blurring a full-viewport layer.
      context.clearRect(0, 0, width, height);
      context.fillStyle = "#07101b";
      context.fillRect(0, 0, width, height);
      if (hasHistoryFrame) {
        context.globalAlpha = 1 - incomingFrameAlpha;
        context.drawImage(historyCanvas, 0, 0, width, height);
      }
      context.globalAlpha = hasHistoryFrame ? incomingFrameAlpha : 1;
      context.save();
      context.filter = "blur(15px) saturate(2.05) brightness(1.13) contrast(1.08)";
      context.drawImage(previewVideo, drawX, drawY, drawWidth, drawHeight);
      context.restore();
      context.globalAlpha = 1;

      samplePalette(now);
      const elapsed = lastPaletteStepAt ? Math.max(1, now - lastPaletteStepAt) : frameInterval;
      lastPaletteStepAt = now;
      const blend = 1 - Math.exp(-elapsed / 1350);
      smoothRgb = smoothRgb.map((value, index) => value + (targetRgb[index] - value) * blend);
      state.ambientPaletteRgb = smoothRgb.map(Math.round);
      drawColourAtmosphere(context);
      historyContext.clearRect(0, 0, width, height);
      historyContext.drawImage(canvas, 0, 0, width, height);
      hasHistoryFrame = true;

      if (!layerActivated) {
        layerActivated = true;
        requestAnimationFrame(() => {
          if (!isCurrent()) return;
          incomingLayer.classList.add("active");
          outgoingLayer?.classList.remove("active");
          state.ambientBackIndex = incomingIndex;
        });
      }
    };

    if (typeof previewVideo.requestVideoFrameCallback === "function") {
      const onVideoFrame = now => {
        state.ambientFrameCallbackId = null;
        if (!isCurrent()) return;
        drawLiveFrame(now);
        if (isCurrent()) state.ambientFrameCallbackId = previewVideo.requestVideoFrameCallback(onVideoFrame);
      };
      state.ambientFrameCallbackId = previewVideo.requestVideoFrameCallback(onVideoFrame);
    } else {
      const fallbackTick = () => {
        state.ambientFrameTimer = null;
        if (!isCurrent()) return;
        drawLiveFrame(performance.now());
        if (isCurrent()) state.ambientFrameTimer = window.setTimeout(fallbackTick, frameInterval);
      };
      state.ambientFrameTimer = window.setTimeout(fallbackTick, frameInterval);
    }
  }

  /* ---------- Shared hero / global ambience preview + isolated card-hover engine ---------- */

  function resetPreviewElement() {
    previewVideo.classList.remove("is-visible", "is-fading-out", "hero-preview", "card-preview", "ambience-preview-source");
    previewVideo.pause();
    previewVideo.removeAttribute("src");
    previewVideo.removeAttribute("poster");
    previewVideo.load();
    previewVideo.remove();
    state.activePreviewTarget = null;
    state.activePreviewFile = null;
    state.activePreviewKind = null;
  }

  function stopActivePreview() {
    clearTimeout(state.ambientPreviewTimer);
    state.ambientPreviewTimer = null;
    stopPreviewAmbienceFrames();
    state.ambientCaptureToken += 1;
    clearTimeout(state.previewStartTimer);
    clearTimeout(state.heroPreviewFailsafeTimer);
    state.heroPreviewFailsafeTimer = null;
    clearTimeout(state.previewPlaybackStartTimer);
    clearInterval(state.previewPlaybackWatchdog);
    state.previewPlaybackStartTimer = null;
    state.previewPlaybackWatchdog = null;
    state.previewAbort?.abort();
    state.previewAbort = null;
    state.previewToken += 1;
    resetPreviewElement();
  }

  function resetCardPreviewElement() {
    cardPreviewVideo.classList.remove("is-visible", "card-preview");
    cardPreviewVideo.pause();
    cardPreviewVideo.removeAttribute("src");
    cardPreviewVideo.load();
    cardPreviewVideo.remove();
    state.cardPreviewTarget = null;
    state.cardPreviewFile = null;
    state.activeHoverCard = null;
  }

  // Card hover previews own their video element. Stopping one must never
  // pause, reset or restart the independent hero/global ambience preview.
  function stopCardPreview(card = null) {
    if (card && state.activeHoverCard !== card) return;
    clearTimeout(state.cardPreviewStartTimer);
    clearTimeout(state.cardPreviewFallbackTimer);
    state.cardPreviewAbort?.abort();
    state.cardPreviewAbort = null;
    state.cardPreviewToken += 1;
    resetCardPreviewElement();
  }

  function releaseHeroPreviewHold(fileId) {
    if (fileId && state.heroFeaturedId !== fileId) return;
    if (!state.heroPreviewWaiting) return;
    clearTimeout(state.heroPreviewFailsafeTimer);
    state.heroPreviewFailsafeTimer = null;
    state.heroPreviewWaiting = false;
    const resume = state.heroResumeAfterPreview;
    state.heroResumeAfterPreview = null;
    if (state.heroErasePending && resume) {
      state.heroErasePending = false;
      resume();
    }
  }

  function requestHeroTitleExit(fileId) {
    if (fileId && state.heroFeaturedId !== fileId) return;
    if (state.heroExitRequested) return;
    state.heroExitRequested = true;
    const eraseNow = state.heroTitleReadyToErase && !state.heroErasePending;
    releaseHeroPreviewHold(fileId);
    if (eraseNow && typeof state.heroEraseNow === "function") {
      clearTimeout(state.typingTimer);
      state.typingTimer = null;
      state.heroEraseNow();
    }
  }

  // The next featured item may begin only after BOTH the outgoing preview and
  // its title have completed. This keeps the video running throughout the
  // reverse-typing animation instead of stopping it when the title disappears.
  function maybeAdvanceCompletedHero(fileId) {
    if (!fileId || fileId !== state.heroFeaturedId || state.page !== "discover" || document.hidden) return;
    if (!state.heroPreviewFinished || !state.heroTitleFinished || state.heroAdvanceTriggered) return;
    state.heroAdvanceTriggered = true;
    advanceHero();
  }

  function markHeroPreviewFinished(fileId) {
    if (!fileId || fileId !== state.heroFeaturedId) return;
    state.heroPreviewFinished = true;
    requestHeroTitleExit(fileId);
    maybeAdvanceCompletedHero(fileId);
  }

  function markHeroTitleFinished(fileId) {
    if (!fileId || fileId !== state.heroFeaturedId) return;
    state.heroTitleFinished = true;
    maybeAdvanceCompletedHero(fileId);
  }

  function startHeroPreview(file, options = {}) {
    const ambienceOnly = options.ambienceOnly === true;
    const previewBlockedByPlayer = ambienceOnly ? isPlayerPresented() : isFullPlayerPresented();
    if (previewBlockedByPlayer ||
        (!ambienceOnly && state.page !== "discover") ||
        (ambienceOnly && state.page === "discover") ||
        !file || file.type !== "video") {
      if (!ambienceOnly) releaseHeroPreviewHold(file?.id);
      return;
    }

    const target = ambienceOnly ? document.body : byId("hero");
    if (!target || !target.isConnected || (!ambienceOnly && target.hidden)) {
      if (!ambienceOnly) releaseHeroPreviewHold(file.id);
      return;
    }

    stopActivePreview();
    const token = state.previewToken;
    let firstFrameReady = false;
    let crossfadeStarted = false;
    let playbackRequested = false;
    let playbackStarted = false;
    let endedHandled = false;
    let lastMediaTime = 0;
    let lastProgressAt = 0;
    let playbackStartedAt = 0;

    state.activePreviewTarget = target;
    state.activePreviewFile = file;
    state.activePreviewKind = ambienceOnly ? "ambience" : "hero";

    previewVideo.className = ambienceOnly
      ? "preview-video ambience-preview-source"
      : "preview-video hero-preview";
    previewVideo.muted = true;
    previewVideo.defaultMuted = true;
    previewVideo.volume = 0;
    previewVideo.controls = false;
    previewVideo.setAttribute("muted", "");
    previewVideo.playsInline = true;
    previewVideo.setAttribute("playsinline", "");
    previewVideo.setAttribute("webkit-playsinline", "");
    previewVideo.autoplay = false;
    previewVideo.removeAttribute("autoplay");
    previewVideo.loop = false;
    previewVideo.preload = "auto";
    previewVideo.dataset.playRequested = "false";
    previewVideo.dataset.previewResolution = "";

    const controller = new AbortController();
    state.previewAbort = controller;
    const isCurrent = () =>
      token === state.previewToken &&
      state.activePreviewTarget === target &&
      state.activePreviewFile?.id === file.id &&
      state.activePreviewKind === (ambienceOnly ? "ambience" : "hero") &&
      target.isConnected &&
      (ambienceOnly
        ? state.page !== "discover"
        : state.page === "discover" && state.heroFeaturedId === file.id) &&
      !(ambienceOnly ? isPlayerPresented() : isFullPlayerPresented()) &&
      !document.hidden;

    const clearPlaybackWatchdogs = () => {
      clearTimeout(state.previewPlaybackStartTimer);
      clearInterval(state.previewPlaybackWatchdog);
      state.previewPlaybackStartTimer = null;
      state.previewPlaybackWatchdog = null;
    };

    const synchronizeHeroTitleExit = () => {
      if (ambienceOnly || !state.heroPreviewWaiting || state.heroExitRequested) return;
      const duration = Number(previewVideo.duration);
      if (!Number.isFinite(duration) || duration <= 0) return;
      const remainingMs = Math.max(0, (duration - (Number(previewVideo.currentTime) || 0)) * 1000);
      const eraseBudgetMs = Math.min(3200, Math.max(1050, titleOf(file).length * 34 + 420));
      // Begin reverse typing while the outgoing preview is still moving. For
      // unusually long titles, latch the request so erasing begins as soon as
      // the forward typing finishes rather than waiting for the video to end.
      if (remainingMs <= eraseBudgetMs) requestHeroTitleExit(file.id);
    };

    const skipPreview = reason => {
      if (!isCurrent() || endedHandled) return;
      endedHandled = true;
      clearPlaybackWatchdogs();
      console.warn(`[NEXORA] Skipping ${ambienceOnly ? "ambience" : "Discover"} preview for ${titleOf(file)}: ${reason}`);
      stopActivePreview();
      if (ambienceOnly) scheduleAmbientPreviewAdvance(950);
      else markHeroPreviewFinished(file.id);
    };

    const finishPreview = () => {
      if (!isCurrent() || endedHandled) return;
      endedHandled = true;
      clearPlaybackWatchdogs();
      previewVideo.pause();
      if (ambienceOnly) {
        stopActivePreview();
        scheduleAmbientPreviewAdvance(700);
      } else {
        markHeroPreviewFinished(file.id);
      }
    };

    const markPlaybackStarted = () => {
      if (!isCurrent() || playbackStarted || endedHandled) return;
      playbackStarted = true;
      playbackStartedAt = Date.now();
      lastMediaTime = Number(previewVideo.currentTime) || 0;
      lastProgressAt = playbackStartedAt;
      clearTimeout(state.previewPlaybackStartTimer);
      state.previewPlaybackStartTimer = null;
      previewVideo.classList.add("is-visible");
      previewVideo.dataset.playRequested = "true";
      if (!ambienceOnly) revealHeroTransitionBridge();
      startPreviewAmbienceStream(file);

      // The same bounded watchdog protects both visible hero playback and the
      // quiet background ambience cycle without creating another video decoder.
      state.previewPlaybackWatchdog = window.setInterval(() => {
        if (!isCurrent() || endedHandled) {
          clearPlaybackWatchdogs();
          return;
        }

        synchronizeHeroTitleExit();
        const now = Date.now();
        const duration = Number(previewVideo.duration);
        const currentTime = Number(previewVideo.currentTime) || 0;
        if (previewVideo.ended || (Number.isFinite(duration) && duration > 0 && currentTime >= duration - 0.04)) {
          finishPreview();
          return;
        }

        if (currentTime > lastMediaTime + 0.025) {
          lastMediaTime = currentTime;
          lastProgressAt = now;
          return;
        }

        const stalledFor = now - lastProgressAt;
        if (previewVideo.paused && stalledFor > 3500) {
          skipPreview("preview paused before its ending");
          return;
        }
        if (stalledFor > 9000) {
          skipPreview("preview playback stopped progressing");
          return;
        }
        const maxRunMs = Math.max(22000, ((Number.isFinite(duration) && duration > 0 ? duration : 8) + 14) * 1000);
        if (now - playbackStartedAt > maxRunMs) {
          skipPreview("preview exceeded its playback safety limit");
        }
      }, 1000);
    };

    const handlePlayError = error => {
      if (!isCurrent() || endedHandled) return;
      previewVideo.dataset.playRequested = "false";
      previewVideo.classList.remove("is-visible");
      clearPlaybackWatchdogs();
      skipPreview(`${error?.name || "PlaybackError"}: ${error?.message || "playback could not start"}`);
    };

    const requestPlaybackAndReveal = () => {
      if (!isCurrent() || crossfadeStarted || playbackRequested) return;
      crossfadeStarted = true;
      playbackRequested = true;
      previewVideo.dataset.playRequested = "true";

      requestAnimationFrame(() => {
        if (!isCurrent() || endedHandled) return;
        state.previewPlaybackStartTimer = setTimeout(() => {
          if (isCurrent() && !playbackStarted) {
            skipPreview("preview did not begin after playback was requested");
          }
        }, 9000);

        let playPromise;
        try {
          playPromise = previewVideo.play();
        } catch (error) {
          handlePlayError(error);
          return;
        }
        if (playPromise && typeof playPromise.then === "function") {
          playPromise.then(() => {
            if (isCurrent() && !previewVideo.paused) markPlaybackStarted();
          }).catch(handlePlayError);
        } else if (!previewVideo.paused) {
          markPlaybackStarted();
        }
      });
    };

    const markFirstFrameReady = () => {
      if (!isCurrent() || firstFrameReady) return;
      if (previewVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      if (!previewVideo.videoWidth || !previewVideo.videoHeight) return;
      firstFrameReady = true;
      previewVideo.dataset.firstFrameReady = "true";
    };

    const listenerOptions = { signal: controller.signal };
    previewVideo.addEventListener("loadedmetadata", () => {
      if (!isCurrent()) return;
      const dimensions = `${previewVideo.videoWidth}×${previewVideo.videoHeight}`;
      previewVideo.dataset.previewResolution = dimensions;
      if (!ambienceOnly) console.info(`[NEXORA] Discover hero preview: ${dimensions}`);
    }, listenerOptions);
    previewVideo.addEventListener("loadeddata", markFirstFrameReady, listenerOptions);
    previewVideo.addEventListener("canplay", markFirstFrameReady, listenerOptions);
    previewVideo.addEventListener("playing", markPlaybackStarted, listenerOptions);
    previewVideo.addEventListener("timeupdate", () => {
      if (!isCurrent() || endedHandled) return;
      synchronizeHeroTitleExit();
      const duration = Number(previewVideo.duration);
      if (Number.isFinite(duration) && duration > 0 && previewVideo.currentTime >= duration - 0.04) {
        finishPreview();
      }
    }, listenerOptions);
    previewVideo.addEventListener("ended", finishPreview, { once: true, signal: controller.signal });
    previewVideo.addEventListener("error", () => {
      if (isCurrent()) skipPreview(previewVideo.error?.message || "video could not be decoded or loaded");
    }, { once: true, signal: controller.signal });

    target.appendChild(previewVideo);
    // The hero retains its full 1080p-capable source; background-only ambience
    // needs fewer pixels because it is blurred, so keep that cycle lightweight.
    // When a movie is already playing in the floating window, keep the second
    // decoder at 720p to reduce GPU bandwidth while preserving a real hero preview.
    previewVideo.src = previewURL(file, 8, previewQuality(ambienceOnly));
    previewVideo.load();
    requestPlaybackAndReveal();
  }

  function previewQuality(ambienceOnly = false) {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const constrained = Boolean(connection?.saveData ||
      (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
      (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4));
    // The current preview endpoint emits either 720p or 1080p, so constrained
    // devices use the supported 720p tier rather than requesting a fake 480p.
    if (ambienceOnly || !miniPlayer.hidden) return 720;
    return constrained ? 720 : 1080;
  }

  function scheduleAmbientPreviewAdvance(delay = 700) {
    clearTimeout(state.ambientPreviewTimer);
    state.ambientPreviewTimer = window.setTimeout(() => {
      state.ambientPreviewTimer = null;
      startAmbientPreviewCycle();
    }, delay);
  }

  function startAmbientPreviewCycle(options = {}) {
    if (state.page === "discover" || document.hidden || isPlayerPresented()) return;
    if (state.activePreviewKind === "ambience" && state.activePreviewFile) return;
    const resumeCurrent = options.resumeCurrent === true
      ? state.fileById.get(state.featuredSequenceLastId)
      : null;
    const next = resumeCurrent || chooseFeaturedFile();
    if (!next) return;
    startHeroPreview(next, { ambienceOnly: true });
  }

  function startCardPreview(card) {
    if (!card || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    // Card previews remain available while playback is in the floating mini-player.
    // Only the expanded player should suppress hover previews; miniPlayer is an
    // independent overlay and does not own the card-preview decoder.
    if (isFullPlayerPresented()) return;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection?.saveData || (navigator.deviceMemory && navigator.deviceMemory <= 2)) return;
    const file = state.fileById.get(card.dataset.fileId);
    if (!file || file.type !== "video") return;
    const target = card.querySelector(".media-art");
    if (!target || !target.isConnected) return;
    if (state.activeHoverCard === card && state.cardPreviewFile?.id === file.id && cardPreviewVideo.isConnected) return;

    // The card uses its own reusable decoder. Leave the hero/ambience video
    // and its timers completely untouched while this local preview is active.
    stopCardPreview();
    const token = state.cardPreviewToken;
    const controller = new AbortController();
    state.cardPreviewAbort = controller;
    state.cardPreviewTarget = target;
    state.cardPreviewFile = file;
    state.activeHoverCard = card;

    cardPreviewVideo.className = "preview-video card-preview";
    cardPreviewVideo.muted = true;
    cardPreviewVideo.defaultMuted = true;
    cardPreviewVideo.setAttribute("muted", "");
    cardPreviewVideo.playsInline = true;
    cardPreviewVideo.loop = true;
    cardPreviewVideo.preload = "auto";
    cardPreviewVideo.dataset.playRequested = "false";

    const isCurrent = () =>
      token === state.cardPreviewToken &&
      state.cardPreviewTarget === target &&
      state.cardPreviewFile?.id === file.id &&
      state.activeHoverCard === card &&
      card.isConnected && target.isConnected &&
      !document.hidden && playerLayer.hidden;

    const revealAfterFrame = () => {
      if (!isCurrent() || cardPreviewVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      const reveal = () => {
        if (isCurrent() && cardPreviewVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          cardPreviewVideo.classList.add("is-visible");
        }
      };
      if (typeof cardPreviewVideo.requestVideoFrameCallback === "function") {
        cardPreviewVideo.requestVideoFrameCallback(reveal);
      } else {
        requestAnimationFrame(reveal);
      }
    };

    const attemptPlay = () => {
      if (!isCurrent() || cardPreviewVideo.dataset.playRequested === "true") return;
      if (cardPreviewVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      cardPreviewVideo.dataset.playRequested = "true";
      cardPreviewVideo.play().catch(error => {
        if (!isCurrent()) return;
        cardPreviewVideo.dataset.playRequested = "false";
        console.info(`[NEXORA] Card hover preview could not start for ${titleOf(file)}: ${error.name}`);
      });
    };

    const listenerOptions = { signal: controller.signal };
    cardPreviewVideo.addEventListener("loadeddata", attemptPlay, listenerOptions);
    cardPreviewVideo.addEventListener("canplay", attemptPlay, listenerOptions);
    cardPreviewVideo.addEventListener("playing", revealAfterFrame, listenerOptions);
    cardPreviewVideo.addEventListener("error", () => {
      if (!isCurrent()) return;
      console.warn(`[NEXORA] Card preview failed for ${titleOf(file)}; keeping the still artwork.`, cardPreviewVideo.error?.message || "media error");
      stopCardPreview(card);
    }, { once: true, signal: controller.signal });

    target.appendChild(cardPreviewVideo);
    // Start on the first pointer entry. A first-time FFmpeg generation may
    // take longer, but the still card remains visible and the request is not
    // restarted by child-to-child pointer movement inside the same card.
    state.cardPreviewStartTimer = setTimeout(() => {
      if (!isCurrent()) return;
      cardPreviewVideo.src = previewURL(file, 6, 720);
      cardPreviewVideo.load();
      if (cardPreviewVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) attemptPlay();
    }, 90);

    state.cardPreviewFallbackTimer = setTimeout(() => {
      if (isCurrent() && !cardPreviewVideo.classList.contains("is-visible")) {
        console.info(`[NEXORA] Card preview is still preparing for ${titleOf(file)}; the artwork remains visible.`);
      }
    }, 20000);
  }

  document.addEventListener("pointerover", event => {
    if (event.pointerType === "touch") return;
    const card = event.target.closest?.(".media-card[data-file-id]");
    if (!card || card.contains(event.relatedTarget)) return;
    startCardPreview(card);
  });

  document.addEventListener("pointerout", event => {
    const card = event.target.closest?.(".media-card[data-file-id]");
    if (!card || card.contains(event.relatedTarget)) return;
    ["--card-light-x", "--card-light-y"].forEach(name => card.style.removeProperty(name));
    if (state.pendingCardPointer?.card === card) state.pendingCardPointer = null;
    if (state.activeHoverCard === card) stopCardPreview(card);
  });

  // Small pointer-following reflection gives the card surface a glass-like
  // response without adding another animation loop or affecting touch input.
  document.addEventListener("pointermove", event => {
    if (event.pointerType === "touch") return;
    const card = event.target.closest?.(".media-card");
    if (!card) return;
    state.pendingCardPointer = { card, clientX: event.clientX, clientY: event.clientY };
    if (state.cardPointerRaf) return;
    state.cardPointerRaf = requestAnimationFrame(() => {
      state.cardPointerRaf = 0;
      const pending = state.pendingCardPointer;
      state.pendingCardPointer = null;
      if (!pending || !pending.card.isConnected) return;
      const art = pending.card.querySelector(".media-art");
      if (!art) return;
      const rect = art.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = Math.max(0, Math.min(100, ((pending.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((pending.clientY - rect.top) / rect.height) * 100));
      pending.card.style.setProperty("--card-light-x", `${x.toFixed(1)}%`);
      pending.card.style.setProperty("--card-light-y", `${y.toFixed(1)}%`);
    });
  }, { passive: true });

  /* ---------- Discover hero ---------- */

  function clearHeroTimers() {
    clearTimeout(state.heroTimer);
    clearTimeout(state.typingTimer);
  }

  function typeHeroTitle(text, onComplete = () => {}, holdUntilPreviewEnds = false) {
    clearTimeout(state.typingTimer);
    const heading = byId("hero-title");
    const token = ++state.typingToken;
    state.heroTitleReadyToErase = false;
    state.heroExitRequested = false;
    state.heroEraseNow = null;
    let index = 0;
    const typeDelay = window.matchMedia("(max-width: 600px)").matches ? 78 : 68;
    const eraseDelay = 34;
    heading.textContent = "";
    heading.classList.add("typing");

    const write = () => {
      if (token !== state.typingToken || state.page !== "discover" || document.hidden) return;
      if (index < text.length) {
        heading.textContent += text[index++];
        const character = text[index - 1];
        state.typingTimer = setTimeout(write, /[.!?…,:;]/.test(character) ? typeDelay + 220 : typeDelay);
        return;
      }
      state.heroTitleReadyToErase = true;
      state.typingTimer = setTimeout(erase, state.heroExitRequested ? 0 : 2200);
    };

    const erase = () => {
      if (token !== state.typingToken || state.page !== "discover" || document.hidden) return;
      if (holdUntilPreviewEnds && state.heroPreviewWaiting) {
        // Wait for the duration-aware exit request before beginning reverse typing.
        state.heroErasePending = true;
        state.heroResumeAfterPreview = () => {
          if (token !== state.typingToken || state.page !== "discover") return;
          erase();
        };
        return;
      }
      if (index > 0) {
        heading.textContent = text.slice(0, --index);
        state.typingTimer = setTimeout(erase, eraseDelay);
        return;
      }
      heading.classList.remove("typing");
      state.heroErasePending = false;
      state.heroResumeAfterPreview = null;
      state.heroTitleReadyToErase = false;
      state.heroEraseNow = null;
      onComplete();
    };

    state.heroEraseNow = erase;
    state.heroResumeAfterPreview = null;
    write();
  }

  function setHeroActions(markup) {
    const actions = byId("hero-ctas");
    if (actions) actions.innerHTML = markup;
  }

  function pageForCategory(category) {
    const found = Object.entries(CATEGORY).find(([page, value]) =>
      value.toLowerCase() === String(category || "").toLowerCase()
    );
    return found ? found[0] : "library";
  }

  function advanceHero() {
    if (state.page !== "discover" || document.hidden) return;
    // Hero rotation is independent of a locally hovered card.
    const featured = chooseFeaturedFile();
    if (featured) showFeatured(featured);
    else showEmptyHero();
  }

  function captureHeroTransitionBridge() {
    const hero = byId("hero");
    const canCapture = hero && state.activePreviewKind === "hero" &&
      state.activePreviewFile?.id === state.heroFeaturedId &&
      previewVideo.isConnected && previewVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      previewVideo.videoWidth > 0 && previewVideo.videoHeight > 0;
    if (!canCapture) return false;

    try {
      const width = Math.min(640, previewVideo.videoWidth);
      const height = Math.max(1, Math.round(width * previewVideo.videoHeight / previewVideo.videoWidth));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return false;
      context.drawImage(previewVideo, 0, 0, width, height);
      const frame = canvas.toDataURL("image/jpeg", 0.82);
      let bridge = byId("hero-preview-bridge");
      if (!bridge) {
        bridge = document.createElement("div");
        bridge.id = "hero-preview-bridge";
        bridge.className = "hero-preview-bridge";
        bridge.setAttribute("aria-hidden", "true");
        hero.insertBefore(bridge, hero.firstChild);
      }
      bridge.style.backgroundImage = `url("${frame}")`;
      clearTimeout(state.heroTransitionCleanupTimer);
      state.heroTransitionCleanupTimer = null;
      return true;
    } catch (error) {
      console.info("[NEXORA] Hero transition frame was unavailable:", error?.name || error);
      return false;
    }
  }

  function revealHeroTransitionBridge() {
    const bridge = byId("hero-preview-bridge");
    if (!bridge) return;
    clearTimeout(state.heroTransitionCleanupTimer);
    state.heroTransitionCleanupTimer = window.setTimeout(() => {
      byId("hero-preview-bridge")?.remove();
      state.heroTransitionCleanupTimer = null;
    }, 1050);
  }

  function clearHeroTransitionBridge() {
    clearTimeout(state.heroTransitionCleanupTimer);
    state.heroTransitionCleanupTimer = null;
    byId("hero-preview-bridge")?.remove();
  }

  function showEmptyHero() {
    clearHeroTimers();
    clearHeroTransitionBridge();
    state.typingToken += 1;
    state.heroPreviewWaiting = false;
    state.heroErasePending = false;
    state.heroResumeAfterPreview = null;
    state.heroTitleReadyToErase = false;
    state.heroTitleFinished = false;
    state.heroPreviewFinished = false;
    state.heroAdvanceTriggered = false;
    state.heroExitRequested = false;
    state.heroEraseNow = null;
    state.heroFeaturedId = null;
    stopActivePreview();

    const heading = byId("hero-title");
    heading.classList.remove("typing");
    heading.hidden = false;
    heading.setAttribute("aria-label", "Your collection is ready");
    heading.textContent = "Your next story starts here.";
    byId("hero-kicker").innerHTML = "<i></i> YOUR PERSONAL COLLECTION";
    byId("hero-desc").textContent = "Add a video to your library and it will find its place here.";
    setHeroActions(`
      <button class="hero-action-primary" type="button" id="hero-explore">Explore collection <svg class="icon"><use href="#i-arrow-up-right"/></svg></button>
    `);
    byId("hero-explore")?.addEventListener("click", () => navigate("library"), { once: true });
  }

  function chooseFeaturedFile() {
    // One shared sequence drives both the visible Discover hero and the
    // invisible preview used for global ambience on collection pages.
    const ordered = state.files
      .filter(file => file.type === "video")
      .sort((a, b) => titleOf(a).localeCompare(titleOf(b)) || a.id.localeCompare(b.id));
    if (!ordered.length) return null;
    const currentIndex = ordered.findIndex(file => file.id === state.featuredSequenceLastId);
    const next = ordered[(currentIndex + 1) % ordered.length] || ordered[0];
    state.featuredSequenceLastId = next.id;
    return next;
  }

  function showFeatured(file) {
    if (!file || state.page !== "discover") return showEmptyHero();

    if (!captureHeroTransitionBridge()) clearHeroTransitionBridge();
    clearHeroTimers();
    state.heroPreviewWaiting = false;
    state.heroErasePending = false;
    state.heroResumeAfterPreview = null;
    state.heroTitleReadyToErase = false;
    state.heroTitleFinished = false;
    state.heroPreviewFinished = false;
    state.heroAdvanceTriggered = false;
    state.heroExitRequested = false;
    state.heroEraseNow = null;
    stopActivePreview();
    state.heroFeaturedId = file.id;

    const heading = byId("hero-title");
    heading.hidden = false;
    heading.setAttribute("aria-label", `Featured video: ${titleOf(file)}`);
    byId("hero-kicker").innerHTML = "<i></i> SELECTED FROM YOUR LIBRARY";
    byId("hero-desc").textContent = `${categoryOf(file)}${genreOf(file) ? ` · ${genreOf(file).replace(/[-_]/g, " ")}` : ""} — A preview from your collection.`;

    const page = pageForCategory(categoryOf(file));
    const label = page === "library" ? "Explore collection" : `Explore ${categoryOf(file)}`;
    setHeroActions(`
      <button class="hero-action-primary" type="button" id="hero-play"><svg class="icon hero-play-icon"><use href="#i-play"/></svg> Play now</button>
      <button class="hero-action-secondary" type="button" id="hero-explore">${esc(label)} <svg class="icon"><use href="#i-arrow-up-right"/></svg></button>
    `);
    byId("hero-play")?.addEventListener("click", () => {
      const queue = state.files.filter(item => item.type === "video" && categoryOf(item) === categoryOf(file));
      openPlayer(file, queue.length ? queue : [file]);
    }, { once: true });
    byId("hero-explore")?.addEventListener("click", () => navigate(page), { once: true });

    // Keep the title visible for the full video-preview duration. No poster,
    // representative still, or static thumbnail is requested in the hero.
    state.heroPreviewWaiting = true;
    typeHeroTitle(titleOf(file), () => markHeroTitleFinished(file.id), true);
    animateHeroFeature();
    startHeroPreview(file);

    clearTimeout(state.heroPreviewFailsafeTimer);
    state.heroPreviewFailsafeTimer = window.setTimeout(() => {
      if (state.page !== "discover" || state.heroFeaturedId !== file.id || !state.heroPreviewWaiting) return;
      console.warn(`[NEXORA] Releasing Discover sequence safety hold for ${titleOf(file)}.`);
      stopActivePreview();
      markHeroPreviewFinished(file.id);
    }, 45000);
  }

  function initHero() {
    state.featuredSequenceLastId = null;
    advanceHero();
  }

  /* ---------- Data selection and filtering ---------- */

  function filesForPage(page = state.page) {
    if (page === "library") return [...state.files];
    if (page === "favourites") return state.files.filter(file => state.favourites.has(file.id));
    const expected = (CATEGORY[page] || "").toLowerCase();
    return state.files.filter(file => categoryOf(file).toLowerCase() === expected);
  }

  function sortFiles(files) {
    const output = [...files];
    if (state.sort === "az") output.sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
    if (state.sort === "za") output.sort((a, b) => titleOf(b).localeCompare(titleOf(a)));
    if (state.sort === "large") output.sort((a, b) => Number(b.size || 0) - Number(a.size || 0));
    if (state.sort === "recent") output.sort((a, b) => Number(b.modified || 0) - Number(a.modified || 0));
    return output;
  }

  function applyFilters(baseFiles) {
    let output = [...baseFiles];
    const global = state.page === "library" || state.page === "favourites";
    const startDepth = global ? 0 : 1;
    state.folderPathFilters.forEach((value, offset) => {
      if (!value || value === "All") return;
      const depth = startDepth + offset;
      output = output.filter(file => partsOf(file)[depth] === value);
    });
    if (state.query.trim()) {
      const q = state.query.trim().toLowerCase();
      output = output.filter(file => {
        const indexedText = state.searchIndex?.get(file.id);
        // Search text is prepared once per library load. Avoid rebuilding and
        // lowercasing the same metadata string on every keystroke while still
        // preserving a fallback for files not present in the current index.
        const searchable = indexedText || [
          file.name, file.fileName, file.path, categoryOf(file), genreOf(file),
          subgenreOf(file), partsOf(file).join(" ")
        ].join(" ").toLowerCase();
        return searchable.includes(q);
      });
    }
    return sortFiles(output);
  }

  /* ---------- Card rendering ---------- */

  function cardMarkup(file, compact = false) {
    const thumb = file.type === "video" ? thumbnailURL(file, compact ? 240 : 640) : "";
    const label = file.type === "audio" ? "MUSIC" : categoryOf(file).toUpperCase();
    const metadata = [categoryOf(file), genreOf(file)].filter(Boolean).join(" · ");
    const image = thumb ? `<img class="media-art-image" src="${esc(thumb)}" alt="" loading="lazy" decoding="async" data-remove-on-error="true">` : "";
    if (compact) {
      return `<button class="compact-card" type="button" data-file-id="${esc(file.id)}"><span class="compact-thumb">${image}</span><span class="compact-copy"><strong>${esc(titleOf(file))}</strong><small>${esc(metadata)}</small></span></button>`;
    }
    const bookmarkIcon = state.favourites.has(file.id) ? "i-bookmark-filled" : "i-bookmark";
    return `<article class="media-card" data-file-id="${esc(file.id)}"><div class="media-art"><button class="media-card-open" type="button" aria-label="Play ${esc(titleOf(file))}">${image}<span class="media-art-label" aria-hidden="true">${esc(label)}</span></button><button class="card-bookmark" data-action="bookmark" type="button" aria-label="${state.favourites.has(file.id) ? "Remove from favourites" : "Add to favourites"}" aria-pressed="${state.favourites.has(file.id)}"><svg class="icon" aria-hidden="true"><use href="#${bookmarkIcon}"/></svg></button></div><strong class="media-card-title" title="${esc(titleOf(file))}">${esc(titleOf(file))}</strong></article>`;
  }

  function registerQueue(container, files) {
    // Keep one queue registry entry per container and update its contents.
    // The previous implementation allocated a fresh ID list on each refresh,
    // retaining dozens of obsolete copies for long-running sessions.
    const key = container.dataset.queueKey || `q${++state.queueSerial}`;
    container.dataset.queueKey = key;
    state.queueRegistry.set(key, files.map(file => file.id));
    if (state.queueRegistry.size > 60) {
      const oldest = state.queueRegistry.keys().next().value;
      if (oldest !== key) state.queueRegistry.delete(oldest);
    }
    return key;
  }

  function updateRowNavigation(wrapper) {
    if (!wrapper) return;
    const row = wrapper.querySelector(".media-row");
    const previous = wrapper.querySelector(".row-nav-prev");
    const next = wrapper.querySelector(".row-nav-next");
    if (!row || !previous || !next) return;

    const maximum = Math.max(0, row.scrollWidth - row.clientWidth);
    const overflowing = maximum > 3 && !row.querySelector(".empty-state");
    wrapper.classList.toggle("has-overflow", overflowing);
    previous.hidden = !overflowing;
    next.hidden = !overflowing;
    previous.disabled = !overflowing || row.scrollLeft <= 2;
    next.disabled = !overflowing || row.scrollLeft >= maximum - 2;
  }

  function animateRailScroll(row, targetLeft, shell) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (row.__nexoraRailFrame) cancelAnimationFrame(row.__nexoraRailFrame);
    row.__nexoraRailFrame = 0;
    if (reducedMotion) {
      row.scrollLeft = targetLeft;
      updateRowNavigation(shell);
      return;
    }
    const startLeft = row.scrollLeft;
    const distance = targetLeft - startLeft;
    if (Math.abs(distance) < 1) return;
    const duration = Math.max(420, Math.min(660, 390 + Math.abs(distance) / Math.max(1, row.clientWidth) * 230));
    const startedAt = performance.now();
    row.classList.add("is-programmatic-scroll");
    shell.classList.add("is-scrolling");
    const frame = now => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      row.scrollLeft = startLeft + distance * eased;
      if (progress < 1) {
        row.__nexoraRailFrame = requestAnimationFrame(frame);
      } else {
        row.scrollLeft = targetLeft;
        row.__nexoraRailFrame = 0;
        row.classList.remove("is-programmatic-scroll");
        shell.classList.remove("is-scrolling");
        updateRowNavigation(shell);
      }
    };
    row.__nexoraRailFrame = requestAnimationFrame(frame);
  }

  function setupHomeRowNavigation() {
    const rows = $$("main .home-section .media-row");
    rows.forEach(row => {
      if (row.parentElement?.classList.contains("media-row-shell")) return;

      const shell = document.createElement("div");
      shell.className = "media-row-shell";
      row.parentNode.insertBefore(shell, row);
      shell.appendChild(row);

      const createButton = (direction, label, pathData) => {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("type", "button");
        button.className = `row-nav-button row-nav-${direction}`;
        button.dataset.rowNavigation = direction;
        button.setAttribute("aria-controls", row.id);
        button.setAttribute("aria-label", label);
        button.title = label;
        button.disabled = true;
        button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${pathData}"/></svg>`;
        button.addEventListener("click", event => {
          // A row arrow is navigation for its row only, never a form submit,
          // anchor activation, card click, or page-level action.
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          if (button.disabled) return;
          const distance = Math.max(240, row.clientWidth * 0.82);
          const maximum = Math.max(0, row.scrollWidth - row.clientWidth);
          const nextLeft = Math.max(0, Math.min(maximum, row.scrollLeft + (direction === "next" ? distance : -distance)));
          const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          shell.classList.remove("is-moving-next", "is-moving-prev");
          shell.classList.add(direction === "next" ? "is-moving-next" : "is-moving-prev");
          if (!reducedMotion && typeof button.animate === "function") {
            button.animate([
              { transform: "translateY(-50%) scale(1)" },
              { transform: "translateY(-50%) scale(.88)" },
              { transform: "translateY(-50%) scale(1)" }
            ], { duration: 320, easing: "cubic-bezier(.22,.78,.22,1)" });
          }
          animateRailScroll(row, nextLeft, shell);
          window.clearTimeout(shell.__nexoraMotionTimer);
          shell.__nexoraMotionTimer = window.setTimeout(() => shell.classList.remove("is-moving-next", "is-moving-prev"), 720);
        }, { capture: true });
        shell.appendChild(button);
        return button;
      };

      createButton("prev", "Scroll to previous titles", "m15 18-6-6 6-6");
      createButton("next", "Scroll to next titles", "m9 18 6-6-6-6");
      let rowMeasureFrame = 0;
      row.addEventListener("scroll", () => {
        if (rowMeasureFrame) return;
        rowMeasureFrame = requestAnimationFrame(() => {
          rowMeasureFrame = 0;
          updateRowNavigation(shell);
        });
      }, { passive: true });
      updateRowNavigation(shell);
    });

    let refreshFrame = 0;
    const refresh = () => {
      if (refreshFrame) return;
      refreshFrame = requestAnimationFrame(() => {
        refreshFrame = 0;
        $$(".media-row-shell").forEach(updateRowNavigation);
      });
    };
    window.addEventListener("resize", refresh, { passive: true });
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(refresh);
      $$(".media-row-shell .media-row").forEach(row => observer.observe(row));
    }
  }

  let posterGridObserver = null;
  // Smaller initial DOM batches keep poster-grid creation from monopolising the
  // main thread during vertical scrolling. The observer still preloads 680px
  // ahead, so the user sees the same titles and discovery behaviour.
  const POSTER_GRID_BATCH_SIZE = 32;

  function appendPosterGridBatch(container = byId("poster-grid")) {
    const files = container.__nexoraGridFiles || [];
    const start = Number(container.dataset.renderedCount) || 0;
    const end = Math.min(files.length, start + POSTER_GRID_BATCH_SIZE);
    if (end <= start) return;
    const sentinel = container.querySelector(".grid-load-sentinel");
    const template = document.createElement("template");
    template.innerHTML = files.slice(start, end).map(file => cardMarkup(file)).join("");
    container.insertBefore(template.content, sentinel || null);
    container.dataset.renderedCount = String(end);
    if (end >= files.length) {
      sentinel?.remove();
      posterGridObserver?.disconnect();
      posterGridObserver = null;
    }
  }

  function observePosterGridSentinel(container) {
    const sentinel = container.querySelector(".grid-load-sentinel");
    if (!sentinel) return;
    if (typeof IntersectionObserver !== "function") {
      const append = () => {
        if (!container.isConnected || !container.querySelector(".grid-load-sentinel")) return;
        appendPosterGridBatch(container);
        if (container.querySelector(".grid-load-sentinel")) requestAnimationFrame(append);
      };
      requestAnimationFrame(append);
      return;
    }
    posterGridObserver = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) appendPosterGridBatch(container);
    }, { root: null, rootMargin: "680px 0px", threshold: 0 });
    posterGridObserver.observe(sentinel);
  }

  function renderCards(container, files, emptyText = "Nothing here yet.", compact = false) {
    if (!container) return;
    // Include mutable file metadata so periodic library refreshes update
    // titles, file sizes and modified files instead of leaving stale cards.
    const signature = JSON.stringify(files.map(file => [
      file.id, file.path, file.name, file.fileName, file.type, file.extension,
      file.category, file.genre, Array.isArray(file.folders) ? file.folders.join("/") : "",
      file.size, file.modified, state.favourites.has(file.id) ? 1 : 0
    ]));
    registerQueue(container, files);
    if (container.dataset.renderSignature === signature && container.childElementCount) {
      requestAnimationFrame(() => updateRowNavigation(container.closest(".media-row-shell")));
      return;
    }
    if (state.activePreviewTarget && container.contains(state.activePreviewTarget)) stopActivePreview();
    if (state.activeHoverCard && container.contains(state.activeHoverCard)) stopCardPreview(state.activeHoverCard);
    if (container.id === "poster-grid") {
      posterGridObserver?.disconnect();
      posterGridObserver = null;
      container.__nexoraGridFiles = files;
      container.dataset.renderedCount = "0";
    }
    if (container.id === "poster-grid" && files.length > POSTER_GRID_BATCH_SIZE) {
      const initial = files.slice(0, POSTER_GRID_BATCH_SIZE).map(file => cardMarkup(file)).join("");
      container.innerHTML = `${initial}<div class="grid-load-sentinel" aria-live="polite">More titles load as you browse</div>`;
      container.dataset.renderedCount = String(POSTER_GRID_BATCH_SIZE);
      observePosterGridSentinel(container);
    } else {
      container.innerHTML = files.length ? files.map(file => cardMarkup(file, compact)).join("") : `<p class="empty-state">${esc(emptyText)}</p>`;
    }
    container.dataset.renderSignature = signature;
    requestAnimationFrame(() => updateRowNavigation(container.closest(".media-row-shell")));
  }

  function queueFromElement(element) {
    const scope = element.closest("[data-queue-key]");
    if (!scope) return [...state.files];
    const ids = state.queueRegistry.get(scope.dataset.queueKey) || [];
    return ids.map(id => state.fileById.get(id)).filter(Boolean);
  }

  document.addEventListener("click", event => {
    const bookmark = event.target.closest('[data-action="bookmark"]');
    if (bookmark) {
      event.preventDefault();
      event.stopPropagation();
      const card = bookmark.closest("[data-file-id]");
      const file = card && state.fileById.get(card.dataset.fileId);
      if (file) toggleFavourite(file);
      return;
    }
    const card = event.target.closest("[data-file-id]");
    if (!card) return;
    const file = state.fileById.get(card.dataset.fileId);
    if (file) {
      if (card.closest("#search-results")) closeSearch({ restoreFocus: false });
      openPlayer(file, queueFromElement(card));
    }
  });


  /* ---------- Home rows ---------- */

  function isContinueWatchingFile(file) {
    const progress = state.progress[file.id];
    const time = Number(progress?.time || 0);
    const duration = Number(progress?.duration || 0);
    if (!(time > 10)) return false;
    return !(duration > 0 && duration <= time + 10);
  }

  function getContinueWatchingFiles() {
    return state.files
      .filter(isContinueWatchingFile)
      .sort((a, b) => Number(state.progress[b.id]?.updatedAt || b.modified || 0) - Number(state.progress[a.id]?.updatedAt || a.modified || 0));
  }

  function renderContinueWatching() {
    const watching = getContinueWatchingFiles();
    renderCards(byId("continue-row"), watching.slice(0, 14), "Your in-progress titles will appear here after you watch something.");
    byId("continue-section").hidden = false;
    return watching;
  }

  function renderHome() {
    const recent = sortFiles(state.files).slice(0, 14);
    renderCards(byId("recent-row"), recent, "Your supported media files will appear here.");
    const favourites = state.files.filter(file => state.favourites.has(file.id)).slice(0, 14);
    renderCards(byId("favourite-row"), favourites, "Bookmark titles you want to keep close.");
    renderContinueWatching();
    renderPicks(false);
  }

  function renderPicks(reshuffle = false) {
    const candidates = state.files.filter(file => file.type === "video");
    const available = new Set(candidates.map(file => file.id));
    let ids = state.picksIds.filter(id => available.has(id));
    if (reshuffle || ids.length === 0) {
      ids = candidates.map(file => file.id);
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
    } else {
      const known = new Set(ids);
      candidates.forEach(file => { if (!known.has(file.id)) ids.push(file.id); });
    }
    state.picksIds = ids;
    const byFileId = new Map(candidates.map(file => [file.id, file]));
    renderCards(byId("picks-row"), ids.slice(0, 12).map(id => byFileId.get(id)).filter(Boolean), "Add a few videos and your picks will appear here.");
  }

  byId("refresh-picks").addEventListener("click", () => renderPicks(true));

  function toggleFavourite(file) {
    if (state.favourites.has(file.id)) state.favourites.delete(file.id);
    else state.favourites.add(file.id);
    safeWrite("nexora-favourites", [...state.favourites]);
    renderHome();
    if (state.page !== "discover") renderCollection();
    toast(state.favourites.has(file.id) ? "Added to favourites" : "Removed from favourites");
  }

  /* ---------- Genre and subgenre ---------- */

  function renderTaxonomy(baseFiles) {
    const taxonomy = byId("taxonomy");
    const global = state.page === "library" || state.page === "favourites";
    const startDepth = global ? 0 : 1;
    const maximumDepth = Math.max(0, ...baseFiles.map(file => partsOf(file).length));
    const rows = [];
    let prefix = [];
    const currentFilters = [...state.folderPathFilters];

    for (let depth = startDepth; depth < maximumDepth; depth++) {
      const values = new Set();
      baseFiles.forEach(file => {
        const parts = partsOf(file);
        if (prefix.every((value, index) => parts[startDepth + index] === value) && parts[depth]) values.add(parts[depth]);
      });
      const options = [...values].sort((a, b) => a.localeCompare(b));
      if (!options.length) break;
      let selected = currentFilters[depth - startDepth] || "All";
      if (selected !== "All" && !values.has(selected)) selected = "All";
      const label = global && depth === 0 ? "CATEGORY" : depth === startDepth ? "GENRE" : depth === startDepth + 1 ? "SUBGENRE" : `FOLDER ${depth - startDepth + 1}`;
      const row = document.createElement("div");
      row.className = `taxonomy-row ${depth > startDepth ? "subgenre-row" : ""}`;
      const heading = document.createElement("div");
      heading.className = "taxonomy-label";
      heading.textContent = label;
      const chips = document.createElement("div");
      chips.className = "taxonomy-options";
      const choices = ["All", ...options];
      choices.forEach(value => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `filter-chip ${value === selected ? "active" : ""}`;
        button.textContent = value === "All" ? "All" : value.replace(/[-_]/g, " ");
        button.setAttribute("aria-pressed", String(value === selected));
        button.addEventListener("click", () => {
          const next = currentFilters.slice(0, depth - startDepth);
          if (value !== "All") next.push(value);
          state.folderPathFilters = next;
          state.genre = next[0] || "All";
          state.subgenre = next[1] || "All";
          renderCollection();
        });
        chips.appendChild(button);
      });
      row.append(heading, chips);
      rows.push(row);
      if (selected === "All") break;
      prefix.push(selected);
    }
    taxonomy.replaceChildren(...rows);
    taxonomy.hidden = rows.length === 0;
  }

  /* ---------- Collection search ---------- */

  function renderSectionSearch(baseFiles) {
    const panel = byId("section-search-results");
    const query = state.query.trim();
    if (!query) {
      panel.hidden = true;
      byId("poster-grid").hidden = false;
      byId("no-search-results").hidden = true;
      return;
    }
    const results = applyFilters(baseFiles);
    panel.hidden = false;
    byId("poster-grid").hidden = true;
    byId("section-search-label").textContent = `RESULTS IN ${(CATEGORY[state.page] || "YOUR LIBRARY").toUpperCase()}`;
    byId("section-search-count").textContent = `${results.length} FOUND`;
    byId("no-search-results").hidden = results.length > 0;
    renderCards(byId("compact-results"), results, "", true);
  }

  function renderCollection() {
    clearTimeout(sectionSearchTimer);
    if (!state.libraryLoaded) {
      byId("result-count").textContent = state.libraryOffline ? "OFFLINE" : (state.libraryBusy ? "LOADING" : "CONNECTING");
      byId("collection-status").textContent = state.libraryOffline ? "Server unavailable" : "Connecting to your media library…";
      byId("poster-grid").innerHTML = "";
      byId("taxonomy").hidden = true;
      byId("empty-library").hidden = false;
      byId("empty-title").textContent = state.libraryOffline ? "Server connection problem" : "Connecting to your collection";
      byId("empty-message").textContent = state.libraryOffline
        ? "Start the NEXORA server and select Retry to reconnect to your media library."
        : "Looking through your collection…";
      return;
    }
    byId("taxonomy").hidden = false;
    const baseFiles = filesForPage();
    const global = state.page === "library" || state.page === "favourites";
    const category = CATEGORY[state.page];
    if (state.page === "library") {
      byId("collection-kicker").textContent = "YOUR PERSONAL COLLECTION";
      byId("collection-title").innerHTML = "Everything<span>.</span>";
      byId("collection-desc").textContent = "All the things you have added to NEXORA.";
    } else if (state.page === "favourites") {
      byId("collection-kicker").textContent = "KEPT CLOSE";
      byId("collection-title").innerHTML = "Favourites<span>.</span>";
      byId("collection-desc").textContent = "The titles you have chosen to keep close.";
    } else {
      byId("collection-kicker").textContent = "BROWSE YOUR COLLECTION";
      byId("collection-title").innerHTML = `${esc(category)}<span>.</span>`;
      byId("collection-desc").textContent = "Find something good. Stay for the story.";
    }
    renderTaxonomy(baseFiles);
    const visible = applyFilters(baseFiles);
    byId("result-count").textContent = `${visible.length} ${visible.length === 1 ? "TITLE" : "TITLES"}`;
    const activeFolders = state.folderPathFilters.filter(value => value && value !== "All");
    byId("collection-status").textContent = `${baseFiles.length} IN SECTION${activeFolders.length ? ` · ${activeFolders.map(value => value.replace(/[-_]/g, " ")).join(" / ")}` : ""}`;
    renderSectionSearch(baseFiles);
    if (!state.query.trim()) renderCards(byId("poster-grid"), visible, "No matching media was found.");
    byId("empty-library").hidden = baseFiles.length > 0 || state.query.trim().length > 0 || visible.length > 0;
    if (!baseFiles.length) {
      byId("empty-title").textContent = "Your collection is waiting";
      byId("empty-message").textContent = `No supported media was found in ${category}. Add files to the matching folder inside Entertainment.`;
    }
  }

  /* ---------- Navigation ---------- */

  function updateNavigationIndicator() {
    const nav = byId("main-nav");
    const active = nav?.querySelector(".nav-link.active");
    if (!nav || !active) return;
    // The menu wraps into multiple rows on mobile. Track both axes and the
    // actual item dimensions so the glass indicator fits the selected cell.
    nav.style.setProperty("--nav-indicator-x", `${active.offsetLeft}px`);
    nav.style.setProperty("--nav-indicator-y", `${active.offsetTop}px`);
    nav.style.setProperty("--nav-indicator-width", `${active.offsetWidth}px`);
    nav.style.setProperty("--nav-indicator-height", `${active.offsetHeight}px`);
    nav.classList.add("has-active-indicator");
  }

  function setNavigationOpen(open) {
    const nav = byId("main-nav");
    const toggle = byId("menu-open");
    nav.classList.toggle("open", Boolean(open));
    toggle.setAttribute("aria-expanded", String(Boolean(open)));
    toggle.classList.toggle("is-open", Boolean(open));
    document.body.classList.toggle("nav-open", Boolean(open));
  }

  function animatePageTransition() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    state.pageMotionAnimations?.forEach(animation => {
      try { animation.cancel(); } catch {}
    });
    state.pageMotionAnimations = [];
    if (reduceMotion) return;
    if (typeof Element.prototype.animate !== "function") {
      const main = $("main");
      if (!main) return;
      main.classList.remove("nexora-page-transition-fallback");
      void main.offsetWidth;
      main.classList.add("nexora-page-transition-fallback");
      window.setTimeout(() => main.classList.remove("nexora-page-transition-fallback"), 460);
      return;
    }

    const discover = state.page === "discover";
    const selectors = discover
      ? ["#hero", "#continue-section", "#recent-section", "#picks-section", "#favourite-section"]
      : [".collection-topline", ".browse-toolbar", "#section-search-results", "#taxonomy", ".collection-meta", "#poster-grid", "#empty-library"];
    const targets = selectors.flatMap(selector => $$(selector)).filter(element =>
      element && !element.hidden && element.getClientRects().length
    );

    // Only reveal the first few cards that are actually on/near the viewport.
    // The previous release could schedule 24 card animations on every page
    // change, including blur filters. Keep the entrance cinematic but light.
    const candidates = discover
      ? $$(".home-section:not([hidden]) .media-row .media-card")
      : $$("#poster-grid .media-card");
    const viewportBottom = window.innerHeight + 180;
    const visibleCards = candidates.filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.top < viewportBottom && rect.bottom > -80;
    }).slice(0, 8);
    const sequence = [...targets, ...visibleCards];

    sequence.forEach((element, index) => {
      const delay = Math.min(index * (index < targets.length ? 34 : 22), 190);
      const animation = element.animate([
        { opacity: 0, transform: "translate3d(0, 17px, 0) scale(.992)" },
        { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" }
      ], {
        duration: index < targets.length ? 470 : 360,
        delay,
        easing: "cubic-bezier(.18,.72,.22,1)",
        fill: "both"
      });
      state.pageMotionAnimations.push(animation);
      animation.finished.then(() => {
        try { animation.cancel(); } catch {}
        state.pageMotionAnimations = state.pageMotionAnimations.filter(item => item !== animation);
      }).catch(() => {});
    });
  }

  function animateHeroFeature() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const content = byId("hero").querySelector(".hero-content");
    state.heroFeatureAnimation?.cancel?.();
    state.heroFeatureAnimation = content.animate([
      { opacity: .18, transform: "translate3d(0, 16px, 0)" },
      { opacity: 1, transform: "translate3d(0, 0, 0)" }
    ], { duration: 680, easing: "cubic-bezier(.16,.78,.22,1)" });
  }

  function animatePlayerOpen() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    cancelMiniAnimations();
    const backdrop = playerLayer.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 380, easing: "ease-out" }
    );
    const panel = playerWindow.animate([
      { opacity: 0, transform: "translate3d(0, 22px, 0) scale(.982)" },
      { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" }
    ], { duration: 620, easing: "cubic-bezier(.16,.78,.22,1)" });
    state.miniAnimations = [backdrop, panel];
    Promise.all([backdrop.finished.catch(() => {}), panel.finished.catch(() => {})]).then(() => {
      if (state.wasMinimized || playerLayer.hidden) return;
      backdrop.cancel(); panel.cancel();
      state.miniAnimations = [];
    });
  }

  function navigate(page) {
    if (!Object.prototype.hasOwnProperty.call(CATEGORY, page) && page !== "discover") page = "discover";
    const previousPage = state.page;
    if (previousPage === page) {
      setNavigationOpen(false);
      return;
    }

    // Keep the exact active sequence item when moving between Discover and a
    // collection. Between collection pages, leave the existing preview alone.
    const handoffFile = state.activePreviewFile || null;
    const handoffKind = state.activePreviewKind;
    const previousFeatured = state.fileById.get(state.heroFeaturedId) ||
      state.fileById.get(state.featuredSequenceLastId) || null;

    state.page = page;
    const pageHeading = byId("page-heading");
    if (pageHeading) pageHeading.textContent = page === "discover" ? "Discover" : "Your collection";
    state.heroPreviewWaiting = false;
    state.heroErasePending = false;
    state.heroResumeAfterPreview = null;
    state.heroTitleReadyToErase = false;
    state.heroTitleFinished = false;
    state.heroPreviewFinished = false;
    state.heroAdvanceTriggered = false;
    state.heroExitRequested = false;
    state.heroEraseNow = null;
    document.documentElement.dataset.page = page;
    if (page !== "discover") clearHeroTransitionBridge();
    stopCardPreview();
    state.genre = "All";
    state.subgenre = "All";
    state.folderPathFilters = [];
    state.query = "";
    byId("section-search").value = "";
    byId("clear-section-search").hidden = true;

    const discover = page === "discover";
    byId("hero").hidden = !discover;
    byId("continue-section").hidden = !discover;
    byId("recent-section").hidden = !discover;
    byId("picks-section").hidden = !discover;
    byId("favourite-section").hidden = !discover;
    byId("collection").hidden = discover;
    $$(".nav-link").forEach(button => {
      const active = button.dataset.page === page;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    updateNavigationIndicator();
    setNavigationOpen(false);

    if (discover) {
      clearHeroTimers();
      state.typingToken += 1;
      const resumeFile = handoffKind === "ambience" && handoffFile ? handoffFile :
        (previousPage !== "discover" ? null : (handoffFile || previousFeatured));
      if (resumeFile && state.fileById.has(resumeFile.id)) {
        showFeatured(state.fileById.get(resumeFile.id));
      } else {
        stopActivePreview();
        advanceHero();
      }
    } else {
      clearHeroTimers();
      state.typingToken += 1;
      byId("hero-title").classList.remove("typing");
      renderCollection();

      if (previousPage === "discover") {
        const resumeFile = handoffKind === "hero" && handoffFile ? handoffFile : previousFeatured;
        stopActivePreview();
        if (resumeFile && state.fileById.has(resumeFile.id) && !isPlayerPresented() && !document.hidden) {
          // Restart the same featured item off-screen; it remains the same
          // sequence entry and the shared cursor advances only when it ends.
          startHeroPreview(state.fileById.get(resumeFile.id), { ambienceOnly: true });
        } else {
          startAmbientPreviewCycle();
        }
      } else if (handoffKind !== "ambience" || !handoffFile || isPlayerPresented()) {
        stopActivePreview();
        startAmbientPreviewCycle();
      }
      // Movies -> Anime -> Library and similar transitions do not interrupt
      // or restart the one global preview/ambience sequence.
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    animatePageTransition();
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-page]");
    if (!button) return;
    event.preventDefault();
    navigate(button.dataset.page);
  });

  byId("menu-open").addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    const open = byId("menu-open").getAttribute("aria-expanded") !== "true";
    setNavigationOpen(open);
  });

  document.addEventListener("click", event => {
    const nav = byId("main-nav");
    const toggle = byId("menu-open");
    if (!nav.classList.contains("open")) return;
    if (nav.contains(event.target) || toggle.contains(event.target)) return;
    setNavigationOpen(false);
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && byId("main-nav").classList.contains("open")) {
      setNavigationOpen(false);
      byId("menu-open").focus();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 980) setNavigationOpen(false);
    requestAnimationFrame(updateNavigationIndicator);
  }, { passive: true });
  requestAnimationFrame(updateNavigationIndicator);

  /* ---------- Section-local and overlay search ---------- */

  let sectionSearchTimer = null;
  function onSectionSearch(value) {
    state.query = value;
    byId("clear-section-search").hidden = !value;
    clearTimeout(sectionSearchTimer);
    if (state.page !== "discover") {
      sectionSearchTimer = window.setTimeout(() => renderCollection(), 90);
    }
  }

  byId("section-search").addEventListener("input", event => onSectionSearch(event.target.value));
  byId("clear-section-search").addEventListener("click", () => {
    byId("section-search").value = "";
    onSectionSearch("");
    byId("section-search").focus();
  });
  byId("sort").addEventListener("change", event => {
    state.sort = event.target.value;
    renderCollection();
  });

  function overlayScope() {
    return state.page === "discover" ? [...state.files] : filesForPage();
  }

  let overlaySearchTimer = null;
  let overlaySearchToken = 0;
  let overlayCloseAnimation = null;
  const MAX_OVERLAY_SEARCH_RESULTS = 60;

  function openSearch() {
    clearTimeout(overlaySearchTimer);
    overlaySearchToken += 1;
    overlayCloseAnimation?.cancel?.();
    overlayCloseAnimation = null;
    const layer = byId("search-layer");
    layer.hidden = false;
    layer.inert = false;
    layer.classList.remove("is-closing");
    byId("search-input").value = "";
    renderOverlaySearch("", overlaySearchToken);
    requestAnimationFrame(() => {
      if (!layer.hidden) byId("search-input").focus();
    });
  }

  function closeSearch(options = {}) {
    clearTimeout(overlaySearchTimer);
    overlaySearchTimer = null;
    const token = ++overlaySearchToken;
    const layer = byId("search-layer");
    const card = layer.querySelector(".search-overlay-card");
    const wasOpen = !layer.hidden;
    if (!wasOpen) return;

    const finishClose = () => {
      if (token !== overlaySearchToken) return;
      layer.hidden = true;
      layer.inert = false;
      layer.classList.remove("is-closing");
      overlayCloseAnimation = null;
      if (options.restoreFocus !== false) {
        requestAnimationFrame(() => byId("search-open")?.focus({ preventScroll: true }));
      }
    };

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reducedMotion && typeof card.animate === "function") {
      layer.inert = true;
      layer.classList.add("is-closing");
      overlayCloseAnimation = card.animate([
        { opacity: 1, transform: "translate3d(0,0,0) scale(1)" },
        { opacity: 0, transform: "translate3d(0,-9px,0) scale(.988)" }
      ], { duration: 190, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
      overlayCloseAnimation.finished.then(finishClose).catch(() => {});
    } else {
      finishClose();
    }
  }

  function renderOverlaySearch(value, token = overlaySearchToken) {
    if (token !== overlaySearchToken || byId("search-layer").hidden) return;
    const query = String(value || "").trim().toLocaleLowerCase();
    const scope = overlayScope();
    const matches = query ? scope.filter(file => (state.searchIndex.get(file.id) ||
      [file.name, file.fileName, file.path, categoryOf(file), genreOf(file), subgenreOf(file)].join(" ").toLocaleLowerCase()).includes(query)) : [];
    byId("overlay-search-scope").textContent = state.page === "discover" || state.page === "library" ? "ALL LIBRARY" : (CATEGORY[state.page] || "YOUR COLLECTION").toUpperCase();
    const container = byId("search-results");
    container.setAttribute("aria-live", "polite");
    const key = registerQueue(container, matches);
    const visible = matches.slice(0, MAX_OVERLAY_SEARCH_RESULTS);
    const resultMarkup = visible.map(file => {
      const src = file.type === "video" ? thumbnailURL(file, 240) : "";
      return `<button class="overlay-result" type="button" data-file-id="${esc(file.id)}" data-queue-key="${key}"><span class="overlay-result-thumb">${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" data-remove-on-error="true">` : ""}</span><span class="overlay-result-copy"><strong>${esc(titleOf(file))}</strong><small>${esc(categoryOf(file))} · ${esc(genreOf(file))}</small></span></button>`;
    }).join("");
    const summary = matches.length > visible.length
      ? `<p class="search-result-count">Showing ${visible.length} of ${matches.length} matches. Refine your search to narrow the list.</p>`
      : (matches.length ? `<p class="search-result-count">${matches.length} ${matches.length === 1 ? "match" : "matches"}</p>` : "");
    container.innerHTML = resultMarkup || (query ? '<p class="empty-state">No matches in this section.</p>' : '<p class="empty-state">Start typing to search.</p>');
    if (summary) container.insertAdjacentHTML("beforeend", summary);
  }

  byId("search-open").addEventListener("click", openSearch);
  byId("search-close").addEventListener("click", () => closeSearch());
  byId("search-layer").addEventListener("click", event => {
    if (event.target === byId("search-layer")) closeSearch();
  });
  byId("search-input").addEventListener("input", event => {
    const value = event.target.value;
    clearTimeout(overlaySearchTimer);
    const token = ++overlaySearchToken;
    overlaySearchTimer = window.setTimeout(() => {
      overlaySearchTimer = null;
      renderOverlaySearch(value, token);
    }, 100);
  });
  byId("search-input").addEventListener("keydown", event => {
    if (event.key === "ArrowDown") {
      const first = byId("search-results").querySelector(".overlay-result");
      if (first) { event.preventDefault(); first.focus(); }
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearch();
    }
  });
  byId("search-results").addEventListener("keydown", event => {
    if (!event.target.matches(".overlay-result")) return;
    const results = [...byId("search-results").querySelectorAll(".overlay-result")];
    const index = results.indexOf(event.target);
    if (event.key === "ArrowDown" && index < results.length - 1) {
      event.preventDefault(); results[index + 1].focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index > 0) results[index - 1].focus(); else byId("search-input").focus();
    } else if (event.key === "Escape") {
      event.preventDefault(); closeSearch();
    }
  });

  /* ---------- Library API ---------- */

  function setLibraryBusy(busy) {
    const main = byId("main-content");
    const recent = byId("recent-row");
    main?.setAttribute("aria-busy", String(Boolean(busy)));
    recent?.setAttribute("aria-busy", String(Boolean(busy) && !state.libraryLoaded));
  }

  function showLibraryOffline(message) {
    state.libraryOffline = true;
    byId("library-connection-message").textContent = message || "NEXORA cannot reach your local media server. Check that it is running, then retry.";
    byId("library-connection-error").hidden = false;
    byId("library-status").textContent = "LIBRARY OFFLINE";
    if (!state.libraryLoaded) {
      byId("result-count").textContent = "OFFLINE";
      byId("recent-row").innerHTML = '<p class="empty-state" role="status">Your library is unavailable until the NEXORA server reconnects.</p>';
      if (state.page !== "discover") {
        byId("empty-library").hidden = false;
        byId("empty-title").textContent = "Server connection problem";
        byId("empty-message").textContent = "Start the NEXORA server and use Retry to reconnect to your media library.";
      }
    } else {
      byId("library-connection-message").textContent = "The NEXORA server is temporarily unreachable. Your last loaded library is still shown.";
    }
  }

  async function fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { cache: "no-store", signal: controller.signal });
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function loadLibrary(initial = false) {
    if (state.libraryBusy) return;
    state.libraryBusy = true;
    setLibraryBusy(true);
    if (!state.libraryLoaded) {
      byId("library-status").textContent = "CONNECTING TO YOUR LIBRARY";
      byId("result-count").textContent = "LOADING";
      byId("recent-row").innerHTML = '<p class="empty-state" role="status">Looking through your collection…</p>';
      if (state.page !== "discover") renderCollection();
    } else {
      byId("library-status").textContent = "UPDATING YOUR LIBRARY";
    }

    try {
      let health;
      try {
        health = await fetchWithTimeout("/api/health", 5000);
      } catch (error) {
        if (error?.name === "AbortError") throw new Error("The NEXORA server did not respond within 5 seconds. Check that it is running, then retry.");
        throw new Error("The NEXORA server is unreachable. Check the server terminal and retry.");
      }
      if (!health.ok) throw new Error(`NEXORA health check returned ${health.status}. Restart the server and retry.`);
      const healthData = await health.json().catch(() => null);
      if (!healthData || healthData.success !== true || healthData.status !== "online") {
        throw new Error("NEXORA is running but did not report a healthy status. Restart the server and retry.");
      }

      let response;
      try {
        response = await fetchWithTimeout("/api/library", 20000);
      } catch (error) {
        if (error?.name === "AbortError") throw new Error("The library scan took longer than 20 seconds. The server may be busy; retry shortly.");
        throw new Error("The NEXORA library endpoint could not be reached. Check the server and retry.");
      }
      if (!response.ok) throw new Error(`Library request returned ${response.status}. Check the NEXORA server terminal and retry.`);
      const data = await response.json();
      if (!data || !Array.isArray(data.files)) throw new Error("The NEXORA server returned an invalid library response. Restart the server and retry.");

      state.files = data.files.filter(file => file && typeof file.id === "string" && typeof file.path === "string");
      state.fileById = new Map(state.files.map(file => [file.id, file]));
      state.searchIndex = new Map(state.files.map(file => [file.id,
        [file.name, file.fileName, file.path, categoryOf(file), genreOf(file), subgenreOf(file), partsOf(file).join(" ")]
          .join(" ").toLowerCase()
      ]));
      state.folders = Array.isArray(data.folders) ? data.folders : [];
      state.libraryLoaded = true;
      state.libraryOffline = false;
      byId("library-connection-error").hidden = true;
      byId("library-status").textContent = `${state.files.length} TITLES IN YOUR LIBRARY`;
      renderHome();
      if (!byId("search-layer").hidden) renderOverlaySearch(byId("search-input").value, overlaySearchToken);
      if (state.page !== "discover") {
        renderCollection();
        if (state.activePreviewKind !== "ambience" || !state.activePreviewFile || !state.fileById.has(state.activePreviewFile.id)) {
          stopActivePreview();
          startAmbientPreviewCycle();
        }
      }
      else if (state.files.some(file => file.type === "video") && !state.fileById.has(state.heroFeaturedId)) advanceHero();
      else if (!state.files.some(file => file.type === "video") && state.heroFeaturedId) showEmptyHero();

      if (initial && !state.sharedHandled) {
        state.sharedHandled = true;
        const sharedId = new URLSearchParams(location.search).get("play");
        if (sharedId) {
          const file = state.fileById.get(sharedId);
          if (file) openPlayer(file, state.files);
          else toast("That shared title is not in this library.");
        }
      }
    } catch (error) {
      console.error("[NEXORA] Library load failed:", error);
      showLibraryOffline(error.message);
      if (state.page !== "discover" && !state.libraryLoaded) {
        byId("empty-library").hidden = false;
      }
    } finally {
      state.libraryBusy = false;
      setLibraryBusy(false);
    }
  }

  byId("library-retry").addEventListener("click", () => {
    void loadLibrary(!state.libraryLoaded);
  });

  /* ---------- Player ---------- */

  function mediaNow() {
    return state.activeMedia;
  }

  function setPlaying(playing) {
    const stage = byId("stage");
    stage.classList.toggle("is-playing", playing);
    stage.classList.toggle("is-paused", !playing);
    byId("play").dataset.state = playing ? "playing" : "paused";
    byId("play").setAttribute("aria-label", playing ? "Pause" : "Play");
    byId("center-play").dataset.state = playing ? "playing" : "paused";
    byId("center-play").setAttribute("aria-label", playing ? "Pause" : "Play");
    byId("mini-play").dataset.state = playing ? "playing" : "paused";
    byId("mini-play").setAttribute("aria-label", playing ? "Pause" : "Play");
    miniPlayer.classList.toggle("is-playing", playing);
    byId("audio-visual").classList.toggle("is-playing", playing && state.currentFile?.type === "audio");
    byId("mini-art").classList.toggle("is-playing", playing && state.currentFile?.type === "audio");
    showPlayerControls();
  }

  function setMiniAnchor(anchor) {
    const valid = ["top-left", "top-right", "bottom-left", "bottom-right"];
    const chosen = valid.includes(anchor) ? anchor : "bottom-right";
    miniPlayer.style.left = chosen.endsWith("left") ? "18px" : "auto";
    miniPlayer.style.right = chosen.endsWith("right") ? "18px" : "auto";
    miniPlayer.style.top = chosen.startsWith("top") ? "18px" : "auto";
    miniPlayer.style.bottom = chosen.startsWith("bottom") ? "18px" : "auto";
    state.miniPosition = chosen;
    safeWrite("nexora-mini-position", chosen);
  }

  function syncMiniMode(file = state.currentFile) {
    const isAudio = file?.type === "audio";
    miniPlayer.classList.toggle("is-audio-mode", Boolean(isAudio));
    miniPlayer.classList.toggle("is-video-mode", !isAudio);
    byId("mini-video-frame").setAttribute("aria-hidden", String(Boolean(isAudio)));
    byId("mini-art").classList.toggle("is-playing", !mediaNow()?.paused && Boolean(isAudio));
  }

  function moveVideoToMini() {
    if (video.parentElement !== miniVideoSlot) miniVideoSlot.appendChild(video);
    video.style.display = state.currentFile?.type === "audio" ? "none" : "block";
  }

  function moveVideoToStage() {
    const stage = byId("stage");
    if (video.parentElement !== stage) stage.insertBefore(video, stage.firstChild);
    video.style.display = state.currentFile?.type === "audio" ? "none" : "block";
  }

  function updateMiniProgress(media = mediaNow()) {
    if (!media) return;
    const duration = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : 0;
    const pct = duration ? Math.max(0, Math.min(100, media.currentTime / duration * 100)) : 0;
    if (!state.miniSeeking) byId("mini-seek").value = String(pct * 10);
    miniPlayer.style.setProperty("--mini-played", `${pct}%`);
    byId("mini-time").textContent = duration
      ? `${formatTime(media.currentTime)} / ${formatTime(duration)}`
      : formatTime(media.currentTime);
  }

  function showMiniControls(autoHide = true) {
    if (miniPlayer.hidden) return;
    miniPlayer.classList.add("controls-visible");
    clearTimeout(state.miniHideTimer);
    if (autoHide && window.matchMedia("(hover: none), (pointer: coarse)").matches) {
      state.miniHideTimer = setTimeout(() => {
        miniPlayer.classList.remove("controls-visible");
      }, 2600);
    }
  }

  function getMiniMotionDuration() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 620;
  }

  function cancelMiniAnimations() {
    state.miniAnimations.forEach(animation => {
      try { animation.cancel(); } catch {}
    });
    state.miniAnimations = [];
  }

  function minimizePlayer() {
    if (!state.currentFile || !mediaNow() || state.wasMinimized) return;
    cancelMiniAnimations();
    saveProgress();
    if (state.page === "discover") renderContinueWatching();
    closeSettings();
    byId("player-info-card").hidden = true;
    const stage = byId("stage");
    const originRect = (state.currentFile.type === "audio" ? playerWindow : stage).getBoundingClientRect();
    const activeFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
    if (activeFullscreen && (activeFullscreen === stage || stage.contains(activeFullscreen))) {
      const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
      try { Promise.resolve(exitFullscreen?.call(document)).catch(() => {}); } catch {}
      try { screen.orientation?.unlock?.(); } catch {}
    }

    syncMiniMode(state.currentFile);
    if (state.currentFile.type === "video") moveVideoToMini();
    if (typeof state.miniPosition === "string") setMiniAnchor(state.miniPosition);
    miniPlayer.hidden = false;
    state.wasMinimized = true;
    document.body.style.overflow = "";
    updateMiniProgress();
    miniPlayer.classList.remove("controls-visible");
    if (window.matchMedia("(hover: none), (pointer: coarse)").matches) showMiniControls();

    const token = ++state.miniTransitionToken;
    playerLayer.classList.add("is-minimizing");
    requestAnimationFrame(() => {
      if (token !== state.miniTransitionToken) return;
      const targetRect = miniPlayer.getBoundingClientRect();
      const sx = Math.max(.08, originRect.width / Math.max(1, targetRect.width));
      const sy = Math.max(.08, originRect.height / Math.max(1, targetRect.height));
      const dx = originRect.left - targetRect.left;
      const dy = originRect.top - targetRect.top;
      const duration = getMiniMotionDuration();
      const miniAnimation = miniPlayer.animate([
        { transformOrigin: "top left", transform: `translate3d(${dx}px,${dy}px,0) scale(${sx},${sy})`, borderRadius: "11px", opacity: .96 },
        { transformOrigin: "top left", transform: "translate3d(0,0,0) scale(1,1)", borderRadius: "12px", opacity: 1 }
      ], { duration, easing: "cubic-bezier(.18,.82,.2,1)", fill: "both" });
      const layerAnimation = playerWindow.animate([
        { opacity: 1, transform: "scale(1)" },
        { opacity: 0, transform: "scale(.975)" }
      ], { duration: Math.min(duration, 430), easing: "cubic-bezier(.4,0,.8,.4)", fill: "both" });
      state.miniAnimations = [miniAnimation, layerAnimation];
      Promise.all([miniAnimation.finished.catch(() => {}), layerAnimation.finished.catch(() => {})]).then(() => {
        if (token !== state.miniTransitionToken) return;
        playerLayer.hidden = true;
        playerLayer.classList.remove("is-minimizing");
        playerWindow.style.opacity = "";
        playerWindow.style.transform = "";
        miniAnimation.cancel();
        layerAnimation.cancel();
        state.miniAnimations = [];
        if (state.page === "discover" && !document.hidden && state.heroFeaturedId) {
          const featured = state.fileById.get(state.heroFeaturedId);
          if (featured) startHeroPreview(featured);
        }
      });
    });
  }

  function expandMiniPlayer() {
    if (miniPlayer.hidden || !state.wasMinimized) return;
    const miniRect = miniPlayer.getBoundingClientRect();
    cancelMiniAnimations();
    const token = ++state.miniTransitionToken;
    clearTimeout(state.miniHideTimer);
    playerLayer.hidden = false;
    playerLayer.classList.remove("is-minimizing");
    document.body.style.overflow = "hidden";
    moveVideoToStage();
    miniPlayer.hidden = true;
    state.wasMinimized = false;
    closeSettings();

    requestAnimationFrame(() => {
      if (token !== state.miniTransitionToken) return;
      const targetRect = playerWindow.getBoundingClientRect();
      const sx = Math.max(.08, miniRect.width / Math.max(1, targetRect.width));
      const sy = Math.max(.08, miniRect.height / Math.max(1, targetRect.height));
      const dx = miniRect.left - targetRect.left;
      const dy = miniRect.top - targetRect.top;
      const duration = getMiniMotionDuration();
      const animation = playerWindow.animate([
        { transformOrigin: "top left", transform: `translate3d(${dx}px,${dy}px,0) scale(${sx},${sy})`, opacity: .95 },
        { transformOrigin: "top left", transform: "translate3d(0,0,0) scale(1,1)", opacity: 1 }
      ], { duration, easing: "cubic-bezier(.18,.82,.2,1)", fill: "both" });
      const overlayAnimation = playerLayer.animate([
        { opacity: 0 }, { opacity: 1 }
      ], { duration: Math.min(duration, 390), easing: "ease-out", fill: "both" });
      state.miniAnimations = [animation, overlayAnimation];
      Promise.all([animation.finished.catch(() => {}), overlayAnimation.finished.catch(() => {})]).then(() => {
        if (token !== state.miniTransitionToken) return;
        playerWindow.style.opacity = "";
        playerWindow.style.transform = "";
        animation.cancel();
        overlayAnimation.cancel();
        state.miniAnimations = [];
        showPlayerControls();
      });
    });
  }

  function updatePlayerDetails(file) {
    byId("player-title").textContent = titleOf(file);
    byId("mini-title").textContent = titleOf(file);
    byId("mini-subtitle").textContent = `${categoryOf(file)} · ${genreOf(file)}`;
    byId("info-name").textContent = titleOf(file);
    byId("info-path").textContent = file.path || "";
    byId("info-format").textContent = `${String(file.extension || "").toUpperCase()} · ${formatSize(file.size)}`;
    const downloadLink = byId("download-link");
    const downloadParams = new URLSearchParams({ path: file.path });
    downloadLink.href = `/api/download?${downloadParams.toString()}`;
    // The server also sends Content-Disposition: attachment. This same-origin
    // hint helps browsers which otherwise try to open supported media inline.
    downloadLink.download = file.fileName || `${titleOf(file)}.${file.extension || "bin"}`;
    downloadLink.setAttribute("aria-label", `Download ${titleOf(file)}`);
    downloadLink.title = `Download ${titleOf(file)}`;
    downloadLink.dataset.downloadReady = "true";
    byId("player-file-label").textContent = `${categoryOf(file).toUpperCase()} · ${String(file.extension || "").toUpperCase()}`;
    const thumb = file.type === "video" ? thumbnailURL(file, 240) : "";
    byId("mini-art").style.backgroundImage = thumb ? `url("${thumb}")` : "none";
    byId("mini-art").textContent = thumb ? "" : "♫";
    syncMiniMode(file);
    updateMiniProgress();
  }

  byId("download-link").addEventListener("click", event => {
    const link = byId("download-link");
    if (!state.currentFile || link.dataset.downloadReady !== "true" || !link.href.includes("/api/download?")) {
      event.preventDefault();
      toast("The download is not ready yet. Reopen the title and try again.");
    }
  });

  let queueObserver = null;
  const QUEUE_BATCH_SIZE = 36;

  function appendQueueBatch(target = byId("up-next-list")) {
    const queue = state.queue;
    const start = Number(target.dataset.renderedCount) || 0;
    const end = Math.min(queue.length, start + QUEUE_BATCH_SIZE);
    if (end <= start) return;
    const sentinel = target.querySelector(".queue-load-sentinel");
    const template = document.createElement("template");
    template.innerHTML = queue.slice(start, end).map((file, offset) => {
      const index = start + offset;
      const thumb = file.type === "video" ? thumbnailURL(file, 180) : "";
      const current = file.id === state.currentFile?.id;
      return `<button type="button" class="queue-item ${current ? "current" : ""}" data-queue-index="${index}"><span class="queue-thumb">${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" decoding="async" data-remove-on-error="true">` : ""}</span><span class="queue-copy"><strong>${esc(titleOf(file))}</strong><small>${current ? "NOW PLAYING" : esc(genreOf(file))}</small></span></button>`;
    }).join("");
    target.insertBefore(template.content, sentinel || null);
    target.dataset.renderedCount = String(end);
    if (end >= queue.length) {
      sentinel?.remove();
      queueObserver?.disconnect();
      queueObserver = null;
    }
  }

  function renderQueue() {
    const target = byId("up-next-list");
    queueObserver?.disconnect();
    queueObserver = null;
    target.dataset.renderedCount = "0";
    byId("queue-count").textContent = `${state.queue.length} ITEMS`;
    if (!state.queue.length) {
      target.innerHTML = '<p class="queue-empty">Open a title from your collection to build a play queue.</p>';
      return;
    }
    const initialEnd = Math.min(state.queue.length, QUEUE_BATCH_SIZE);
    target.innerHTML = state.queue.length > QUEUE_BATCH_SIZE
      ? '<div class="queue-load-sentinel" aria-live="polite">More in your queue</div>'
      : "";
    if (typeof IntersectionObserver === "function" && state.queue.length > QUEUE_BATCH_SIZE) {
      queueObserver = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) appendQueueBatch(target);
      }, { root: target, rootMargin: "320px 0px", threshold: 0 });
      queueObserver.observe(target.querySelector(".queue-load-sentinel"));
      appendQueueBatch(target);
    } else {
      appendQueueBatch(target);
      if (state.queue.length > initialEnd) {
        const append = () => {
          if (!target.isConnected || !target.querySelector(".queue-load-sentinel")) return;
          appendQueueBatch(target);
          if (target.querySelector(".queue-load-sentinel")) requestAnimationFrame(append);
        };
        // The placeholder was created above for both observer and fallback
        // paths. Reuse it; adding a second one leaves a stray row at the end.
        requestAnimationFrame(append);
      }
    }
  }

  function openPlayer(file, queue = state.files) {
    if (!file?.path) return;
    ++state.miniTransitionToken;
    cancelMiniAnimations();
    moveVideoToStage();
    miniPlayer.hidden = true;
    playerLayer.classList.remove("is-minimizing");
    playerWindow.style.opacity = "";
    playerWindow.style.transform = "";
    stopCardPreview();
    stopActivePreview();
    state.queue = queue.length ? [...queue] : [file];
    state.queueIndex = Math.max(0, state.queue.findIndex(item => item.id === file.id));
    if (!state.queue.some(item => item.id === file.id)) {
      state.queue.unshift(file);
      state.queueIndex = 0;
    }
    state.shuffle = false;
    state.repeat = false;
    state.autoplay = true;
    byId("shuffle").setAttribute("aria-pressed", "false");
    byId("shuffle").classList.remove("active");
    byId("repeat").setAttribute("aria-pressed", "false");
    byId("repeat").classList.remove("active");
    byId("autoplay").setAttribute("aria-pressed", "true");
    byId("autoplay").classList.add("active");
    byId("player-info-card").hidden = true;
    byId("player-error").hidden = true;
    byId("mini-player").hidden = true;
    playerLayer.hidden = false;
    playerWindow.classList.remove("is-minimized", "queue-open", "queue-collapsed");
    animatePlayerOpen();
    byId("queue-toggle").setAttribute("aria-expanded", "false");
    state.wasMinimized = false;
    document.body.style.overflow = "hidden";
    loadPlayerFile(file, true);
  }

  function clearSubtitleElements() {
    for (const node of state.subtitleNodes) {
      try { node.track.mode = "disabled"; } catch {}
      node.remove();
    }
    state.subtitleNodes = [];
    state.subtitleTracks = [];
    state.selectedSubtitleId = "off";
    if (video.textTracks) {
      for (const track of video.textTracks) {
        try { track.mode = "disabled"; } catch {}
      }
    }
    renderSubtitleOptions();
  }

  function subtitleSource(file, track) {
    const params = new URLSearchParams({ path: file.path, id: track.id });
    return `/api/subtitle?${params.toString()}`;
  }

  function renderSubtitleOptions() {
    const target = byId("subtitle-options");
    if (!target) return;
    const items = [
      { id: "off", label: "Off", language: "off" },
      ...state.subtitleTracks
    ];
    target.innerHTML = items.map(track => `
      <button class="subtitle-option ${track.id === state.selectedSubtitleId ? "active" : ""}"
        type="button" data-subtitle-id="${esc(track.id)}">
        <span>${esc(track.label)}</span>
        <svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>
      </button>
    `).join("");
    byId("subtitle-status").textContent = state.subtitleTracks.length
      ? (state.subtitleTracks.find(track => track.id === state.selectedSubtitleId)?.label || "Off")
      : (state.currentFile?.type === "audio" ? "Not available for audio" : "No tracks found");
    byId("captions-button").setAttribute("aria-pressed", String(state.selectedSubtitleId !== "off"));
    target.querySelectorAll("[data-subtitle-id]").forEach(button => {
      button.addEventListener("click", () => selectSubtitle(button.dataset.subtitleId));
    });
  }

  function selectSubtitle(id, persist = true) {
    const track = state.subtitleTracks.find(item => item.id === id);
    state.subtitleNodes.forEach(node => {
      try { node.track.mode = "disabled"; } catch {}
    });
    state.selectedSubtitleId = track ? track.id : "off";
    if (track) {
      const node = state.subtitleNodes.find(item => item.dataset.subtitleId === track.id);
      if (node) {
        try { node.track.mode = "showing"; } catch {}
      }
    }
    if (persist) safeWrite("nexora-subtitle-preference", state.selectedSubtitleId === "off" ? "off" : (track?.language === "en" ? "en" : track.id));
    renderSubtitleOptions();
  }

  async function discoverSubtitles(file) {
    if (!file || state.subtitleDiscoveryFor === file.id) return;
    state.subtitleDiscoveryFor = file.id;
    clearSubtitleElements();
    if (!file || file.type !== "video") {
      renderSubtitleOptions();
      return;
    }

    byId("subtitle-status").textContent = "Checking available tracks…";
    try {
      const response = await fetch(`/api/subtitles?path=${encodeURIComponent(file.path)}`, { cache: "no-store" });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail || `Subtitle request failed (${response.status})`);
      }
      const data = await response.json();
      if (state.currentFile?.id !== file.id || state.activeMedia !== video) return;
      state.subtitleTracks = Array.isArray(data.tracks) ? data.tracks : [];

      for (const track of state.subtitleTracks) {
        const node = document.createElement("track");
        node.kind = "subtitles";
        node.label = track.label;
        if (track.language && track.language !== "und") node.srclang = track.language;
        node.src = subtitleSource(file, track);
        node.dataset.subtitleId = track.id;
        node.addEventListener("load", () => {
          if (state.selectedSubtitleId === track.id) {
            try { node.track.mode = "showing"; } catch {}
          }
        });
        node.addEventListener("error", () => {
          if (state.selectedSubtitleId === track.id) {
            byId("subtitle-status").textContent = "Could not load this track";
            toast(`Subtitle could not be loaded: ${track.label}`);
          }
        });
        video.appendChild(node);
        state.subtitleNodes.push(node);
        try { node.track.mode = "disabled"; } catch {}
      }

      const preference = safeRead("nexora-subtitle-preference", "en");
      let preferred = state.subtitleTracks.find(track => track.id === preference);
      if (!preferred && preference === "en") {
        preferred = state.subtitleTracks.find(track => track.language === "en");
      }
      if (!preferred && preference !== "off") {
        preferred = state.subtitleTracks.find(track => track.language === "en");
      }
      selectSubtitle(preferred?.id || "off", false);
    } catch (error) {
      if (state.currentFile?.id === file.id) {
        console.warn("[NEXORA] Subtitle discovery failed:", error.message);
        state.subtitleTracks = [];
        renderSubtitleOptions();
        byId("subtitle-status").textContent = "Subtitle service unavailable";
      }
    }
  }

  function loadPlayerFile(file, resume = false) {
    state.currentFile = file;
    state.subtitleDiscoveryFor = null;
    const isAudio = file.type === "audio";
    const media = isAudio ? audio : video;
    state.activeMedia = media;
    if (state.wasMinimized) {
      if (isAudio) moveVideoToStage();
      else moveVideoToMini();
      syncMiniMode(file);
    }
    clearSubtitleElements();
    video.pause();
    audio.pause();
    video.removeAttribute("src");
    audio.removeAttribute("src");
    video.load();
    audio.load();
    video.style.display = isAudio ? "none" : "block";
    byId("audio-visual").hidden = !isAudio;
    byId("captions-button").disabled = isAudio;
    updatePlayerDetails(file);
    byId("player-error").hidden = true;
    byId("player-loader").hidden = false;
    byId("time-now").textContent = "0:00";
    byId("time-total").textContent = "0:00";
    byId("seek").value = "0";
    $(".timeline-range").style.setProperty("--played", "0%");
    const resumeAt = resume ? Number(state.progress[file.id]?.time || 0) : 0;
    const loadToken = ++state.playerLoadToken;
    if (state.pendingMetadataMedia && state.pendingMetadataHandler) {
      state.pendingMetadataMedia.removeEventListener("loadedmetadata", state.pendingMetadataHandler);
    }
    const metadata = () => {
      if (state.pendingMetadataHandler === metadata) {
        state.pendingMetadataMedia = null;
        state.pendingMetadataHandler = null;
      }
      // A late metadata event from a previous source must never seek or update
      // the UI for the title which replaced it.
      if (loadToken !== state.playerLoadToken || state.currentFile?.id !== file.id || media !== mediaNow()) return;
      byId("player-loader").hidden = true;
      if (resumeAt > 8 && Number.isFinite(media.duration) && resumeAt < media.duration - 12) media.currentTime = resumeAt;
      byId("time-total").textContent = formatTime(media.duration);
      updateMiniProgress(media);
      if (!isAudio) void discoverSubtitles(file);
    };
    state.pendingMetadataMedia = media;
    state.pendingMetadataHandler = metadata;
    media.addEventListener("loadedmetadata", metadata, { once: true });
    media.src = `/api/stream?path=${encodeURIComponent(file.path)}`;
    media.load();
    if (!isAudio) {
      state.subtitleDiscoveryFor = null;
      byId("subtitle-status").textContent = "Waiting for video metadata…";
    }
    renderQueue();
    showPlayerControls();
    media.play().then(() => {
      if (loadToken === state.playerLoadToken && media === mediaNow()) setPlaying(true);
    }).catch(error => {
      if (loadToken !== state.playerLoadToken || media !== mediaNow()) return;
      byId("player-loader").hidden = true;
      setPlaying(false);
      if (error?.name !== "NotAllowedError") toast("Playback could not start. Check the file format and server connection.");
    });
  }

  function saveProgress(forcePersist = true) {
    const media = mediaNow();
    if (!media || !state.currentFile || !Number.isFinite(media.currentTime) || media.currentTime <= 0) return;
    const now = Date.now();
    state.progress[state.currentFile.id] = {
      time: media.currentTime,
      duration: Number.isFinite(media.duration) ? media.duration : 0,
      updatedAt: now
    };
    if (forcePersist || now - state.lastProgressPersistAt >= 12000) {
      safeWrite("nexora-progress", state.progress);
      state.lastProgressPersistAt = now;
    }
  }

  function closePlayer() {
    const media = mediaNow();
    if (media) {
      saveProgress();
      media.pause();
      media.removeAttribute("src");
      media.load();
    }
    video.pause();
    video.removeAttribute("src");
    video.load();
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    moveVideoToStage();
    ++state.miniTransitionToken;
    cancelMiniAnimations();
    clearTimeout(state.miniHideTimer);
    state.playerLoadToken += 1;
    if (state.pendingMetadataMedia && state.pendingMetadataHandler) {
      state.pendingMetadataMedia.removeEventListener("loadedmetadata", state.pendingMetadataHandler);
    }
    state.pendingMetadataMedia = null;
    state.pendingMetadataHandler = null;
    playerLayer.hidden = true;
    playerLayer.classList.remove("is-minimizing");
    playerWindow.style.opacity = "";
    playerWindow.style.transform = "";
    playerWindow.classList.remove("is-minimized", "queue-open", "queue-collapsed");
    byId("queue-toggle").setAttribute("aria-expanded", "false");
    state.wasMinimized = false;
    closeSettings();
    clearSubtitleElements();
    byId("mini-player").hidden = true;
    byId("share-dialog").hidden = true;
    document.body.style.overflow = "";
    state.currentFile = null;
    state.activeMedia = null;
    renderContinueWatching();
    clearTimeout(state.controlsTimer);
    if (state.page === "discover" && state.heroFeaturedId) {
      const featured = state.fileById.get(state.heroFeaturedId);
      if (featured) startHeroPreview(featured);
    } else {
      startAmbientPreviewCycle({ resumeCurrent: true });
    }
  }

  function togglePlayback() {
    const media = mediaNow();
    if (!media) return;
    if (media.paused) {
      media.play().catch(() => toast("Playback could not start. Check this file's format."));
    } else {
      media.pause();
    }
  }

  function nextTrack(manual = false) {
    if (!state.queue.length) return;
    if (state.repeat && !manual) {
      const media = mediaNow();
      media.currentTime = 0;
      media.play().catch(() => {});
      return;
    }
    let index = state.queueIndex + 1;
    if (state.shuffle && state.queue.length > 1) {
      do { index = Math.floor(Math.random() * state.queue.length); }
      while (index === state.queueIndex);
    }
    if (index >= state.queue.length) {
      if (state.autoplay || manual) index = 0;
      else return;
    }
    state.queueIndex = index;
    loadPlayerFile(state.queue[index], false);
  }

  function previousTrack() {
    const media = mediaNow();
    if (!media || !state.queue.length) return;
    if (media.currentTime > 5) {
      media.currentTime = 0;
      return;
    }
    state.queueIndex = (state.queueIndex - 1 + state.queue.length) % state.queue.length;
    loadPlayerFile(state.queue[state.queueIndex], false);
  }

  function bindMedia(media) {
    media.addEventListener("play", () => {
      if (media === mediaNow()) setPlaying(true);
    });
    media.addEventListener("pause", () => {
      if (media === mediaNow()) setPlaying(false);
    });
    media.addEventListener("waiting", () => {
      if (media === mediaNow()) {
        byId("player-loader").hidden = false;
        miniPlayer.classList.add("is-buffering");
      }
    });
    media.addEventListener("canplay", () => {
      if (media === mediaNow()) {
        byId("player-loader").hidden = true;
        miniPlayer.classList.remove("is-buffering");
      }
    });
    media.addEventListener("timeupdate", () => {
      if (media !== mediaNow()) return;
      if (Number.isFinite(media.duration) && media.duration > 0) {
        const pct = Math.max(0, Math.min(100, media.currentTime / media.duration * 100));
        byId("seek").value = String(pct * 10);
        $(".timeline-range").style.setProperty("--played", `${pct}%`);
        byId("time-now").textContent = formatTime(media.currentTime);
        byId("time-total").textContent = formatTime(media.duration);
      }
      updateMiniProgress(media);
      saveProgress(false);
    });
    media.addEventListener("ended", () => {
      if (media !== mediaNow()) return;
      saveProgress();
      if (state.repeat) {
        media.currentTime = 0;
        media.play().catch(() => {});
      } else if (state.autoplay) {
        nextTrack(false);
      } else {
        setPlaying(false);
      }
    });
    media.addEventListener("error", () => {
      if (media !== mediaNow() || !state.currentFile || !isPlayerPresented()) return;
      byId("player-loader").hidden = true;
      const message = "This browser could not decode this file. MP4 (H.264/AAC) and WebM are widely supported; MKV and some audio codecs may require conversion.";
      if (state.wasMinimized) toast(message);
      else {
        byId("player-error").hidden = false;
        byId("player-error").textContent = message;
      }
    });
  }

  bindMedia(video);
  bindMedia(audio);

  /* Player control wiring */
  byId("player-back").addEventListener("click", minimizePlayer);
  byId("center-play").addEventListener("click", togglePlayback);
  video.addEventListener("click", () => {
    if (!playerLayer.hidden && !state.wasMinimized) {
      togglePlayback();
      showPlayerControls();
    }
  });
  byId("play").addEventListener("click", togglePlayback);
  byId("previous-track").addEventListener("click", previousTrack);
  byId("next-track").addEventListener("click", () => nextTrack(true));
  byId("back10").addEventListener("click", () => {
    const media = mediaNow();
    if (media) media.currentTime = Math.max(0, media.currentTime - 10);
  });
  byId("forward30").addEventListener("click", () => {
    const media = mediaNow();
    if (media) media.currentTime = Math.min(media.duration || Infinity, media.currentTime + 30);
  });
  byId("seek").addEventListener("input", event => {
    const media = mediaNow();
    if (media && Number.isFinite(media.duration)) media.currentTime = Number(event.target.value) / 1000 * media.duration;
  });
  byId("volume").addEventListener("input", event => {
    const media = mediaNow();
    if (media) {
      media.volume = Number(event.target.value);
      media.muted = false;
    }
  });
  byId("mute").addEventListener("click", () => {
    const media = mediaNow();
    if (media) media.muted = !media.muted;
  });
  [video, audio].forEach(media => media.addEventListener("volumechange", () => {
    if (media !== mediaNow()) return;
    byId("volume").value = media.muted ? "0" : String(media.volume);
    byId("mute").dataset.state = media.muted || media.volume === 0 ? "muted" : "unmuted";
    byId("mute").setAttribute("aria-label", media.muted || media.volume === 0 ? "Unmute" : "Mute");
  }));
  byId("speed").addEventListener("change", event => {
    const media = mediaNow();
    if (media) media.playbackRate = Number(event.target.value) || 1;
  });
  byId("shuffle").addEventListener("click", () => {
    state.shuffle = !state.shuffle;
    byId("shuffle").setAttribute("aria-pressed", String(state.shuffle));
    byId("shuffle").classList.toggle("active", state.shuffle);
    toast(state.shuffle ? "Shuffle on" : "Shuffle off");
  });
  byId("repeat").addEventListener("click", () => {
    state.repeat = !state.repeat;
    byId("repeat").setAttribute("aria-pressed", String(state.repeat));
    byId("repeat").classList.toggle("active", state.repeat);
    toast(state.repeat ? "Repeat current title on" : "Repeat off");
  });
  byId("autoplay").addEventListener("click", () => {
    state.autoplay = !state.autoplay;
    byId("autoplay").setAttribute("aria-pressed", String(state.autoplay));
    byId("autoplay").classList.toggle("active", state.autoplay);
    toast(state.autoplay ? "Autoplay next on" : "Autoplay next off");
  });
  byId("up-next-list").addEventListener("click", event => {
    const button = event.target.closest("[data-queue-index]");
    if (!button) return;
    const index = Number(button.dataset.queueIndex);
    if (!Number.isInteger(index) || !state.queue[index]) return;
    state.queueIndex = index;
    loadPlayerFile(state.queue[index], false);
  });
  byId("fullscreen").addEventListener("click", async () => {
    const stage = byId("stage");
    const activeFullscreen = document.fullscreenElement || document.webkitFullscreenElement || null;
    try {
      if (!activeFullscreen) {
        const requestFullscreen = stage.requestFullscreen || stage.webkitRequestFullscreen;
        if (typeof requestFullscreen !== "function") throw new Error("Fullscreen API unavailable");
        // Ask mobile browsers to hide browser chrome where the platform allows it.
        await requestFullscreen.call(stage, { navigationUI: "hide" });
        // Landscape makes a phone's video canvas use the widest available viewport.
        // Browsers that disallow orientation locking simply continue normally.
        if (window.matchMedia?.("(pointer: coarse) and (max-width: 900px)").matches &&
            typeof screen.orientation?.lock === "function") {
          try { await screen.orientation.lock("landscape"); } catch {}
        }
      } else {
        const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
        if (typeof exitFullscreen === "function") await exitFullscreen.call(document);
        try { screen.orientation?.unlock?.(); } catch {}
      }
    } catch {
      toast("Fullscreen is unavailable in this browser.");
    }
  });
  byId("pip").addEventListener("click", async () => {
    const media = mediaNow();
    try {
      if (!media || media === audio || !document.pictureInPictureEnabled || !media.requestPictureInPicture) {
        toast("Picture in picture is not available for this media or browser.");
        return;
      }
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await media.requestPictureInPicture();
    } catch {
      toast("Picture in picture could not start.");
    }
  });
  byId("player-info-toggle").addEventListener("click", () => {
    byId("player-info-card").hidden = !byId("player-info-card").hidden;
  });

  function openSettings() {
    byId("settings-panel").hidden = false;
    byId("settings-scrim").hidden = false;
    byId("settings-open").setAttribute("aria-expanded", "true");
    state.settingsOpen = true;
    showPlayerControls();
  }

  function closeSettings() {
    if (!byId("settings-panel")) return;
    byId("settings-panel").hidden = true;
    byId("settings-scrim").hidden = true;
    byId("settings-open")?.setAttribute("aria-expanded", "false");
    state.settingsOpen = false;
  }

  byId("settings-open").addEventListener("click", () => {
    if (state.settingsOpen) closeSettings();
    else openSettings();
  });
  byId("captions-button").addEventListener("click", () => {
    if (state.currentFile?.type === "audio") return;
    if (state.currentFile && video.readyState < HTMLMediaElement.HAVE_METADATA) byId("subtitle-status").textContent = "Waiting for video metadata…";
    else if (state.currentFile && state.subtitleDiscoveryFor !== state.currentFile.id) void discoverSubtitles(state.currentFile);
    openSettings();
    byId("subtitle-options").scrollIntoView({ block: "nearest" });
  });
  byId("settings-close").addEventListener("click", closeSettings);
  byId("settings-scrim").addEventListener("click", closeSettings);
  byId("subtitle-size").addEventListener("change", event => {
    document.documentElement.style.setProperty("--subtitle-size", event.target.value);
    safeWrite("nexora-subtitle-size", event.target.value);
  });
  const storedSubtitleSize = safeRead("nexora-subtitle-size", "100%");
  if (["90%", "100%", "115%", "130%"].includes(storedSubtitleSize)) {
    byId("subtitle-size").value = storedSubtitleSize;
    document.documentElement.style.setProperty("--subtitle-size", storedSubtitleSize);
  }
  byId("queue-toggle").addEventListener("click", () => {
    const mobile = window.matchMedia("(max-width: 900px)").matches;
    const className = mobile ? "queue-open" : "queue-collapsed";
    playerWindow.classList.toggle(className);
    const expanded = playerWindow.classList.contains(className);
    byId("queue-toggle").setAttribute("aria-expanded", String(expanded));
    showPlayerControls();
  });
  byId("mini-expand").addEventListener("click", expandMiniPlayer);
  byId("mini-play").addEventListener("click", () => {
    togglePlayback();
    showMiniControls();
  });
  byId("mini-close").addEventListener("click", closePlayer);
  byId("mini-seek").addEventListener("pointerdown", () => { state.miniSeeking = true; });
  byId("mini-seek").addEventListener("pointerup", () => {
    state.miniSeeking = false;
    updateMiniProgress();
  });
  byId("mini-seek").addEventListener("pointercancel", () => {
    state.miniSeeking = false;
    updateMiniProgress();
  });
  byId("mini-seek").addEventListener("change", () => {
    state.miniSeeking = false;
    updateMiniProgress();
  });
  byId("mini-seek").addEventListener("input", event => {
    const media = mediaNow();
    if (media && Number.isFinite(media.duration) && media.duration > 0) {
      media.currentTime = Number(event.target.value) / 1000 * media.duration;
      showMiniControls();
    }
  });
  miniPlayer.addEventListener("pointermove", event => {
    if (event.pointerType !== "mouse" || window.matchMedia("(hover: none), (pointer: coarse)").matches) showMiniControls();
  }, { passive: true });
  miniPlayer.addEventListener("pointerdown", event => {
    if (event.pointerType !== "mouse") showMiniControls();
  }, { passive: true });
  miniPlayer.addEventListener("focusin", () => showMiniControls(false));
  miniPlayer.addEventListener("focusout", event => {
    if (!miniPlayer.contains(event.relatedTarget) && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      miniPlayer.classList.remove("controls-visible");
    }
  });

  // Only the dedicated title/grip area starts a drag; playback controls remain independent.
  const miniDragHandle = byId("mini-drag-handle");
  miniDragHandle.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const rect = miniPlayer.getBoundingClientRect();
    state.miniPointer = {
      id: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      left: rect.left,
      top: rect.top
    };
    miniPlayer.style.left = `${rect.left}px`;
    miniPlayer.style.top = `${rect.top}px`;
    miniPlayer.style.right = "auto";
    miniPlayer.style.bottom = "auto";
    miniPlayer.classList.add("is-dragging");
    miniDragHandle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  miniDragHandle.addEventListener("pointermove", event => {
    const drag = state.miniPointer;
    if (!drag || drag.id !== event.pointerId) return;
    drag.left = Math.max(8, Math.min(window.innerWidth - miniPlayer.offsetWidth - 8, event.clientX - drag.offsetX));
    drag.top = Math.max(8, Math.min(window.innerHeight - miniPlayer.offsetHeight - 8, event.clientY - drag.offsetY));
    if (!state.miniPointerFrame) {
      state.miniPointerFrame = requestAnimationFrame(() => {
        state.miniPointerFrame = 0;
        const current = state.miniPointer;
        if (!current) return;
        miniPlayer.style.left = `${current.left}px`;
        miniPlayer.style.top = `${current.top}px`;
      });
    }
  });
  const finishMiniDrag = event => {
    const drag = state.miniPointer;
    if (!drag || drag.id !== event.pointerId) return;
    state.miniPointer = null;
    if (state.miniPointerFrame) cancelAnimationFrame(state.miniPointerFrame);
    state.miniPointerFrame = 0;
    const rect = miniPlayer.getBoundingClientRect();
    const horizontal = rect.left + rect.width / 2 < window.innerWidth / 2 ? "left" : "right";
    const vertical = rect.top + rect.height / 2 < window.innerHeight / 2 ? "top" : "bottom";
    const anchor = `${vertical}-${horizontal}`;
    const finalLeft = horizontal === "left" ? 18 : Math.max(8, window.innerWidth - rect.width - 18);
    const finalTop = vertical === "top" ? 18 : Math.max(8, window.innerHeight - rect.height - 18);
    const dx = rect.left - finalLeft;
    const dy = rect.top - finalTop;
    setMiniAnchor(anchor);
    miniPlayer.classList.remove("is-dragging");
    if (Math.abs(dx) + Math.abs(dy) > 1) {
      miniPlayer.animate([
        { transform: `translate3d(${dx}px,${dy}px,0)` },
        { transform: "translate3d(0,0,0)" }
      ], { duration: 260, easing: "cubic-bezier(.2,.72,.24,1)" });
    }
  };
  miniDragHandle.addEventListener("pointerup", finishMiniDrag);
  miniDragHandle.addEventListener("pointercancel", finishMiniDrag);
  window.addEventListener("resize", () => {
    if (!miniPlayer.hidden && !state.miniPointer && state.miniPosition) setMiniAnchor(state.miniPosition);
  });
  if (typeof state.miniPosition === "string") setMiniAnchor(state.miniPosition);
  async function copyTextFallback(value) {
    // Clipboard API is preferred, but requires a secure context and can be
    // denied by browser permissions. Keep a selection-based fallback for
    // browsers which still support execCommand.
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {
      // Continue to the legacy selection fallback.
    }

    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.setAttribute("aria-hidden", "true");
    field.style.position = "fixed";
    field.style.left = "-9999px";
    field.style.top = "0";
    document.body.appendChild(field);
    try {
      field.focus();
      field.select();
      field.setSelectionRange(0, field.value.length);
      return Boolean(document.execCommand?.("copy"));
    } catch {
      return false;
    } finally {
      field.remove();
    }
  }

  function buildPlaybackShareData(file = state.currentFile) {
    const url = new URL(location.href);
    url.hash = "";
    url.search = "";
    url.searchParams.set("play", file.id);
    const shareUrl = url.toString();
    return {
      url: shareUrl,
      data: {
        title: `${titleOf(file)} · NEXORA`,
        text: `Watch ${titleOf(file)} in NEXORA`,
        url: shareUrl
      }
    };
  }

  function openShareDialog(shareUrl) {
    const dialog = byId("share-dialog");
    byId("share-url").value = shareUrl;
    byId("share-copy-status").textContent = "Select Copy link, or select the URL to copy it manually.";
    byId("share-native").hidden = typeof navigator.share !== "function";
    dialog.hidden = false;
    requestAnimationFrame(() => {
      byId("share-url").focus();
      byId("share-url").select();
    });
  }

  async function copyShareLink() {
    const field = byId("share-url");
    const copied = await copyTextFallback(field.value);
    if (copied) {
      byId("share-copy-status").textContent = "Link copied. Friends can open it while your NEXORA server is online.";
      toast("Playback link copied.");
      return true;
    }
    field.focus();
    field.select();
    byId("share-copy-status").textContent = "Automatic copying is unavailable. The link is selected; copy it manually.";
    return false;
  }

  byId("share-video").addEventListener("click", async () => {
    const file = state.currentFile;
    if (!file) {
      toast("Open a title before sharing it.");
      return;
    }
    const share = buildPlaybackShareData(file);

    // Use the native Android/iOS share sheet directly from this user gesture.
    if (typeof navigator.share === "function") {
      try {
        if (!navigator.canShare || navigator.canShare(share.data)) {
          await navigator.share(share.data);
          toast("NEXORA link shared.");
          return;
        }
      } catch (error) {
        // Closing the native sheet is an intentional cancellation, not a failure.
        if (error?.name === "AbortError") return;
      }
    }

    // Desktop and unsupported mobile browsers try clipboard first. If denied,
    // a visible fallback dialog keeps the URL available without window.prompt.
    if (await copyTextFallback(share.url)) {
      toast("Playback link copied. Friends can open it while your NEXORA server is online.");
      return;
    }
    openShareDialog(share.url);
  });

  byId("share-copy").addEventListener("click", copyShareLink);
  byId("share-native").addEventListener("click", async () => {
    const url = byId("share-url").value;
    const file = state.currentFile;
    if (!file || typeof navigator.share !== "function") return;
    try {
      await navigator.share({ title: `${titleOf(file)} · NEXORA`, text: `Watch ${titleOf(file)} in NEXORA`, url });
      byId("share-copy-status").textContent = "NEXORA link shared.";
      toast("NEXORA link shared.");
    } catch (error) {
      if (error?.name !== "AbortError") byId("share-copy-status").textContent = "The share sheet could not open. Copy the selected link instead.";
    }
  });
  const closeShareDialog = () => { byId("share-dialog").hidden = true; };
  byId("share-close").addEventListener("click", closeShareDialog);
  byId("share-dialog").addEventListener("click", event => {
    if (event.target === byId("share-dialog")) closeShareDialog();
  });


  function showPlayerControls() {
    const stage = byId("stage");
    stage.classList.add("controls-visible");
    stage.classList.remove("controls-idle");
    clearTimeout(state.controlsTimer);
    const media = mediaNow();
    if (!media) return;
    state.controlsTimer = setTimeout(() => {
      if (mediaNow()) {
        stage.classList.remove("controls-visible");
        stage.classList.add("controls-idle");
      }
    }, 2300);
  }

  const playerStage = byId("stage");
  playerStage.addEventListener("pointermove", showPlayerControls, { passive: true });
  playerStage.addEventListener("pointerdown", showPlayerControls, { passive: true });
  playerStage.addEventListener("touchstart", showPlayerControls, { passive: true });
  playerStage.addEventListener("mouseleave", () => {
    if (!mediaNow()) return;
    clearTimeout(state.controlsTimer);
    state.controlsTimer = setTimeout(() => {
      if (mediaNow()) {
        playerStage.classList.remove("controls-visible");
        playerStage.classList.add("controls-idle");
      }
    }, 900);
  });
  const handleFullscreenChange = () => {
    const activeFullscreen = document.fullscreenElement || document.webkitFullscreenElement || null;
    if (!activeFullscreen) {
      try { screen.orientation?.unlock?.(); } catch {}
    }
    if (!playerLayer.hidden && activeFullscreen === playerStage) showPlayerControls();
  };
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

  /* ---------- Keyboard shortcuts ---------- */
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !byId("share-dialog").hidden) {
      byId("share-dialog").hidden = true;
      return;
    }
    if (playerLayer.hidden) {
      if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
        event.preventDefault();
        openSearch();
      }
      if (event.key === "Escape" && !byId("search-layer").hidden) {
        event.preventDefault();
        closeSearch();
      }
      return;
    }
    if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    const media = mediaNow();
    if (event.key === "Escape") {
      if (state.settingsOpen) closeSettings();
      else minimizePlayer();
    }
    if (event.code === "Space") {
      event.preventDefault();
      togglePlayback();
    }
    if (event.key === "ArrowLeft" && media) media.currentTime = Math.max(0, media.currentTime - 5);
    if (event.key === "ArrowRight" && media) media.currentTime = Math.min(media.duration || Infinity, media.currentTime + 5);
    if (event.key === "ArrowUp" && media) media.volume = Math.min(1, media.volume + 0.05);
    if (event.key === "ArrowDown" && media) media.volume = Math.max(0, media.volume - 0.05);
    if (event.key.toLowerCase() === "m" && media) media.muted = !media.muted;
    if (event.key.toLowerCase() === "f") byId("fullscreen").click();
  });

  /* ---------- Lifecycle ---------- */
  function stopLibraryPolling() {
    clearInterval(state.libraryPollTimer);
    state.libraryPollTimer = null;
  }

  function startLibraryPolling() {
    stopLibraryPolling();
    if (document.hidden) return;
    state.libraryPollTimer = window.setInterval(() => {
      if (!document.hidden && !state.libraryBusy && playerLayer.hidden) void loadLibrary(false);
    }, 60000);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopLibraryPolling();
      clearHeroTimers();
      state.typingToken += 1;
      state.heroPreviewWaiting = false;
      state.heroErasePending = false;
      state.heroResumeAfterPreview = null;
      state.heroTitleReadyToErase = false;
      state.heroTitleFinished = false;
      state.heroPreviewFinished = false;
      state.heroAdvanceTriggered = false;
      state.heroExitRequested = false;
      state.heroEraseNow = null;
      clearHeroTransitionBridge();
      stopCardPreview();
      stopActivePreview();
      saveProgress();
    } else if (state.page === "discover") {
      startLibraryPolling();
      if (state.heroFeaturedId) {
        const featured = state.fileById.get(state.heroFeaturedId);
        if (featured) showFeatured(featured);
        else advanceHero();
      } else {
        advanceHero();
      }
    } else {
      startLibraryPolling();
      startAmbientPreviewCycle({ resumeCurrent: true });
    }
  });
  window.addEventListener("beforeunload", () => {
    stopLibraryPolling();
    saveProgress();
  });

  function start() {
    document.documentElement.dataset.page = state.page;
    setupHomeRowNavigation();
    initHero();
    renderHome();
    loadLibrary(true);
    startLibraryPolling();
  }

  start();
})();
