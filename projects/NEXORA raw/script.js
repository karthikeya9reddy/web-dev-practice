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

  const QUOTES = [
    ["Stories worth staying for.", "Your personal collection, ready for its next story.", "photo-1470252649378-9c29740c9fa8", "warm"],
    ["Some stories never leave us.", "Return to the moments that made you feel everything.", "photo-1500530855697-b586d89ba3ee", "green"],
    ["Escape into another universe.", "Find a world that feels a little like your own.", "photo-1462331940025-496dfbfc7564", "violet"],
    ["Every frame holds a thousand emotions.", "A little wonder, a little nostalgia, a lot of imagination.", "photo-1478720568477-152d9b164e26", "blue"],
    ["Not all journeys need a destination.", "Let the story take you somewhere unexpected.", "photo-1500534623283-312aade485b7", "green"],
    ["The night is yours to explore.", "Settle in and let something unexpected find you.", "photo-1519608487953-e999c86e7455", "violet"],
    ["Somewhere, a new world is waiting.", "Leave the familiar behind for a little while.", "photo-1446776811953-b23d57bd21aa", "blue"],
    ["Keep the moments that matter.", "The story changes. The feeling stays.", "photo-1518837695005-2083093ee35b", "warm"]
  ];

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
    folders: [],
    page: "discover",
    genre: "All",
    subgenre: "All",
    query: "",
    sort: "recent",
    favourites: new Set(Array.isArray(storedFavourites) ? storedFavourites : []),
    progress: storedProgress && typeof storedProgress === "object" ? storedProgress : {},
    quoteIndex: 0,
    heroCycle: 0,
    heroFeaturedId: null,
    heroTimer: null,
    heroPreviewTimer: null,
    heroPreviewToken: 0,
    hoverPreviewTimer: null,
    activeHoverCard: null,
    typingTimer: null,
    typingToken: 0,
    progressTimer: null,
    heroBackIndex: 0,
    queue: [],
    queueIndex: 0,
    queueRegistry: new Map(),
    queueSerial: 0,
    currentFile: null,
    activeMedia: null,
    audio: null,
    shuffle: false,
    repeat: false,
    autoplay: true,
    libraryBusy: false,
    sharedHandled: false,
    saveTimer: null,
    controlsTimer: null,
    wasMinimized: false
  };

  const video = byId("media");
  const playerLayer = byId("player-layer");
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

  function thumbnailURL(file, width = 720) {
    return `/api/thumbnail?path=${encodeURIComponent(file.path)}&w=${width}&v=5`;
  }

  function previewURL(file, seconds = 8) {
    return `/api/preview?path=${encodeURIComponent(file.path)}&duration=${seconds}&v=3`;
  }

  function stopHeroPreview() {
    clearTimeout(state.heroPreviewTimer);
    state.heroPreviewToken += 1;

    const preview = byId("hero-preview");
    if (!preview) return;

    preview.pause();
    preview.classList.remove("is-playing");
    preview.removeAttribute("src");
    preview.load();
    byId("hero-preview-retry")?.remove();
  }

  function offerHeroPreviewRetry(preview, file) {
    if (state.page !== "discover" || state.heroFeaturedId !== file.id) return;
    const actions = byId("hero-ctas");
    if (!actions || byId("hero-preview-retry")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.id = "hero-preview-retry";
    button.className = "hero-action-preview";
    button.textContent = "Play preview";
    button.addEventListener("click", () => {
      // The clip is already loaded at this point, so this play() call occurs
      // directly inside the user's click gesture for browsers with stricter
      // autoplay policies.
      preview.muted = true;
      preview.defaultMuted = true;
      preview.play().then(() => {
        preview.classList.add("is-playing");
        button.remove();
      }).catch(error => {
        console.warn("[NEXORA] Manual preview playback failed:", error.name, error.message);
        notify("This browser cannot play the generated preview. Try Play now.");
      });
    }, { once: true });

    actions.appendChild(button);
  }

  function startHeroPreview(file) {
    stopHeroPreview();

    if (!file || file.type !== "video" || state.page !== "discover") {
      return;
    }

    const preview = byId("hero-preview");
    if (!preview) return;

    const token = state.heroPreviewToken;

    preview.muted = true;
    preview.defaultMuted = true;
    preview.setAttribute("muted", "");
    preview.autoplay = true;
    preview.loop = false;
    preview.playsInline = true;
    preview.preload = "auto";
    preview.poster = thumbnailURL(file, 960);

    const isCurrent = () =>
      token === state.heroPreviewToken &&
      state.page === "discover" &&
      state.heroFeaturedId === file.id;

    const reveal = () => {
      if (isCurrent()) {
        preview.classList.add("is-playing");
      }
    };

    const fail = () => {
      if (!isCurrent()) return;
      preview.classList.remove("is-playing");
      console.warn(
        "[NEXORA] Discover preview could not load/play. Check /api/diagnostics and the /api/preview request.",
        preview.error?.message || "Media decode or autoplay failure"
      );
      notify("Video preview unavailable. Check /api/diagnostics.");
    };

    let playRequested = false;
    const attemptPlay = () => {
      if (!isCurrent() || playRequested) return;
      playRequested = true;

      preview.play().then(reveal).catch(error => {
        if (!isCurrent()) return;
        preview.classList.remove("is-playing");
        console.warn("[NEXORA] Discover preview play() was rejected:", error.name, error.message);
        if (error.name === "NotAllowedError") {
          offerHeroPreviewRetry(preview, file);
        } else {
          notify("A preview could not be decoded. Check /api/diagnostics.");
        }
      });
    };

    preview.addEventListener("loadeddata", attemptPlay, { once: true });
    preview.addEventListener("error", fail, { once: true });
    preview.addEventListener("ended", () => {
      if (!isCurrent()) return;
      preview.pause();
      preview.classList.remove("is-playing");
      preview.removeAttribute("src");
      preview.load();
    }, { once: true });

    // Short pause lets the poster settle before the moving preview fades in.
    state.heroPreviewTimer = setTimeout(() => {
      if (!isCurrent()) return;
      preview.src = previewURL(file, 8);
      preview.load();

      // Some engines may already have enough data by the time load() returns.
      if (preview.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        attemptPlay();
      }
    }, 420);
  }

  function stopCardPreview(card = state.activeHoverCard, resumeHero = true) {
    if (!card) return;

    const wasActive = state.activeHoverCard === card;
    if (wasActive) clearTimeout(state.hoverPreviewTimer);

    const preview = card.querySelector(".card-preview");
    if (preview) {
      preview.pause();
      preview.classList.remove("is-playing");
      preview.removeAttribute("src");
      preview.load();
    }

    if (wasActive) state.activeHoverCard = null;

    // Only resume the hero when the user actually leaves the card. Opening
    // the full player must not restart a second preview behind it.
    if (
      wasActive &&
      resumeHero &&
      state.page === "discover" &&
      state.heroFeaturedId
    ) {
      const featured = state.files.find(file =>
        file.id === state.heroFeaturedId
      );

      if (featured) startHeroPreview(featured);
    }
  }

  function startCardPreview(card) {
    if (!card || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      return;
    }

    const file = state.files.find(item =>
      item.id === card.dataset.fileId
    );

    if (!file || file.type !== "video") return;

    if (state.activeHoverCard && state.activeHoverCard !== card) {
      stopCardPreview(state.activeHoverCard, false);
    }

    // A single preview decoder is shared by the hero and hover cards.
    stopHeroPreview();
    state.activeHoverCard = card;
    clearTimeout(state.hoverPreviewTimer);

    state.hoverPreviewTimer = setTimeout(() => {
      if (state.activeHoverCard !== card) return;

      const preview = card.querySelector(".card-preview");
      if (!preview) return;

      preview.muted = true;
      preview.defaultMuted = true;
      preview.setAttribute("muted", "");
      preview.loop = true;
      preview.playsInline = true;
      preview.preload = "auto";

      const fail = () => {
        if (state.activeHoverCard === card) {
          preview.classList.remove("is-playing");
          console.warn(
            `[NEXORA] Hover preview failed for ${titleOf(file)}. Check /api/preview and FFmpeg.`
          );
        }
      };

      const reveal = () => {
        if (state.activeHoverCard === card) {
          preview.classList.add("is-playing");
        }
      };

      let playRequested = false;
      const attemptPlay = () => {
        if (state.activeHoverCard !== card || playRequested) return;
        playRequested = true;

        preview.play().then(reveal).catch(error => {
          if (state.activeHoverCard !== card) return;
          preview.classList.remove("is-playing");
          console.warn("[NEXORA] Hover preview play() was rejected:", error.name, error.message);
        });
      };

      preview.addEventListener("loadeddata", attemptPlay, { once: true });
      preview.addEventListener("error", fail, { once: true });
      preview.src = previewURL(file, 6);
      preview.load();

      if (preview.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        attemptPlay();
      }
    }, 350);
  }

  // Pointer delegation is used so newly-rendered cards need no individual
  // listeners. Touch devices do not receive hover previews.
  document.addEventListener("pointerover", event => {
    if (event.pointerType === "touch") return;
    const card = event.target.closest?.("[data-file-id]");
    if (!card || card.contains(event.relatedTarget)) return;
    startCardPreview(card);
  });

  document.addEventListener("pointerout", event => {
    const card = event.target.closest?.("[data-file-id]");
    if (!card || card.contains(event.relatedTarget)) return;
    stopCardPreview(card, true);
  });

  function ambientMood(page, genre) {
    const value = `${page} ${genre}`.toLowerCase();
    if (/anime|music|sci.?fi/.test(value)) return "violet";
    if (/document|nature|forest/.test(value)) return "green";
    if (/romance|comedy|song/.test(value)) return "warm";
    if (/horror|thriller/.test(value)) return "red";
    if (/action|movie|series/.test(value)) return "blue";
    return "neutral";
  }

  function updateAmbient(page, genre, file = null) {
    document.documentElement.dataset.mood = ambientMood(page, genre);
    const next = state.heroBackIndex ? byId("ambient-a") : byId("ambient-b");
    const old = state.heroBackIndex ? byId("ambient-b") : byId("ambient-a");
    if (file && file.type === "video") {
      next.style.backgroundImage = `url("${thumbnailURL(file, 1200)}")`;
      next.classList.add("active");
      old.classList.remove("active");
      state.heroBackIndex = 1 - state.heroBackIndex;
    } else {
      next.style.backgroundImage = "none";
      next.classList.remove("active");
      old.classList.remove("active");
    }
  }

  /* ---------- Discover hero ---------- */

  function clearHeroTimers() {
    clearTimeout(state.heroTimer);
    clearTimeout(state.typingTimer);
    clearInterval(state.progressTimer);
  }

  function typeQuote(text) {
    clearTimeout(state.typingTimer);
    const heading = byId("hero-quote");
    const token = ++state.typingToken;
    let index = 0;
    heading.textContent = "";
    heading.classList.add("typing");
    const write = () => {
      if (token !== state.typingToken || state.page !== "discover" || document.hidden) return;
      if (index < text.length) {
        heading.textContent += text[index++];
        state.typingTimer = setTimeout(write, 34);
      } else {
        heading.classList.remove("typing");
      }
    };
    write();
  }

  function swapHeroBackground(url, mood = "neutral") {
    const next = state.heroBackIndex ? byId("bg-a") : byId("bg-b");
    const old = state.heroBackIndex ? byId("bg-b") : byId("bg-a");
    next.style.backgroundImage = url;
    next.classList.add("active");
    old.classList.remove("active");
    state.heroBackIndex = 1 - state.heroBackIndex;
    document.documentElement.dataset.mood = mood;
  }

  function setHeroActions(markup) {
    const actions = byId("hero-ctas");
    if (!actions) return;
    actions.innerHTML = markup;
  }

  function showQuote(index) {
    if (state.page !== "discover") return;
    stopHeroPreview();
    state.heroFeaturedId = null;
    state.quoteIndex = (index + QUOTES.length) % QUOTES.length;
    const quote = QUOTES[state.quoteIndex];

    [byId("ambient-a"), byId("ambient-b")].forEach(layer => {
      if (!layer) return;
      layer.classList.remove("active");
      layer.style.backgroundImage = "none";
    });

    swapHeroBackground(
      `url("https://images.unsplash.com/${quote[2]}?auto=format&fit=crop&w=2200&q=85")`,
      quote[3]
    );

    // Keep the hero clean: no kicker, carousel counter, or progress indicator.
    byId("hero-kicker").textContent = "";
    byId("hero-desc").textContent = quote[1];
    byId("hero-kind").textContent = "";
    byId("hero-foot-note").textContent = "";
    typeQuote(quote[0]);

    setHeroActions(`
      <button class="hero-action-primary" type="button" id="hero-explore">Explore collection <span>↗</span></button>
    `);
    byId("hero-explore").addEventListener("click", () => navigate("library"), { once: true });
  }

  function pageForCategory(category) {
    const found = Object.entries(CATEGORY).find(([page, value]) =>
      value.toLowerCase() === String(category || "").toLowerCase()
    );
    return found ? found[0] : "library";
  }

  function chooseFeaturedFile() {
    const candidates = state.files.filter(file => file.type === "video");
    if (!candidates.length) return null;
    let pool = candidates.filter(file => file.id !== state.heroFeaturedId);
    if (!pool.length) pool = candidates;
    const ordered = sortFiles(pool);
    // Mix recent additions with a little randomness so the hero feels alive.
    const windowSize = Math.min(12, ordered.length);
    const pick = ordered[Math.floor(Math.random() * windowSize)];
    return pick || ordered[0] || null;
  }

  function showFeatured(file) {
    if (!file || state.page !== "discover") return showQuote(state.quoteIndex);
    if (state.activeHoverCard) stopCardPreview(state.activeHoverCard, false);

    // Cancel any quote typewriter still running before replacing it with a title.
    clearTimeout(state.typingTimer);
    state.typingToken += 1;
    byId("hero-quote").classList.remove("typing");

    state.heroFeaturedId = file.id;
    const mood = ambientMood(categoryOf(file), genreOf(file));
    const poster = thumbnailURL(file, 960);

    swapHeroBackground(
      `linear-gradient(90deg,rgba(4,7,12,.94),rgba(4,7,12,.70) 43%,rgba(4,7,12,.18) 100%),linear-gradient(0deg,rgba(4,7,12,.72),transparent 62%),url("${poster}")`,
      mood
    );

    byId("hero-kicker").textContent = "";
    byId("hero-foot-note").textContent = "";
    byId("hero-kind").textContent = "";
    byId("hero-desc").textContent = `${categoryOf(file)}${genreOf(file) ? ` · ${genreOf(file).replace(/[-_]/g, " ")}` : ""}  —  A pick from your collection.`;
    byId("hero-quote").classList.remove("typing");
    byId("hero-quote").textContent = titleOf(file);

    const page = pageForCategory(categoryOf(file));
    const label = page === "library" ? "Explore collection" : `Explore ${categoryOf(file)}`;

    setHeroActions(`
      <button class="hero-action-primary" type="button" id="hero-play"><span class="hero-play-icon">▶</span> Play now</button>
      <button class="hero-action-secondary" type="button" id="hero-explore">${esc(label)} <span>↗</span></button>
    `);

    byId("hero-play").addEventListener("click", () => {
      const queue = state.files.filter(item =>
        item.type === "video" && categoryOf(item) === categoryOf(file)
      );
      openPlayer(file, queue.length ? queue : [file]);
    }, { once: true });

    byId("hero-explore").addEventListener("click", () => {
      navigate(page);
    }, { once: true });

    // The poster is the fallback; a cached 8-second clip crossfades over it.
    startHeroPreview(file);
  }

  function rotateHero() {
    clearTimeout(state.heroTimer);
    if (state.page !== "discover" || document.hidden) return;

    state.heroTimer = setTimeout(() => {
      const featured = chooseFeaturedFile();
      state.heroCycle += 1;
      // Mostly feature real titles; occasionally return to a quote moment.
      if (featured && state.heroCycle % 3 !== 0) {
        showFeatured(featured);
      } else {
        showQuote(state.quoteIndex + 1);
      }
      rotateHero();
    }, 10500);
  }

  function scheduleQuote() {
    rotateHero();
  }

  function initHero() {
    const first = QUOTES[0];
    byId("bg-a").style.backgroundImage =
      `url("https://images.unsplash.com/${first[2]}?auto=format&fit=crop&w=2200&q=85")`;
    showQuote(0);
    rotateHero();
  }

  function promoteFirstFeatured() {
    if (state.page !== "discover") return;
    const featured = chooseFeaturedFile();
    if (featured) {
      showFeatured(featured);
      state.heroCycle = 1;
      rotateHero();
    }
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
    if (state.genre !== "All") {
      if (state.page === "library" || state.page === "favourites") {
        output = output.filter(file => categoryOf(file) === state.genre);
      } else {
        output = output.filter(file => genreOf(file) === state.genre);
      }
    }
    if (state.subgenre !== "All") {
      output = output.filter(file => subgenreOf(file) === state.subgenre);
    }
    if (state.query.trim()) {
      const q = state.query.trim().toLowerCase();
      output = output.filter(file => [file.name, file.fileName, file.path, categoryOf(file), genreOf(file), subgenreOf(file), partsOf(file).join(" ")].join(" ").toLowerCase().includes(q));
    }
    return sortFiles(output);
  }

  /* ---------- Card rendering ---------- */

  function cardMarkup(file, compact = false) {
    const thumb = file.type === "video" ? thumbnailURL(file, compact ? 240 : 800) : "";
    const label = file.type === "audio" ? "MUSIC" : categoryOf(file).toUpperCase();
    const metadata = [categoryOf(file), genreOf(file)].filter(Boolean).join(" · ");
    const image = thumb ? `<img class="media-art-image" src="${esc(thumb)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : "";
    const preview = file.type === "video" ? `<video class="card-preview" muted playsinline preload="none" aria-hidden="true"></video>` : "";
    if (compact) {
      return `<button class="compact-card" type="button" data-file-id="${esc(file.id)}"><span class="compact-thumb">${image}${preview}</span><span class="compact-copy"><strong>${esc(titleOf(file))}</strong><small>${esc(metadata)}</small></span></button>`;
    }
    return `<article class="media-card" data-file-id="${esc(file.id)}" tabindex="0" role="button" aria-label="Play ${esc(titleOf(file))}"><div class="media-art">${image}${preview}<span class="media-art-label">${esc(label)}</span><button class="card-bookmark" data-action="bookmark" type="button" aria-label="Bookmark">${state.favourites.has(file.id) ? "♥" : "♡"}</button><span class="card-play">▶</span></div><strong class="media-card-title" title="${esc(titleOf(file))}">${esc(titleOf(file))}</strong></article>`;
  }

  function registerQueue(container, files) {
    const key = `q${++state.queueSerial}`;
    container.dataset.queueKey = key;
    state.queueRegistry.set(key, files.map(file => file.id));
    if (state.queueRegistry.size > 60) state.queueRegistry.delete(state.queueRegistry.keys().next().value);
    return key;
  }

  function renderCards(container, files, emptyText = "Nothing here yet.", compact = false) {
    if (!container) return;
    registerQueue(container, files);
    container.innerHTML = files.length ? files.map(file => cardMarkup(file, compact)).join("") : `<p class="empty-state">${esc(emptyText)}</p>`;
  }

  function queueFromElement(element) {
    const scope = element.closest("[data-queue-key]");
    if (!scope) return [...state.files];
    const ids = state.queueRegistry.get(scope.dataset.queueKey) || [];
    return ids.map(id => state.files.find(file => file.id === id)).filter(Boolean);
  }

  document.addEventListener("click", event => {
    const bookmark = event.target.closest('[data-action="bookmark"]');
    if (bookmark) {
      event.preventDefault();
      event.stopPropagation();
      const card = bookmark.closest("[data-file-id]");
      const file = card && state.files.find(item => item.id === card.dataset.fileId);
      if (file) toggleFavourite(file);
      return;
    }
    const card = event.target.closest("[data-file-id]");
    if (!card) return;
    const file = state.files.find(item => item.id === card.dataset.fileId);
    if (file) openPlayer(file, queueFromElement(card));
  });

  document.addEventListener("keydown", event => {
    const card = event.target.closest?.('.media-card[role="button"]');
    if (!card || event.target.closest("button")) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    const file = state.files.find(item => item.id === card.dataset.fileId);
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
    renderPicks();
  }

  function renderPicks() {
    const candidates = state.files.filter(file => file.type === "video");
    const shuffled = [...candidates];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    renderCards(byId("picks-row"), shuffled.slice(0, 12), "Add a few videos and your picks will appear here.");
  }

  byId("refresh-picks").addEventListener("click", renderPicks);

  function toggleFavourite(file) {
    if (state.favourites.has(file.id)) state.favourites.delete(file.id);
    else state.favourites.add(file.id);
    safeWrite("nexora-favourites", [...state.favourites]);
    renderHome();
    if (state.page !== "discover") renderCollection();
    toast(state.favourites.has(file.id) ? "Added to favourites" : "Removed from favourites");
  }

  /* ---------- Genre and subgenre ---------- */

  function getGenres(baseFiles) {
    const global = state.page === "library" || state.page === "favourites";
    const values = new Set();
    if (global) {
      baseFiles.forEach(file => values.add(categoryOf(file)));
    } else {
      const category = CATEGORY[state.page].toLowerCase();
      state.folders.forEach(folder => {
        const p = String(folder).replace(/\\/g, "/").split("/").filter(Boolean);
        if (p.length >= 2 && p[0].toLowerCase() === category) values.add(p[1]);
      });
      baseFiles.forEach(file => {
        const p = partsOf(file);
        if (p[1]) values.add(p[1]);
        else if (file.genre) values.add(String(file.genre));
      });
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }

  function getSubgenres(baseFiles) {
    if (state.genre === "All" || state.page === "library" || state.page === "favourites") return [];
    const category = CATEGORY[state.page].toLowerCase();
    const values = new Set();
    state.folders.forEach(folder => {
      const p = String(folder).replace(/\\/g, "/").split("/").filter(Boolean);
      if (p.length >= 3 && p[0].toLowerCase() === category && p[1] === state.genre) values.add(p[2]);
    });
    baseFiles.forEach(file => {
      const p = partsOf(file);
      if (p[1] === state.genre && p[2]) values.add(p[2]);
    });
    return [...values].sort((a, b) => a.localeCompare(b));
  }

  function renderChips(container, options, selected, onSelect) {
    const values = ["All", ...options];
    container.innerHTML = values.map(value => `<button type="button" class="filter-chip ${value === selected ? "active" : ""}" data-filter-value="${esc(value)}">${esc(value === "All" ? "All" : value.replace(/[-_]/g, " "))}</button>`).join("");
    $$('[data-filter-value]', container).forEach(button => button.addEventListener("click", () => onSelect(button.dataset.filterValue)));
  }

  function renderTaxonomy(baseFiles) {
    const global = state.page === "library" || state.page === "favourites";
    const genres = getGenres(baseFiles);
    if (state.genre !== "All" && !genres.includes(state.genre)) state.genre = "All";
    const label = $(".taxonomy-label", byId("taxonomy"));
    if (label) label.textContent = global ? "CATEGORY" : "GENRE";
    renderChips(byId("genre-filters"), genres, state.genre, value => {
      state.genre = value;
      state.subgenre = "All";
      renderCollection();
    });
    let scoped = baseFiles;
    if (state.genre !== "All") {
      scoped = global ? baseFiles.filter(file => categoryOf(file) === state.genre) : baseFiles.filter(file => genreOf(file) === state.genre);
    }
    const subgenres = getSubgenres(scoped);
    byId("subgenre-row").hidden = subgenres.length === 0;
    if (state.subgenre !== "All" && !subgenres.includes(state.subgenre)) state.subgenre = "All";
    if (subgenres.length) {
      renderChips(byId("subgenre-filters"), subgenres, state.subgenre, value => {
        state.subgenre = value;
        renderCollection();
      });
    } else {
      byId("subgenre-filters").innerHTML = "";
    }
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
    byId("section-search-label").textContent = `RESULTS IN ${CATEGORY[state.page].toUpperCase()}`;
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
    byId("collection-status").textContent = `${baseFiles.length} IN SECTION${state.genre !== "All" ? ` · ${state.genre.replace(/[-_]/g, " ")}` : ""}${state.subgenre !== "All" ? ` · ${state.subgenre.replace(/[-_]/g, " ")}` : ""}`;
    renderSectionSearch(baseFiles);
    if (!state.query.trim()) renderCards(byId("poster-grid"), visible, "No matching media was found.");
    byId("empty-library").hidden = baseFiles.length > 0 || state.query.trim().length > 0 || visible.length > 0;
    if (!baseFiles.length) {
      byId("empty-title").textContent = "Your collection is waiting";
      byId("empty-message").textContent = `No supported media was found in ${category}. Add files to the matching folder inside Entertainment.`;
    }
    updateAmbient(state.page, state.genre, visible[0] || baseFiles[0] || null);
  }

  /* ---------- Navigation ---------- */

  function navigate(page) {
    if (!Object.prototype.hasOwnProperty.call(CATEGORY, page) && page !== "discover") page = "discover";
    state.page = page;
    state.genre = "All";
    state.subgenre = "All";
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
    byId("main-nav").classList.remove("open");
    byId("menu-open").setAttribute("aria-expanded", "false");
    if (discover) {
      clearHeroTimers();
      const featured = chooseFeaturedFile();
      if (featured) showFeatured(featured);
      else showQuote(state.quoteIndex);
      scheduleQuote();
    } else {
      clearHeroTimers();
      stopHeroPreview();
      if (state.activeHoverCard) stopCardPreview(state.activeHoverCard);
      renderCollection();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-page]");
    if (!button) return;
    event.preventDefault();
    navigate(button.dataset.page);
  });

  byId("menu-open").addEventListener("click", () => {
    const open = byId("main-nav").classList.toggle("open");
    byId("menu-open").setAttribute("aria-expanded", String(open));
  });

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
    byId("overlay-search-scope").textContent = state.page === "discover" ? "ALL LIBRARY" : CATEGORY[state.page].toUpperCase();
    const container = byId("search-results");
    const key = registerQueue(container, matches);
    container.innerHTML = matches.map(file => {
      const src = file.type === "video" ? thumbnailURL(file, 240) : "";
      const preview = file.type === "video" ? `<video class="card-preview" muted playsinline preload="none" aria-hidden="true"></video>` : "";
      return `<button class="overlay-result" type="button" data-file-id="${esc(file.id)}" data-queue-key="${key}"><span class="overlay-result-thumb">${src ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.remove()">` : ""}${preview}</span><span class="overlay-result-copy"><strong>${esc(titleOf(file))}</strong><small>${esc(categoryOf(file))} · ${esc(genreOf(file))}</small></span></button>`;
    }).join("") || (query ? '<p class="empty-state">No matches in this section.</p>' : '<p class="empty-state">Start typing to search.</p>');
  }

  byId("search-open").addEventListener("click", openSearch);
  byId("search-close").addEventListener("click", closeSearch);
  byId("search-layer").addEventListener("click", event => {
    if (event.target === byId("search-layer")) closeSearch();
  });
  byId("search-input").addEventListener("input", event => renderOverlaySearch(event.target.value));

  /* ---------- Preview engine diagnostics ---------- */

  let diagnosticsChecked = false;

  async function checkPreviewDiagnostics() {
    if (diagnosticsChecked) return;
    diagnosticsChecked = true;

    try {
      const response = await fetch("/api/diagnostics", { cache: "no-store" });
      if (!response.ok) throw new Error(`Diagnostics returned ${response.status}`);
      const report = await response.json();

      if (!report.previewEngineReady) {
        console.error("[NEXORA] Preview engine is not ready:", report);
        notify("Video previews need FFmpeg/FFprobe or a writable preview cache. See /api/diagnostics.");
      } else {
        console.info("[NEXORA] Preview engine ready:", report);
      }
    } catch (error) {
      console.warn("[NEXORA] Preview diagnostics unavailable:", error.message);
    }
  }

  /* ---------- Library API ---------- */

  async function loadLibrary(initial = false) {
    if (state.libraryBusy) return;
    state.libraryBusy = true;
    try {
      const response = await fetch(`/api/library?_=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Library request returned ${response.status}`);
      const data = await response.json();
      if (!data || !Array.isArray(data.files)) throw new Error("The server response did not contain a files array.");
      state.files = data.files.filter(file => file && typeof file.id === "string" && typeof file.path === "string");
      state.folders = Array.isArray(data.folders) ? data.folders : [];
      byId("library-status").textContent = `${state.files.length} TITLES IN YOUR LIBRARY`;
      checkPreviewDiagnostics();
      renderHome();
      if (state.page !== "discover") renderCollection();
      else if (!state.heroFeaturedId && state.files.some(file => file.type === "video")) promoteFirstFeatured();
      if (initial && !state.sharedHandled) {
        state.sharedHandled = true;
        const sharedId = new URLSearchParams(location.search).get("play");
        if (sharedId) {
          const file = state.files.find(entry => entry.id === sharedId);
          if (file) openPlayer(file, state.files);
          else notify("That shared title is not in this library.");
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
    byId("play").innerHTML = playing ? "Ⅱ" : "<span>▶</span>";
    byId("mini-play").textContent = playing ? "Ⅱ" : "▶";
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
    target.innerHTML = state.queue.slice(0, 40).map((file, index) => {
      const thumb = file.type === "video" ? thumbnailURL(file, 180) : "";
      const current = file.id === state.currentFile?.id;
      return `<button type="button" class="queue-item ${current ? "current" : ""}" data-queue-index="${index}"><span class="queue-thumb">${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" onerror="this.remove()">` : ""}</span><span class="queue-copy"><strong>${esc(titleOf(file))}</strong><small>${current ? "NOW PLAYING" : esc(genreOf(file))}</small></span></button>`;
    }).join("") || '<p class="queue-empty">Open a title from your collection to build a play queue.</p>';
  }

  function openPlayer(file, queue = state.files) {
    if (!file?.path) return;
    stopHeroPreview();
    if (state.activeHoverCard) stopCardPreview(state.activeHoverCard, false);
    state.queue = queue.length ? [...queue] : [file];
    state.queueIndex = Math.max(0, state.queue.findIndex(item => item.id === file.id));
    state.shuffle = false;
    state.repeat = false;
    state.autoplay = true;
    byId("shuffle").setAttribute("aria-pressed", "false");
    byId("repeat").setAttribute("aria-pressed", "false");
    byId("autoplay").setAttribute("aria-pressed", "true");
    byId("autoplay").classList.add("active");
    byId("player-info-card").hidden = true;
    byId("player-error").hidden = true;
    byId("mini-player").hidden = true;
    playerLayer.hidden = false;
    playerLayer.classList.remove("is-minimized");
    document.body.style.overflow = "hidden";
    loadPlayerFile(file, true);
  }

  function loadPlayerFile(file, resume = false) {
    state.currentFile = file;
    const isAudio = file.type === "audio";
    const media = isAudio ? audio : video;
    state.activeMedia = media;
    video.pause();
    audio.pause();
    video.removeAttribute("src");
    audio.removeAttribute("src");
    video.load();
    audio.load();
    video.style.display = isAudio ? "none" : "block";
    byId("audio-visual").hidden = !isAudio;
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
    renderQueue();
    showPlayerControls();
    media.play().then(() => setPlaying(true)).catch(() => {
      byId("player-loader").hidden = true;
      setPlaying(false);
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
    playerLayer.classList.remove("is-minimized");
    byId("mini-player").hidden = true;
    document.body.style.overflow = "";
    state.currentFile = null;
    state.activeMedia = null;
    clearTimeout(state.controlsTimer);
  }

  function togglePlayback() {
    const media = mediaNow();
    if (!media) return;
    if (media.paused) {
      media.play().catch(() => notify("Playback could not start. Check this file's format."));
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
    if (!media) return;
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
    byId("mute").textContent = media.muted || media.volume === 0 ? "◖×" : "◖))";
  }));
  byId("speed").addEventListener("change", event => {
    const media = mediaNow();
    if (media) media.playbackRate = Number(event.target.value) || 1;
  });
  byId("shuffle").addEventListener("click", () => {
    state.shuffle = !state.shuffle;
    byId("shuffle").setAttribute("aria-pressed", String(state.shuffle));
    notify(state.shuffle ? "Shuffle on" : "Shuffle off");
  });
  byId("repeat").addEventListener("click", () => {
    state.repeat = !state.repeat;
    byId("repeat").setAttribute("aria-pressed", String(state.repeat));
    notify(state.repeat ? "Repeat current title on" : "Repeat off");
  });
  byId("autoplay").addEventListener("click", () => {
    state.autoplay = !state.autoplay;
    byId("autoplay").setAttribute("aria-pressed", String(state.autoplay));
    byId("autoplay").classList.toggle("active", state.autoplay);
    notify(state.autoplay ? "Autoplay next on" : "Autoplay next off");
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
      notify("Fullscreen is unavailable in this browser.");
    }
  });
  byId("pip").addEventListener("click", async () => {
    const media = mediaNow();
    try {
      if (!media || media === audio || !document.pictureInPictureEnabled || !media.requestPictureInPicture) {
        notify("Picture in picture is not available for this media or browser.");
        return;
      }
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await media.requestPictureInPicture();
    } catch {
      notify("Picture in picture could not start.");
    }
  });
  byId("player-info-toggle").addEventListener("click", () => {
    byId("player-info-card").hidden = !byId("player-info-card").hidden;
  });
  byId("player-minimize").addEventListener("click", () => {
    playerLayer.hidden = true;
    byId("mini-player").hidden = false;
  });
  byId("mini-expand").addEventListener("click", () => {
    playerLayer.hidden = false;
    byId("mini-player").hidden = true;
  });
  byId("mini-play").addEventListener("click", togglePlayback);
  byId("mini-close").addEventListener("click", closePlayer);
  byId("share-video").addEventListener("click", async () => {
    if (!state.currentFile) return;
    const url = new URL(location.href);
    url.searchParams.set("play", state.currentFile.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      notify("Playback link copied. It works for devices that can reach your server.");
    } catch {
      notify("Clipboard access is blocked by this browser.");
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
    if (event.key === "Escape") closePlayer();
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
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearTimeout(state.heroTimer);
      clearInterval(state.progressTimer);
      stopHeroPreview();
      saveProgress();
    } else if (state.page === "discover") {
      const featured = state.files.find(file => file.id === state.heroFeaturedId);
      if (featured) startHeroPreview(featured);
      scheduleQuote();
    }
  });
  window.addEventListener("beforeunload", saveProgress);

  function start() {
    initHero();
    renderHome();
    loadLibrary(true);
    window.setInterval(() => loadLibrary(false), 60000);
  }

  start();
})();
