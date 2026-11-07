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
    ambientObjectUrl: null,
    ambientCaptureToken: 0,
    ambientCaptureTimer: null,
    ambientPreviewTimer: null,
    heroFeaturedId: null,
    featuredSequenceLastId: null,
    heroTimer: null,
    heroPreviewWaiting: false,
    heroPreviewFailsafeTimer: null,
    heroErasePending: false,
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
    activeMedia: null,
    audio: null,
    subtitleTracks: [],
    subtitleNodes: [],
    selectedSubtitleId: "off",
    shuffle: false,
    repeat: false,
    autoplay: true,
    libraryBusy: false,
    sharedHandled: false,
    saveTimer: null,
    controlsTimer: null,
    wasMinimized: false,
    settingsOpen: false,
    libraryPollTimer: null,
    cardPointerRaf: 0,
    pendingCardPointer: null
  };

  const video = byId("media");
  const playerLayer = byId("player-layer");
  const playerWindow = byId("player-window");
  const previewVideo = byId("preview-player");
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
  const notify = toast;

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

  function applyAmbience(imageUrl, mood = "neutral", rgb = null) {
    if (!imageUrl) return;
    const cssImage = `url("${imageUrl}")`;
    const root = document.documentElement;
    root.dataset.mood = mood;
    if (Array.isArray(rgb) && rgb.length === 3) {
      root.style.setProperty("--ambient", rgb.map(value => Math.max(0, Math.min(255, Math.round(value)))).join(", "));
    }
    root.style.setProperty("--ambient-image", cssImage);

    const next = state.ambientBackIndex ? byId("ambient-a") : byId("ambient-b");
    const old = state.ambientBackIndex ? byId("ambient-b") : byId("ambient-a");
    if (next) {
      next.style.backgroundImage = cssImage;
      next.classList.add("active");
    }
    old?.classList.remove("active");
    state.ambientBackIndex = 1 - state.ambientBackIndex;

    const previousUrl = state.ambientObjectUrl;
    state.ambientObjectUrl = imageUrl.startsWith("blob:") ? imageUrl : null;
    if (previousUrl && previousUrl !== imageUrl) {
      // Allow both the ambient layers and body backdrop to finish crossfading.
      window.setTimeout(() => URL.revokeObjectURL(previousUrl), 1900);
    }
  }

  function moodFromRgb(rgb) {
    const [r, g, b] = rgb;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    if (delta < 22 || max < 50) return "neutral";
    let hue = 0;
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
    if (hue < 18 || hue >= 345) return "red";
    if (hue < 62) return "warm";
    if (hue < 165) return "green";
    if (hue < 255) return "blue";
    return "violet";
  }

  function capturePreviewAmbience(file, captureToken) {
    if (!file || captureToken !== state.ambientCaptureToken) return;
    if (!["hero", "ambience"].includes(state.activePreviewKind) || state.activePreviewFile?.id !== file.id) return;
    if (previewVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !previewVideo.videoWidth || !previewVideo.videoHeight) return;

    try {
      const width = 720;
      const height = Math.max(1, Math.round(width * previewVideo.videoHeight / previewVideo.videoWidth));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
      if (!context) return;
      context.drawImage(previewVideo, 0, 0, width, height);

      // Sample a tiny frame for its dominant colour without reading the full image.
      const sample = document.createElement("canvas");
      sample.width = 40;
      sample.height = 23;
      const sampleContext = sample.getContext("2d", { willReadFrequently: true });
      if (!sampleContext) return;
      sampleContext.drawImage(canvas, 0, 0, sample.width, sample.height);
      const pixels = sampleContext.getImageData(0, 0, sample.width, sample.height).data;
      let red = 0, green = 0, blue = 0, count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        const brightness = (r + g + b) / 3;
        if (brightness < 24) continue;
        red += r; green += g; blue += b; count++;
      }
      const rgb = count ? [red / count, green / count, blue / count] : [88, 114, 153];
      const mood = moodFromRgb(rgb);
      canvas.toBlob(blob => {
        if (!blob || captureToken !== state.ambientCaptureToken || state.activePreviewFile?.id !== file.id || !["hero", "ambience"].includes(state.activePreviewKind)) return;
        const imageUrl = URL.createObjectURL(blob);
        applyAmbience(imageUrl, mood, rgb);
      }, "image/jpeg", 0.78);
    } catch (error) {
      // Same-origin preview URLs should be canvas-readable. If a browser blocks
      // frame extraction, retain the last good global ambience without failing playback.
      console.info("[NEXORA] Preview ambience frame was unavailable:", error?.name || error);
    }
  }

  function schedulePreviewAmbience(file) {
    clearTimeout(state.ambientCaptureTimer);
    const token = ++state.ambientCaptureToken;
    let attempts = 0;
    const captureWhenReady = () => {
      if (token !== state.ambientCaptureToken || state.activePreviewFile?.id !== file.id || !["hero", "ambience"].includes(state.activePreviewKind)) return;
      const hasFrame = previewVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        previewVideo.videoWidth > 0 && previewVideo.videoHeight > 0 &&
        !previewVideo.paused && previewVideo.currentTime >= 0.45;
      if (hasFrame) {
        capturePreviewAmbience(file, token);
        return;
      }
      if (++attempts < 10) state.ambientCaptureTimer = window.setTimeout(captureWhenReady, 260);
    };
    state.ambientCaptureTimer = window.setTimeout(captureWhenReady, 900);
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
    clearTimeout(state.ambientCaptureTimer);
    state.ambientCaptureTimer = null;
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

  function startHeroPreview(file, options = {}) {
    const ambienceOnly = options.ambienceOnly === true;
    if ((!ambienceOnly && state.page !== "discover") ||
        (ambienceOnly && (state.page === "discover" || !playerLayer.hidden)) ||
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
      playerLayer.hidden &&
      !document.hidden;

    const clearPlaybackWatchdogs = () => {
      clearTimeout(state.previewPlaybackStartTimer);
      clearInterval(state.previewPlaybackWatchdog);
      state.previewPlaybackStartTimer = null;
      state.previewPlaybackWatchdog = null;
    };

    const skipPreview = reason => {
      if (!isCurrent() || endedHandled) return;
      endedHandled = true;
      clearPlaybackWatchdogs();
      console.warn(`[NEXORA] Skipping ${ambienceOnly ? "ambience" : "Discover"} preview for ${titleOf(file)}: ${reason}`);
      stopActivePreview();
      if (ambienceOnly) scheduleAmbientPreviewAdvance(950);
      else releaseHeroPreviewHold(file.id);
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
        releaseHeroPreviewHold(file.id);
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
      schedulePreviewAmbience(file);

      // The same bounded watchdog protects both visible hero playback and the
      // quiet background ambience cycle without creating another video decoder.
      state.previewPlaybackWatchdog = window.setInterval(() => {
        if (!isCurrent() || endedHandled) {
          clearPlaybackWatchdogs();
          return;
        }

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
    previewVideo.src = previewURL(file, 8, ambienceOnly ? 720 : 1080);
    previewVideo.load();
    requestPlaybackAndReveal();
  }

  function scheduleAmbientPreviewAdvance(delay = 700) {
    clearTimeout(state.ambientPreviewTimer);
    state.ambientPreviewTimer = window.setTimeout(() => {
      state.ambientPreviewTimer = null;
      startAmbientPreviewCycle();
    }, delay);
  }

  function startAmbientPreviewCycle(options = {}) {
    if (state.page === "discover" || document.hidden || !playerLayer.hidden) return;
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
    const file = state.fileById.get(card.dataset.fileId);
    if (!file || file.type !== "video") return;
    const target = card.querySelector(".media-art");
    if (!target || !target.isConnected) return;
    if (state.activeHoverCard === card && state.cardPreviewFile?.id === file.id && cardPreviewVideo.isConnected) return;

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
    ["--card-light-x", "--card-light-y", "--card-tilt-x", "--card-tilt-y"].forEach(name => card.style.removeProperty(name));
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
      pending.card.style.setProperty("--card-tilt-x", `${((50 - y) / 50 * 1.15).toFixed(2)}deg`);
      pending.card.style.setProperty("--card-tilt-y", `${((x - 50) / 50 * 1.35).toFixed(2)}deg`);
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
      state.typingTimer = setTimeout(erase, 2200);
    };

    const erase = () => {
      if (token !== state.typingToken || state.page !== "discover" || document.hidden) return;
      if (holdUntilPreviewEnds && state.heroPreviewWaiting) {
        // Keep the featured title visible for the entire preview duration.
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
      onComplete();
    };

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
    if (state.activeHoverCard?.isConnected) {
      state.heroTimer = setTimeout(advanceHero, 1200);
      return;
    }
    const featured = chooseFeaturedFile();
    if (featured) showFeatured(featured);
    else showEmptyHero();
  }

  function showEmptyHero() {
    clearHeroTimers();
    state.typingToken += 1;
    state.heroPreviewWaiting = false;
    state.heroErasePending = false;
    state.heroResumeAfterPreview = null;
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

    clearHeroTimers();
    state.heroPreviewWaiting = false;
    state.heroErasePending = false;
    state.heroResumeAfterPreview = null;
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
    typeHeroTitle(titleOf(file), advanceHero, true);
    startHeroPreview(file);

    clearTimeout(state.heroPreviewFailsafeTimer);
    state.heroPreviewFailsafeTimer = window.setTimeout(() => {
      if (state.page !== "discover" || state.heroFeaturedId !== file.id || !state.heroPreviewWaiting) return;
      console.warn(`[NEXORA] Releasing Discover sequence safety hold for ${titleOf(file)}.`);
      stopActivePreview();
      releaseHeroPreviewHold(file.id);
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
      output = output.filter(file => [file.name, file.fileName, file.path, categoryOf(file), genreOf(file), subgenreOf(file), partsOf(file).join(" ")].join(" ").toLowerCase().includes(q));
    }
    return sortFiles(output);
  }

  /* ---------- Card rendering ---------- */

  function cardMarkup(file, compact = false) {
    const thumb = file.type === "video" ? thumbnailURL(file, compact ? 240 : 640) : "";
    const label = file.type === "audio" ? "MUSIC" : categoryOf(file).toUpperCase();
    const metadata = [categoryOf(file), genreOf(file)].filter(Boolean).join(" · ");
    const image = thumb ? `<img class="media-art-image" src="${esc(thumb)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : "";
    if (compact) {
      return `<button class="compact-card" type="button" data-file-id="${esc(file.id)}"><span class="compact-thumb">${image}</span><span class="compact-copy"><strong>${esc(titleOf(file))}</strong><small>${esc(metadata)}</small></span></button>`;
    }
    const bookmarkIcon = state.favourites.has(file.id) ? "i-bookmark-filled" : "i-bookmark";
    return `<article class="media-card" data-file-id="${esc(file.id)}" tabindex="0" role="button" aria-label="Play ${esc(titleOf(file))}"><div class="media-art">${image}<span class="media-art-label">${esc(label)}</span><button class="card-bookmark" data-action="bookmark" type="button" aria-label="${state.favourites.has(file.id) ? "Remove from favourites" : "Add to favourites"}" aria-pressed="${state.favourites.has(file.id)}"><svg class="icon"><use href="#${bookmarkIcon}"/></svg></button></div><strong class="media-card-title" title="${esc(titleOf(file))}">${esc(titleOf(file))}</strong></article>`;
  }

  function registerQueue(container, files) {
    const key = `q${++state.queueSerial}`;
    container.dataset.queueKey = key;
    state.queueRegistry.set(key, files.map(file => file.id));
    if (state.queueRegistry.size > 60) state.queueRegistry.delete(state.queueRegistry.keys().next().value);
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
          row.scrollTo({ left: nextLeft, behavior: reducedMotion ? "auto" : "smooth" });
          requestAnimationFrame(() => updateRowNavigation(shell));
        }, { capture: true });
        shell.appendChild(button);
        return button;
      };

      createButton("prev", "Scroll to previous titles", "m15 18-6-6 6-6");
      createButton("next", "Scroll to next titles", "m9 18 6-6-6-6");
      row.addEventListener("scroll", () => updateRowNavigation(shell), { passive: true });
      updateRowNavigation(shell);
    });

    const refresh = () => $$(".media-row-shell").forEach(updateRowNavigation);
    window.addEventListener("resize", refresh, { passive: true });
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(refresh);
      $$(".media-row-shell .media-row").forEach(row => observer.observe(row));
    }
  }

  function renderCards(container, files, emptyText = "Nothing here yet.", compact = false) {
    if (!container) return;
    const signature = files.map(file => `${file.id}:${state.favourites.has(file.id) ? 1 : 0}`).join("|");
    registerQueue(container, files);
    if (container.dataset.renderSignature === signature && container.childElementCount) {
      requestAnimationFrame(() => updateRowNavigation(container.closest(".media-row-shell")));
      return;
    }
    if (state.activePreviewTarget && container.contains(state.activePreviewTarget)) stopActivePreview();
    if (state.activeHoverCard && container.contains(state.activeHoverCard)) stopCardPreview(state.activeHoverCard);
    container.innerHTML = files.length ? files.map(file => cardMarkup(file, compact)).join("") : `<p class="empty-state">${esc(emptyText)}</p>`;
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
    if (file) openPlayer(file, queueFromElement(card));
  });

  document.addEventListener("keydown", event => {
    const card = event.target.closest?.('.media-card[role="button"]');
    if (!card || event.target.closest("button")) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    const file = state.fileById.get(card.dataset.fileId);
    if (file) openPlayer(file, queueFromElement(card));
  });

  /* ---------- Home rows ---------- */

  function renderHome() {
    const recent = sortFiles(state.files).slice(0, 14);
    renderCards(byId("recent-row"), recent, "Your supported media files will appear here.");
    const favourites = state.files.filter(file => state.favourites.has(file.id)).slice(0, 14);
    renderCards(byId("favourite-row"), favourites, "Bookmark titles you want to keep close.");
    const watching = state.files.filter(file => Number(state.progress[file.id]?.time) > 10 && Number(state.progress[file.id]?.duration) > Number(state.progress[file.id]?.time) + 10);
    renderCards(byId("continue-row"), watching.slice(0, 14), "Nothing in progress yet.");
    byId("continue-section").hidden = watching.length === 0;
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

  function setNavigationOpen(open) {
    const nav = byId("main-nav");
    const toggle = byId("menu-open");
    nav.classList.toggle("open", Boolean(open));
    toggle.setAttribute("aria-expanded", String(Boolean(open)));
    toggle.classList.toggle("is-open", Boolean(open));
    document.body.classList.toggle("nav-open", Boolean(open));
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
    state.heroPreviewWaiting = false;
    state.heroErasePending = false;
    state.heroResumeAfterPreview = null;
    document.documentElement.dataset.page = page;
    stopCardPreview();
    state.genre = "All";
    state.subgenre = "All";
    state.folderPathFilters = [];
    state.query = "";
    byId("section-search").value = "";
    byId("clear-section-search").hidden = true;

    const discover = page === "discover";
    byId("hero").hidden = !discover;
    byId("continue-section").hidden = !discover || !state.files.some(file => Number(state.progress[file.id]?.time) > 10);
    byId("recent-section").hidden = !discover;
    byId("picks-section").hidden = !discover;
    byId("favourite-section").hidden = !discover;
    byId("collection").hidden = discover;
    $$(".nav-link").forEach(button => button.classList.toggle("active", button.dataset.page === page));
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
        if (resumeFile && state.fileById.has(resumeFile.id) && playerLayer.hidden && !document.hidden) {
          // Restart the same featured item off-screen; it remains the same
          // sequence entry and the shared cursor advances only when it ends.
          startHeroPreview(state.fileById.get(resumeFile.id), { ambienceOnly: true });
        } else {
          startAmbientPreviewCycle();
        }
      } else if (handoffKind !== "ambience" || !handoffFile || !playerLayer.hidden) {
        stopActivePreview();
        startAmbientPreviewCycle();
      }
      // Movies -> Anime -> Library and similar transitions do not interrupt
      // or restart the one global preview/ambience sequence.
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
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
  }, { passive: true });

  /* ---------- Section-local and overlay search ---------- */

  function onSectionSearch(value) {
    state.query = value;
    byId("clear-section-search").hidden = !value;
    if (state.page !== "discover") renderCollection();
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

  function openSearch() {
    byId("search-layer").hidden = false;
    byId("search-input").value = "";
    renderOverlaySearch("");
    byId("search-input").focus();
  }

  function closeSearch() {
    byId("search-layer").hidden = true;
  }

  function renderOverlaySearch(value) {
    const query = String(value || "").trim().toLowerCase();
    const scope = overlayScope();
    const matches = query ? scope.filter(file => [file.name, file.fileName, file.path, categoryOf(file), genreOf(file), subgenreOf(file)].join(" ").toLowerCase().includes(query)) : [];
    byId("overlay-search-scope").textContent = state.page === "discover" || state.page === "library" ? "ALL LIBRARY" : (CATEGORY[state.page] || "YOUR COLLECTION").toUpperCase();
    const container = byId("search-results");
    const key = registerQueue(container, matches);
    container.innerHTML = matches.map(file => {
      const src = file.type === "video" ? thumbnailURL(file, 240) : "";
      return `<button class="overlay-result" type="button" data-file-id="${esc(file.id)}" data-queue-key="${key}"><span class="overlay-result-thumb">${src ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.remove()">` : ""}</span><span class="overlay-result-copy"><strong>${esc(titleOf(file))}</strong><small>${esc(categoryOf(file))} · ${esc(genreOf(file))}</small></span></button>`;
    }).join("") || (query ? '<p class="empty-state">No matches in this section.</p>' : '<p class="empty-state">Start typing to search.</p>');
  }

  byId("search-open").addEventListener("click", openSearch);
  byId("search-close").addEventListener("click", closeSearch);
  byId("search-layer").addEventListener("click", event => {
    if (event.target === byId("search-layer")) closeSearch();
  });
  byId("search-input").addEventListener("input", event => renderOverlaySearch(event.target.value));

  /* ---------- Library API ---------- */

  async function loadLibrary(initial = false) {
    if (state.libraryBusy) return;
    state.libraryBusy = true;
    try {
      const response = await fetch("/api/library", { cache: "no-store" });
      if (!response.ok) throw new Error(`Library request returned ${response.status}`);
      const data = await response.json();
      if (!data || !Array.isArray(data.files)) throw new Error("The server response did not contain a files array.");
      state.files = data.files.filter(file => file && typeof file.id === "string" && typeof file.path === "string");
      state.fileById = new Map(state.files.map(file => [file.id, file]));
      state.folders = Array.isArray(data.folders) ? data.folders : [];
      byId("library-status").textContent = `${state.files.length} TITLES IN YOUR LIBRARY`;
      renderHome();
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
      byId("library-status").textContent = "LIBRARY CONNECTION ERROR";
      byId("recent-row").innerHTML = `<p class="empty-state">Could not load your library. ${esc(error.message)}</p>`;
      if (state.page !== "discover") {
        byId("collection-status").textContent = "Could not connect to the media library.";
        byId("empty-library").hidden = false;
        byId("empty-title").textContent = "Server connection problem";
        byId("empty-message").textContent = "Check the NEXORA server terminal and the /api/library route.";
      }
    } finally {
      state.libraryBusy = false;
    }
  }

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
    byId("audio-visual").classList.toggle("is-playing", playing && state.currentFile?.type === "audio");
    showPlayerControls();
  }

  function updatePlayerDetails(file) {
    byId("player-title").textContent = titleOf(file);
    byId("mini-title").textContent = titleOf(file);
    byId("mini-subtitle").textContent = `${categoryOf(file)} · ${genreOf(file)}`;
    byId("info-name").textContent = titleOf(file);
    byId("info-path").textContent = file.path || "";
    byId("info-format").textContent = `${String(file.extension || "").toUpperCase()} · ${formatSize(file.size)}`;
    byId("download-link").href = `/api/download?path=${encodeURIComponent(file.path)}`;
    byId("player-file-label").textContent = `${categoryOf(file).toUpperCase()} · ${String(file.extension || "").toUpperCase()}`;
    const thumb = file.type === "video" ? thumbnailURL(file, 240) : "";
    byId("mini-art").style.backgroundImage = thumb ? `url("${thumb}")` : "none";
    byId("mini-art").textContent = thumb ? "" : "♫";
  }

  function renderQueue() {
    const target = byId("up-next-list");
    byId("queue-count").textContent = `${state.queue.length} ITEMS`;
    target.innerHTML = state.queue.map((file, index) => {
      const thumb = file.type === "video" ? thumbnailURL(file, 180) : "";
      const current = file.id === state.currentFile?.id;
      return `<button type="button" class="queue-item ${current ? "current" : ""}" data-queue-index="${index}"><span class="queue-thumb">${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" onerror="this.remove()">` : ""}</span><span class="queue-copy"><strong>${esc(titleOf(file))}</strong><small>${current ? "NOW PLAYING" : esc(genreOf(file))}</small></span></button>`;
    }).join("") || '<p class="queue-empty">Open a title from your collection to build a play queue.</p>';
  }

  function openPlayer(file, queue = state.files) {
    if (!file?.path) return;
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
    const isAudio = file.type === "audio";
    const media = isAudio ? audio : video;
    state.activeMedia = media;
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
    const metadata = () => {
      byId("player-loader").hidden = true;
      if (resumeAt > 8 && Number.isFinite(media.duration) && resumeAt < media.duration - 12) media.currentTime = resumeAt;
      byId("time-total").textContent = formatTime(media.duration);
      media.removeEventListener("loadedmetadata", metadata);
    };
    media.addEventListener("loadedmetadata", metadata);
    media.src = `/api/stream?path=${encodeURIComponent(file.path)}`;
    media.load();
    if (!isAudio) discoverSubtitles(file);
    renderQueue();
    showPlayerControls();
    media.play().then(() => setPlaying(true)).catch(error => {
      byId("player-loader").hidden = true;
      setPlaying(false);
      if (error?.name !== "NotAllowedError") toast("Playback could not start. Check the file format and server connection.");
    });
  }

  function saveProgress() {
    const media = mediaNow();
    if (!media || !state.currentFile || !Number.isFinite(media.currentTime) || media.currentTime <= 0) return;
    state.progress[state.currentFile.id] = {
      time: media.currentTime,
      duration: Number.isFinite(media.duration) ? media.duration : 0
    };
    safeWrite("nexora-progress", state.progress);
  }

  function closePlayer() {
    const media = mediaNow();
    if (media) {
      saveProgress();
      media.pause();
    }
    playerLayer.hidden = true;
    playerWindow.classList.remove("is-minimized", "queue-open", "queue-collapsed");
    byId("queue-toggle").setAttribute("aria-expanded", "false");
    state.wasMinimized = false;
    closeSettings();
    clearSubtitleElements();
    byId("mini-player").hidden = true;
    document.body.style.overflow = "";
    state.currentFile = null;
    state.activeMedia = null;
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
      if (media === mediaNow()) byId("player-loader").hidden = false;
    });
    media.addEventListener("canplay", () => {
      if (media === mediaNow()) byId("player-loader").hidden = true;
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
      clearTimeout(state.saveTimer);
      state.saveTimer = setTimeout(saveProgress, 1200);
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
      if (media !== mediaNow() || !state.currentFile || playerLayer.hidden) return;
      byId("player-loader").hidden = true;
      byId("player-error").hidden = false;
      byId("player-error").textContent = "This browser could not decode this file. MP4 (H.264/AAC) and WebM are widely supported; MKV and some audio codecs may require conversion.";
    });
  }

  bindMedia(video);
  bindMedia(audio);

  /* Player control wiring */
  byId("player-back").addEventListener("click", closePlayer);
  byId("center-play").addEventListener("click", togglePlayback);
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
    try {
      if (!document.fullscreenElement) await byId("stage").requestFullscreen?.();
      else await document.exitFullscreen?.();
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
    const mobile = window.matchMedia("(max-width: 780px)").matches;
    const className = mobile ? "queue-open" : "queue-collapsed";
    playerWindow.classList.toggle(className);
    const expanded = playerWindow.classList.contains(className);
    byId("queue-toggle").setAttribute("aria-expanded", String(expanded));
    showPlayerControls();
  });
  byId("player-minimize").addEventListener("click", () => {
    saveProgress();
    closeSettings();
    playerLayer.hidden = true;
    byId("mini-player").hidden = false;
    document.body.style.overflow = "";
    state.wasMinimized = true;
  });
  byId("mini-expand").addEventListener("click", () => {
    playerLayer.hidden = false;
    byId("mini-player").hidden = true;
    document.body.style.overflow = "hidden";
    state.wasMinimized = false;
    showPlayerControls();
  });
  byId("mini-play").addEventListener("click", togglePlayback);
  byId("mini-close").addEventListener("click", closePlayer);
  byId("share-video").addEventListener("click", async () => {
    if (!state.currentFile) return;
    const url = new URL(location.href);
    url.searchParams.set("play", state.currentFile.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      toast("Playback link copied. It works for devices that can reach your server.");
    } catch {
      toast("Clipboard access is blocked by this browser.");
    }
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
  document.addEventListener("fullscreenchange", () => {
    if (!playerLayer.hidden && document.fullscreenElement === playerStage) {
      showPlayerControls();
    }
  });

  /* ---------- Keyboard shortcuts ---------- */
  document.addEventListener("keydown", event => {
    if (playerLayer.hidden) {
      if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
        event.preventDefault();
        openSearch();
      }
      if (event.key === "Escape" && !byId("search-layer").hidden) byId("search-layer").hidden = true;
      return;
    }
    if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    const media = mediaNow();
    if (event.key === "Escape") {
      if (state.settingsOpen) closeSettings();
      else closePlayer();
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
      if (!document.hidden && !state.libraryBusy) void loadLibrary(false);
    }, 30000);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopLibraryPolling();
      clearHeroTimers();
      state.typingToken += 1;
      state.heroPreviewWaiting = false;
      state.heroErasePending = false;
      state.heroResumeAfterPreview = null;
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
