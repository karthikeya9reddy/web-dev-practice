const SONGS_INDEX = "http://127.0.0.1:3000/songs/";
const currentSong = new Audio();
currentSong.preload = "metadata";
currentSong.crossOrigin = "anonymous";

let allSongs = [];
let currentIndex = 0;
let isSeeking = false;

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

const play = $("#play");
const previous = $("#previous");
const next = $("#next");
const searchInput = $("#searchInput");
const songList = $(".songlist ul");
const seekbar = $(".seekbar");
const circle = $(".circle");
const songInfo = $(".songinfo");
const songTime = $(".songtime");
const playbar = $(".playbar");
const libraryCount = $("#libraryCount");
const playerStatus = $("#playerStatus");

const FOLDER_STORAGE_KEY = "spootitifyFoldersV1";
const DELETED_FOLDER_STORAGE_KEY = "spootitifyDeletedFoldersV1";
const DELETED_FOLDER_STORAGE_KEY_V2 = "spootitifyDeletedFoldersV2";
const DELETED_FOLDER_STORAGE_KEY_V3 = "spootitifyDeletedFoldersV3";
const DELETED_FOLDER_PREFIX = "spootitifyDeletedFolder:";
const CUSTOM_FOLDER_STORAGE_KEY = "spootitifyCustomFoldersV2";
const INVALID_FOLDER_IDS = ["undefined", "null", ""];
let folders = loadFolders();
let deletedFolderIds = loadDeletedFolders();
let customFolders = loadCustomFolders();
let activeFolderId = null;
let folderQueue = [];
let folderQueueIndex = -1;
let folderModal = null;

function loadFolders() {
    try {
        const saved = JSON.parse(
            localStorage.getItem(FOLDER_STORAGE_KEY) || "{}"
        );

        return saved && typeof saved === "object"
            ? saved
            : {};
    } catch {
        return {};
    }
}

function loadDeletedFolders() {
    const values = new Set();

    [
        DELETED_FOLDER_STORAGE_KEY,
        DELETED_FOLDER_STORAGE_KEY_V2,
        DELETED_FOLDER_STORAGE_KEY_V3
    ].forEach(key => {
        try {
            const saved = JSON.parse(
                localStorage.getItem(key) || "[]"
            );

            if (Array.isArray(saved)) {
                saved.filter(Boolean).forEach(id => values.add(String(id)));
            }
        } catch {
        }
    });

    try {
        for (let index = 0; index < localStorage.length; index++) {
            const key = localStorage.key(index);

            if (key && key.startsWith(DELETED_FOLDER_PREFIX)) {
                values.add(key.slice(DELETED_FOLDER_PREFIX.length));
            }
        }
    } catch {
    }

    return [...values];
}

function saveDeletedFolders() {
    const unique = [...new Set(deletedFolderIds.filter(Boolean).map(String))];
    deletedFolderIds = unique;
    const payload = JSON.stringify(unique);

    localStorage.setItem(DELETED_FOLDER_STORAGE_KEY_V3, payload);
    localStorage.setItem(DELETED_FOLDER_STORAGE_KEY_V2, payload);
    localStorage.setItem(DELETED_FOLDER_STORAGE_KEY, payload);

    unique.forEach(id => {
        localStorage.setItem(
            `${DELETED_FOLDER_PREFIX}${id}`,
            "1"
        );
    });
}

function markFolderDeleted(folderId) {
    const id = String(folderId);

    if (!deletedFolderIds.includes(id)) {
        deletedFolderIds.push(id);
    }

    localStorage.setItem(
        `${DELETED_FOLDER_PREFIX}${id}`,
        "1"
    );

    saveDeletedFolders();
}

function unmarkFolderDeleted(folderId) {
    const id = String(folderId);

    deletedFolderIds =
        deletedFolderIds.filter(deletedId => deletedId !== id);

    try {
        localStorage.removeItem(
            `${DELETED_FOLDER_PREFIX}${id}`
        );
    } catch {
    }

    try {
        saveDeletedFolders();
    } catch {
    }
}

function loadCustomFolders() {
    try {
        const saved = JSON.parse(
            localStorage.getItem(CUSTOM_FOLDER_STORAGE_KEY) || "{}"
        );

        return saved && typeof saved === "object"
            ? saved
            : {};
    } catch {
        return {};
    }
}

function saveCustomFolders() {
    localStorage.setItem(
        CUSTOM_FOLDER_STORAGE_KEY,
        JSON.stringify(customFolders)
    );
}

function isFolderDeleted(folderId) {
    return (
        deletedFolderIds.includes(String(folderId)) ||
        folders[folderId]?.deleted === true
    );
}

function saveFolders() {
    localStorage.setItem(
        FOLDER_STORAGE_KEY,
        JSON.stringify(folders)
    );
}

function cleanupInvalidFolderIds() {
    let changedFolders = false;
    let changedCustomFolders = false;
    let changedDeleted = false;

    INVALID_FOLDER_IDS.forEach(badId => {
        if (Object.prototype.hasOwnProperty.call(folders, badId)) {
            delete folders[badId];
            changedFolders = true;
        }

        if (Object.prototype.hasOwnProperty.call(customFolders, badId)) {
            delete customFolders[badId];
            changedCustomFolders = true;
        }

        if (deletedFolderIds.includes(badId)) {
            deletedFolderIds =
                deletedFolderIds.filter(id => id !== badId);

            changedDeleted = true;
        }

        try {
            localStorage.removeItem(
                `${DELETED_FOLDER_PREFIX}${badId}`
            );
        } catch {
        }
    });

    if (changedFolders) {
        saveFolders();
    }

    if (changedCustomFolders) {
        saveCustomFolders();
    }

    if (changedDeleted) {
        saveDeletedFolders();
    }
}

function migrateFolderPersistence() {
    let changedFolders = false;
    let changedCustomFolders = false;
    let changedDeleted = false;

    cleanupInvalidFolderIds();

    Object.entries(folders).forEach(([id, folder]) => {
        if (folder?.deleted === true) {
            if (!deletedFolderIds.includes(id)) {
                deletedFolderIds.push(id);
                changedDeleted = true;
            }
        }
    });

    for (const id of [...deletedFolderIds]) {
        if (Object.prototype.hasOwnProperty.call(folders, id)) {
            delete folders[id];
            changedFolders = true;
        }

        if (Object.prototype.hasOwnProperty.call(customFolders, id)) {
            delete customFolders[id];
            changedCustomFolders = true;
        }
    }

    Object.entries(customFolders).forEach(([id, folder]) => {
        if (!folder || typeof folder !== "object") {
            delete customFolders[id];
            changedCustomFolders = true;
            return;
        }

        if (isFolderDeleted(id)) {
            delete customFolders[id];
            changedCustomFolders = true;
            return;
        }

        if (!folders[id]) {
            folders[id] = {
                songs: [],
                custom: true
            };
            changedFolders = true;
        }

        if (!Array.isArray(folders[id].songs)) {
            folders[id].songs = [];
            changedFolders = true;
        }
    });

    Object.entries(folders).forEach(([id, folder]) => {
        if (folder?.custom === true && !isFolderDeleted(id)) {
            if (!customFolders[id]) {
                customFolders[id] = {
                    custom: true,
                    title: folder.title || "My Folder",
                    description: folder.description || "Your saved songs.",
                    image: folder.image || DEFAULT_FOLDER_ART,
                    createdAt: Number(folder.createdAt || 0)
                };
                changedCustomFolders = true;
            }
        }
    });

    if (changedFolders) {
        saveFolders();
    }

    if (changedCustomFolders) {
        saveCustomFolders();
    }

    if (changedDeleted) {
        saveDeletedFolders();
    }
}

function secondsToMinutesSeconds(seconds) {
    if (isNaN(seconds) || seconds < 0) return "...";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

async function getsongs() {
    const response = await fetch(SONGS_INDEX, { cache: "no-store" });
    if (!response.ok) throw new Error(`Song server returned ${response.status}`);

    const div = document.createElement("div");
    div.innerHTML = await response.text();

    return [...div.querySelectorAll("a")]
        .map(link => link.textContent.trim())
        .filter(name => name.toLowerCase().endsWith(".mp3"))
        .map(name => SONGS_INDEX + encodeURIComponent(name));
}

function getSongName(songURL) {
    let filename = "";

    try {
        filename = decodeURIComponent(songURL.split("/songs/")[1] || "");
    } catch {
        filename = songURL.split("/songs/")[1] || "";
    }

    return filename
        .replace(/\.mp3$/i, "")
        .replace(/\(.*?\.mp3\)/gi, "")
        .replace(/senSongsmp3\.co/gi, "")
        .replace(/_+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeText(text) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function fuzzyScore(songName, searchText) {
    const name = normalizeText(songName);
    const query = normalizeText(searchText);

    if (!query || !name) return query ? 0 : 1;
    if (name === query) return 10000;
    if (name.startsWith(query)) return 9000 - name.length;

    for (const word of name.split(" ")) {
        if (word.startsWith(query)) return 8000 - word.length;
    }

    if (name.includes(query)) return 7000 - name.indexOf(query);

    const queryWords = query.split(" ");
    const matchedWords = queryWords.filter(
        word => word && name.includes(word)
    ).length;

    if (matchedWords === queryWords.length) {
        return 6000 - name.length;
    }

    let queryIndex = 0;

    for (
        let i = 0;
        i < name.length && queryIndex < query.length;
        i++
    ) {
        if (name[i] === query[queryIndex]) {
            queryIndex++;
        }
    }

    return queryIndex === query.length
        ? 5000 - (name.length - query.length)
        : 0;
}

function updateProgress(percent) {
    const safePercent = Math.max(0, Math.min(100, percent));

    circle.style.left = `${safePercent}%`;
    seekbar.style.setProperty("--progress", `${safePercent}%`);
    seekbar.setAttribute(
        "aria-valuenow",
        String(Math.round(safePercent))
    );
}

function updateSongTime() {
    songTime.textContent =
        `${secondsToMinutesSeconds(currentSong.currentTime)} / ${secondsToMinutesSeconds(currentSong.duration)}`;
}

function setPlayerStatus(text) {
    if (playerStatus) {
        playerStatus.textContent = text;
    }
}

function animateSongTitle(name) {
    songInfo.textContent = name;
    songInfo.title = name;
    songInfo.classList.remove("song-change");
    void songInfo.offsetWidth;
    songInfo.classList.add("song-change");
}

function updateEqualizer() {
    const equalizer = $(".active-song .song-equalizer");

    if (equalizer) {
        equalizer.classList.toggle(
            "paused",
            currentSong.paused
        );
    }
}

function updatePlayerVisuals() {
    const playing = !currentSong.paused;

    play.src = playing
        ? "svg files/pause.svg"
        : "svg files/play.svg";

    play.alt = playing
        ? "Pause"
        : "Play";

    playbar.classList.toggle(
        "is-playing",
        playing
    );

    setPlayerStatus(
        playing
            ? `Playing • ${getSongName(currentSong.src)}`
            : currentSong.src
                ? `Paused • ${getSongName(currentSong.src)}`
                : "Ready to play"
    );

    updateEqualizer();
}

function highlightSong(songURL) {
    const items = $$(
        ".songlist li[data-song]"
    );

    let activeItem = null;

    items.forEach(item => {
        item.classList.remove("active-song");

        item
            .querySelector(".song-equalizer")
            ?.remove();

        if (item.dataset.song === songURL) {
            activeItem = item;
        }
    });

    if (!activeItem) return;

    activeItem.classList.add("active-song");

    const equalizer = document.createElement("div");

    equalizer.className =
        "song-equalizer";

    equalizer.innerHTML =
        "<span></span><span></span><span></span>";

    activeItem.appendChild(equalizer);

    if (activeItem.style.display !== "none") {
        activeItem.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });
    }

    updateEqualizer();
}

function playMusic(
    songURL,
    songName,
    shouldPlay = true,
    source = "library"
) {
    currentSong.pause();

    if (source === "library") {
        activeFolderId = null;
        folderQueue = [];
        folderQueueIndex = -1;
    }

    currentSong.src = songURL;
    currentSong.currentTime = 0;

    animateSongTitle(songName);

    songTime.textContent =
        "00:00 / 00:00";

    updateProgress(0);

    localStorage.setItem(
        "lastPlayedSong",
        songURL
    );

    currentIndex =
        Math.max(
            0,
            allSongs.indexOf(songURL)
        );

    if (
        source === "folder" &&
        folderQueue.length
    ) {
        folderQueueIndex =
            Math.max(
                0,
                folderQueue.indexOf(songURL)
            );
    }

    document.title =
        `${songName} • Spootitify`;

    highlightSong(songURL);

    if (shouldPlay) {
        const promise =
            currentSong.play();

        promise?.catch(() =>
            updatePlayerVisuals()
        );
    } else {
        updatePlayerVisuals();
    }
}

function createSongItem(song, index) {
    const name = getSongName(song);

    const li =
        document.createElement("li");

    const icon =
        document.createElement("img");

    const info =
        document.createElement("div");

    const title =
        document.createElement("div");

    const artist =
        document.createElement("div");

    const playNow =
        document.createElement("div");

    const label =
        document.createElement("span");

    const playIcon =
        document.createElement("img");

    li.dataset.song = song;
    li.dataset.name = name;
    li.dataset.index = index;

    li.tabIndex = 0;

    li.setAttribute(
        "role",
        "button"
    );

    li.setAttribute(
        "aria-label",
        `Play ${name}`
    );

    li.style.setProperty(
        "--row-index",
        Math.min(index, 10)
    );

    li.classList.add(
        "song-appear"
    );

    icon.className = "invert";
    icon.src = "svg files/music.svg";
    icon.alt = "";
    icon.draggable = false;

    title.textContent = name;
    artist.textContent = "karthikeya";

    info.className = "info";
    info.append(
        title,
        artist
    );

    label.textContent = "Play Now";

    playIcon.width = 35;
    playIcon.src =
        "svg files/playnow.svg";
    playIcon.alt = "";
    playIcon.draggable = false;

    playNow.className =
        "playnow";

    playNow.append(
        label,
        playIcon
    );

    li.append(
        icon,
        info,
        playNow
    );

    return li;
}

function renderSongs(songs) {
    songList.innerHTML = "";

    const fragment =
        document.createDocumentFragment();

    songs.forEach(
        (song, index) =>
            fragment.appendChild(
                createSongItem(
                    song,
                    index
                )
            )
    );

    songList.appendChild(
        fragment
    );

    if (libraryCount) {
        libraryCount.textContent =
            `${songs.length} ${
                songs.length === 1
                    ? "track"
                    : "tracks"
            }`;
    }
}

function showNoResults(
    message = "No songs found",
    detail = "Try another search."
) {
    const item =
        document.createElement("li");

    item.className =
        "no-results";

    item.innerHTML =
        `<div class="info">
            <div>${message}</div>
            <div>${detail}</div>
        </div>`;

    songList.appendChild(
        item
    );
}

function searchSongs(value) {
    const query =
        normalizeText(value);

    const items =
        $$(
            "li[data-song]",
            songList
        );

    songList
        .querySelector(".no-results")
        ?.remove();

    items.forEach(item => {
        item.classList.remove(
            "search-hit"
        );

        item.style.display =
            query
                ? "none"
                : "";
    });

    if (!query) {
        items.sort(
            (a, b) =>
                Number(a.dataset.index) -
                Number(b.dataset.index)
        );

        items.forEach(item =>
            songList.appendChild(item)
        );

        highlightSong(
            currentSong.src
        );

        return;
    }

    const matches =
        items
            .map(item => ({
                item,
                score:
                    fuzzyScore(
                        item.dataset.name ||
                            "",
                        query
                    )
            }))
            .filter(
                match =>
                    match.score > 0
            )
            .sort(
                (a, b) =>
                    b.score -
                    a.score
            );

    matches.forEach(
        ({ item }, index) => {
            item.style.display =
                "";

            songList.appendChild(
                item
            );

            if (index < 10) {
                item.classList.add(
                    "search-hit"
                );
            }
        }
    );

    if (!matches.length) {
        showNoResults();
    }
}

function getFirstVisibleSong() {
    return $(
        "li[data-song]:not([style*='display: none'])",
        songList
    );
}

function togglePlay() {
    if (!currentSong.src) {
        if (allSongs.length) {
            playMusic(
                allSongs[0],
                getSongName(allSongs[0])
            );
        }

        return;
    }

    if (currentSong.paused) {
        currentSong
            .play()
            .catch(() => {});
    } else {
        currentSong.pause();
    }
}

function nextSong() {
    const queue =
        folderQueue.length
            ? folderQueue
            : allSongs;

    if (!queue.length) {
        return;
    }

    if (folderQueue.length) {
        folderQueueIndex =
            (folderQueueIndex + 1) %
            folderQueue.length;

        const songURL =
            folderQueue[folderQueueIndex];

        playMusic(
            songURL,
            getSongName(songURL),
            true,
            "folder"
        );

        return;
    }

    currentIndex =
        (currentIndex + 1) %
        allSongs.length;

    playMusic(
        allSongs[currentIndex],
        getSongName(
            allSongs[currentIndex]
        ),
        true,
        "library"
    );
}

function previousSong() {
    const queue =
        folderQueue.length
            ? folderQueue
            : allSongs;

    if (!queue.length) {
        return;
    }

    if (folderQueue.length) {
        folderQueueIndex =
            (
                folderQueueIndex -
                1 +
                folderQueue.length
            ) %
            folderQueue.length;

        const songURL =
            folderQueue[folderQueueIndex];

        playMusic(
            songURL,
            getSongName(songURL),
            true,
            "folder"
        );

        return;
    }

    currentIndex =
        (
            currentIndex -
            1 +
            allSongs.length
        ) %
        allSongs.length;

    playMusic(
        allSongs[currentIndex],
        getSongName(
            allSongs[currentIndex]
        ),
        true,
        "library"
    );
}

function setupSongControls() {
    songList.addEventListener(
        "click",
        event => {
            const item =
                event.target.closest(
                    "li[data-song]"
                );

            if (!item) {
                return;
            }

            currentIndex =
                allSongs.indexOf(
                    item.dataset.song
                );

            playMusic(
                item.dataset.song,
                item.dataset.name,
                true,
                "library"
            );
        }
    );

    songList.addEventListener(
        "keydown",
        event => {
            const item =
                event.target.closest(
                    "li[data-song]"
                );

            if (
                !item ||
                !["Enter", " "]
                    .includes(event.key)
            ) {
                return;
            }

            event.preventDefault();

            currentIndex =
                allSongs.indexOf(
                    item.dataset.song
                );

            playMusic(
                item.dataset.song,
                item.dataset.name,
                true,
                "library"
            );
        }
    );

    searchInput.addEventListener(
        "input",
        () =>
            searchSongs(
                searchInput.value
            )
    );

    searchInput.addEventListener(
        "compositionend",
        () =>
            searchSongs(
                searchInput.value
            )
    );

    searchInput.addEventListener(
        "keydown",
        event => {
            if (
                event.key ===
                "Escape"
            ) {
                searchInput.value =
                    "";

                searchSongs(
                    ""
                );

                return;
            }

            if (
                event.key ===
                "Enter"
            ) {
                const item =
                    getFirstVisibleSong();

                if (!item) {
                    return;
                }

                currentIndex =
                    allSongs.indexOf(
                        item.dataset.song
                    );

                playMusic(
                    item.dataset.song,
                    item.dataset.name
                );

                searchInput.blur();
            }
        }
    );

    play.addEventListener(
        "click",
        togglePlay
    );

    previous.addEventListener(
        "click",
        previousSong
    );

    next.addEventListener(
        "click",
        nextSong
    );

    [
        previous,
        play,
        next
    ].forEach(button => {
        button.addEventListener(
            "keydown",
            event => {
                if (
                    !["Enter", " "]
                        .includes(event.key)
                ) {
                    return;
                }

                event.preventDefault();
                button.click();
            }
        );
    });
}

function setProgressFromClientX(
    clientX
) {
    if (
        !currentSong.src ||
        !Number.isFinite(
            currentSong.duration
        ) ||
        currentSong.duration <= 0
    ) {
        return;
    }

    const rect =
        seekbar.getBoundingClientRect();

    if (!rect.width) {
        return;
    }

    const percent =
        Math.max(
            0,
            Math.min(
                100,
                (
                    (clientX -
                        rect.left) /
                    rect.width
                ) * 100
            )
        );

    updateProgress(
        percent
    );

    currentSong.currentTime =
        currentSong.duration *
        (percent / 100);
}

function setupSeekbar() {
    seekbar.addEventListener(
        "pointerdown",
        event => {
            if (
                !currentSong.src ||
                !Number.isFinite(
                    currentSong.duration
                ) ||
                currentSong.duration <= 0
            ) {
                return;
            }

            isSeeking = true;

            seekbar.setPointerCapture?.(
                event.pointerId
            );

            setProgressFromClientX(
                event.clientX
            );
        }
    );

    seekbar.addEventListener(
        "pointermove",
        event => {
            if (isSeeking) {
                setProgressFromClientX(
                    event.clientX
                );
            }
        }
    );

    const stop = event => {
        if (!isSeeking) {
            return;
        }

        if (
            event &&
            seekbar.hasPointerCapture?.(
                event.pointerId
            )
        ) {
            seekbar.releasePointerCapture(
                event.pointerId
            );
        }

        isSeeking = false;
    };

    seekbar.addEventListener(
        "pointerup",
        stop
    );

    seekbar.addEventListener(
        "pointercancel",
        stop
    );

    seekbar.addEventListener(
        "lostpointercapture",
        () => {
            isSeeking = false;
        }
    );

    seekbar.addEventListener(
        "keydown",
        event => {
            if (
                !currentSong.src ||
                !Number.isFinite(
                    currentSong.duration
                )
            ) {
                return;
            }

            if (
                event.key ===
                "ArrowRight"
            ) {
                event.preventDefault();

                currentSong.currentTime =
                    Math.min(
                        currentSong.duration,
                        currentSong.currentTime +
                            5
                    );
            }

            if (
                event.key ===
                "ArrowLeft"
            ) {
                event.preventDefault();

                currentSong.currentTime =
                    Math.max(
                        0,
                        currentSong.currentTime -
                            5
                    );
            }

            if (
                event.key ===
                "Home"
            ) {
                event.preventDefault();
                currentSong.currentTime =
                    0;
            }

            if (
                event.key ===
                "End"
            ) {
                event.preventDefault();

                currentSong.currentTime =
                    currentSong.duration;
            }
        }
    );
}

function setupAudio() {
    currentSong.addEventListener(
        "play",
        updatePlayerVisuals
    );

    currentSong.addEventListener(
        "pause",
        updatePlayerVisuals
    );

    currentSong.addEventListener(
        "loadedmetadata",
        () => {
            updateSongTime();

            updateProgress(
                currentSong.duration > 0
                    ? (
                        currentSong.currentTime /
                        currentSong.duration
                    ) * 100
                    : 0
            );
        }
    );

    currentSong.addEventListener(
        "durationchange",
        updateSongTime
    );

    currentSong.addEventListener(
        "timeupdate",
        () => {
            updateSongTime();

            if (
                !isSeeking &&
                Number.isFinite(
                    currentSong.duration
                ) &&
                currentSong.duration > 0
            ) {
                updateProgress(
                    (
                        currentSong.currentTime /
                        currentSong.duration
                    ) * 100
                );
            }
        }
    );

    currentSong.addEventListener(
        "ended",
        nextSong
    );

    currentSong.addEventListener(
        "error",
        () => {
            play.src =
                "svg files/play.svg";

            playbar.classList.remove(
                "is-playing"
            );

            setPlayerStatus(
                "Unable to play this track"
            );
        }
    );
}

function setupKeyboard() {
    document.addEventListener(
        "keydown",
        event => {
            const target =
                event.target;

            const tag =
                target?.tagName;

            const typing =
                [
                    "INPUT",
                    "TEXTAREA",
                    "SELECT"
                ].includes(tag) ||
                target?.isContentEditable;

            if (
                event.ctrlKey &&
                event.key.toLowerCase() ===
                    "k"
            ) {
                event.preventDefault();

                searchInput.focus();
                searchInput.select();

                return;
            }

            if (
                typing ||
                tag === "BUTTON" ||
                tag === "IMG" ||
                target === seekbar
            ) {
                return;
            }

            if (
                event.code ===
                "Space"
            ) {
                event.preventDefault();
                togglePlay();
                return;
            }

            if (
                event.key ===
                    "ArrowRight" &&
                currentSong.src &&
                Number.isFinite(
                    currentSong.duration
                )
            ) {
                currentSong.currentTime =
                    Math.min(
                        currentSong.duration,
                        currentSong.currentTime +
                            5
                    );

                return;
            }

            if (
                event.key ===
                    "ArrowLeft" &&
                currentSong.src &&
                Number.isFinite(
                    currentSong.duration
                )
            ) {
                currentSong.currentTime =
                    Math.max(
                        0,
                        currentSong.currentTime -
                            5
                    );

                return;
            }

            if (
                event.key.toLowerCase() ===
                "n"
            ) {
                nextSong();
            }

            if (
                event.key.toLowerCase() ===
                "p"
            ) {
                previousSong();
            }
        }
    );
}

function setupNavigation() {
    const navButtons =
        $$(".nav-btn");

    if (navButtons[0]) {
        navButtons[0].addEventListener(
            "click",
            () => history.back()
        );
    }

    if (navButtons[1]) {
        navButtons[1].addEventListener(
            "click",
            () => history.forward()
        );
    }
}

function setupCursor() {
    const light =
        $(".cursor-light");

    if (
        !light ||
        !matchMedia(
            "(pointer: fine)"
        ).matches
    ) {
        return;
    }

    let raf = 0;
    let x = 0;
    let y = 0;

    document.addEventListener(
        "mousemove",
        event => {
            x = event.clientX;
            y = event.clientY;

            if (raf) {
                return;
            }

            raf =
                requestAnimationFrame(
                    () => {
                        light.style.left =
                            `${x}px`;

                        light.style.top =
                            `${y}px`;

                        light.style.opacity =
                            "1";

                        raf = 0;
                    }
                );
        }
    );

    document.addEventListener(
        "mouseleave",
        () => {
            light.style.opacity =
                "0";
        }
    );
}

function setupClickEffects() {
    if (
        matchMedia(
            "(prefers-reduced-motion: reduce)"
        ).matches
    ) {
        return;
    }

    document.addEventListener(
        "click",
        event => {
            if (
                event.target.closest(
                    "input, .volume-slider, .volume-panel"
                )
            ) {
                return;
            }

            const effect =
                document.createElement(
                    "div"
                );

            effect.className =
                "click-effect";

            effect.style.left =
                `${event.clientX}px`;

            effect.style.top =
                `${event.clientY}px`;

            document.body.appendChild(
                effect
            );

            setTimeout(
                () => effect.remove(),
                900
            );
        }
    );
}


function getFolderSongIdentity(value) {
    if (!value) {
        return "";
    }

    let text = String(value);

    try {
        text = decodeURIComponent(text);
    } catch {
    }

    if (text.includes("/songs/")) {
        text = text.split("/songs/").pop() || text;
    }

    try {
        text = decodeURIComponent(text);
    } catch {
    }

    return normalizeText(
        text
            .replace(/\.mp3$/i, "")
    );
}

function resolveFolderSong(savedSong) {
    const savedIdentity =
        getFolderSongIdentity(savedSong);

    if (!savedIdentity) {
        return null;
    }

    return allSongs.find(song =>
        getFolderSongIdentity(song) === savedIdentity ||
        getFolderSongIdentity(getSongName(song)) === savedIdentity
    ) || null;
}

function getFolderSongs(folderId) {
    const saved =
        folders[folderId]?.songs;

    if (!Array.isArray(saved) || !saved.length) {
        return [];
    }

    const seen = new Set();
    const resolved = [];

    saved.forEach(savedSong => {
        const actualSong =
            resolveFolderSong(savedSong);

        if (actualSong && !seen.has(actualSong)) {
            seen.add(actualSong);
            resolved.push(actualSong);
        }
    });

    return resolved;
}

function getFolderCardData(card) {
    const folderId =
        card.dataset.folderId ||
        "folder-" +
            [...$$(".card")].indexOf(card);

    const title =
        card.dataset.folderName ||
        $(".card-title", card)?.textContent.trim() ||
        $(".card h3", card)?.textContent.trim() ||
        "My Folder";

    const description =
        card.dataset.folderDescription ||
        $(".card-description", card)?.textContent.trim() ||
        $(".card p", card)?.textContent.trim() ||
        "Your saved songs.";

    const image =
        $("img", card)?.getAttribute("src") ||
        "";

    return {
        id: folderId,
        title,
        description,
        image,
        custom:
            folders[folderId]?.custom === true ||
            card.dataset.customFolder === "true"
    };
}

function ensureFolderRecord(folder) {
    if (
        !folders[folder.id] ||
        typeof folders[folder.id] !== "object"
    ) {
        folders[folder.id] = {
            songs: []
        };
    }

    if (!Array.isArray(folders[folder.id].songs)) {
        folders[folder.id].songs = [];
    }

    return folders[folder.id];
}

function updateFolderCardCounts() {
    $$(".card[data-folder-id]").forEach(card => {
        const folder =
            getFolderCardData(card);

        const count =
            getFolderSongs(folder.id).length;

        let countBadge =
            $(".folder-count", card);

        if (!countBadge) {
            countBadge =
                document.createElement("span");

            countBadge.className =
                "folder-count";

            card.appendChild(
                countBadge
            );
        }

        countBadge.textContent =
            `${count} ${
                count === 1
                    ? "track"
                    : "tracks"
            }`;

        card.classList.toggle(
            "has-songs",
            count > 0
        );
    });
}

function closeFolderModal() {
    if (!folderModal) {
        return;
    }

    folderModal.classList.remove(
        "open"
    );

    folderModal.setAttribute(
        "aria-hidden",
        "true"
    );

    document.body.classList.remove(
        "folder-modal-open"
    );
}

function setFolderHeader(folder, count, mode) {
    if (!folderModal) {
        return;
    }

    const art =
        $(".folder-modal-art", folderModal);

    const title =
        $(".folder-modal-heading h2", folderModal);

    const description =
        $(".folder-modal-description", folderModal);

    const headerCount =
        $(".folder-modal-count", folderModal);

    if (art) {
        art.src = folder.image;
        art.alt = `${folder.title} artwork`;
    }

    if (title) {
        title.textContent = folder.title;
    }

    if (description) {
        description.textContent = folder.description;
    }

    if (headerCount) {
        if (mode === "saved") {
            headerCount.textContent =
                `${count} ${count === 1 ? "song" : "songs"}`;
        } else {
            headerCount.textContent =
                count > 0
                    ? `${count} already in folder`
                    : "Start adding songs";
        }
    }
}

function collectFolderSelection() {
    if (!folderModal) {
        return [];
    }

    return $$(
        ".folder-song-check:not(:disabled)",
        folderModal
    )
        .filter(check => check.checked)
        .map(check => check.dataset.song)
        .filter(Boolean);
}

function updateFolderSelectionUI() {
    if (!folderModal) {
        return;
    }

    const checks =
        $$(".folder-song-check", folderModal);

    const added =
        checks.filter(
            check => !check.disabled && check.checked
        ).length;

    const existing =
        checks.filter(
            check => check.disabled && check.checked
        ).length;

    checks.forEach(check => {
        check.closest(".folder-song")?.classList.toggle(
            "is-selected",
            check.checked
        );
    });

    const selectionCount =
        $(".folder-selection-count", folderModal);

    if (selectionCount) {
        selectionCount.textContent =
            existing > 0
                ? `${added} to add • ${existing} saved`
                : `${added} selected`;
    }

    const addButton =
        $(".folder-add-save", folderModal);

    if (addButton) {
        addButton.disabled =
            added === 0;
    }

    const headerCount =
        $(".folder-modal-count", folderModal);

    if (headerCount) {
        headerCount.textContent =
            existing > 0
                ? `${existing} saved • ${added} to add`
                : added > 0
                    ? `${added} selected`
                    : "Select songs to add";
    }
}

function filterFolderSongs(value) {
    if (!folderModal) {
        return;
    }

    const query =
        normalizeText(value);

    $$(".folder-song", folderModal)
        .forEach(row => {
            const name =
                normalizeText(
                    row.dataset.name || ""
                );

            row.classList.toggle(
                "is-hidden",
                Boolean(query) && !name.includes(query)
            );
        });
}

function createFolderModal() {
    if (folderModal) {
        return folderModal;
    }

    folderModal =
        document.createElement("div");

    folderModal.className =
        "folder-modal-backdrop";

    folderModal.setAttribute(
        "aria-hidden",
        "true"
    );

    folderModal.innerHTML = `
        <section
            class="folder-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="folderModalTitle"
        >
            <div class="folder-modal-orb"></div>

            <header class="folder-modal-header">
                <div class="folder-modal-art-wrap">
                    <img class="folder-modal-art" alt="">
                    <span class="folder-modal-art-glow"></span>
                </div>

                <div class="folder-modal-heading">
                    <span class="folder-modal-eyebrow">MUSIC FOLDER</span>
                    <h2 id="folderModalTitle"></h2>
                    <p class="folder-modal-description"></p>
                    <span class="folder-modal-count">0 songs</span>
                </div>

                <button
                    type="button"
                    class="folder-modal-close"
                    aria-label="Close folder"
                >
                    <span></span>
                    <span></span>
                </button>
            </header>

            <div class="folder-modal-toolbar"></div>
            <div class="folder-song-list"></div>
            <footer class="folder-modal-footer"></footer>
        </section>
    `;

    document.body.appendChild(
        folderModal
    );

    folderModal.addEventListener(
        "click",
        event => {
            if (event.target === folderModal) {
                closeFolderModal();
            }
        }
    );

    $(".folder-modal-close", folderModal)
        .addEventListener(
            "click",
            closeFolderModal
        );

    document.addEventListener(
        "keydown",
        event => {
            if (
                event.key === "Escape" &&
                folderModal?.classList.contains("open")
            ) {
                closeFolderModal();
            }
        }
    );

    return folderModal;
}

function renderFolderPickerView(folder) {
    const modal =
        createFolderModal();

    const savedSongs =
        getFolderSongs(folder.id);

    const savedIdentities =
        new Set(
            savedSongs
                .map(getFolderSongIdentity)
                .filter(Boolean)
        );

    const toolbar =
        $(".folder-modal-toolbar", modal);

    const list =
        $(".folder-song-list", modal);

    const footer =
        $(".folder-modal-footer", modal);

    setFolderHeader(
        folder,
        savedSongs.length,
        "picker"
    );

    toolbar.innerHTML = `
        <label class="folder-modal-search">
            <span>⌕</span>
            <input
                type="search"
                class="folder-search-input"
                placeholder="Search your library..."
                autocomplete="off"
            >
        </label>

        <div class="folder-toolbar-actions">
            <button type="button" class="folder-select-all">Select all</button>
            <button type="button" class="folder-clear-all">Clear</button>
            <span class="folder-selection-count">0 selected</span>
        </div>
    `;

    footer.innerHTML = `
        <div class="folder-secondary-actions">
            <button type="button" class="folder-delete">
                Delete folder
            </button>
            <button type="button" class="folder-cancel">
                ${savedSongs.length ? "Back to folder" : "Cancel"}
            </button>
        </div>

        <div class="folder-primary-actions">
            <button type="button" class="folder-add-save" disabled>
                ${savedSongs.length ? "Add selected" : "Save folder"}
            </button>
        </div>
    `;

    list.innerHTML = "";

    if (!allSongs.length) {
        const empty =
            document.createElement("div");

        empty.className =
            "folder-empty";

        empty.innerHTML =
            `<strong>Library unavailable</strong><span>Your music library could not be loaded.</span>`;

        list.appendChild(empty);
    } else {
        allSongs.forEach(
            (song, index) => {
                const name =
                    getSongName(song);

                const isExisting =
                    savedIdentities.has(
                        getFolderSongIdentity(song)
                    );

                const label =
                    document.createElement("label");

                label.className =
                    "folder-song";

                label.dataset.name =
                    name;

                const check =
                    document.createElement("input");

                check.type =
                    "checkbox";

                check.className =
                    "folder-song-check";

                check.dataset.song =
                    song;

                check.checked =
                    isExisting;

                check.disabled =
                    isExisting;

                const customCheck =
                    document.createElement("span");

                customCheck.className =
                    "folder-check";

                const number =
                    document.createElement("span");

                number.className =
                    "folder-song-number";

                number.textContent =
                    String(index + 1).padStart(2, "0");

                const icon =
                    document.createElement("span");

                icon.className =
                    "folder-song-icon";

                icon.textContent =
                    "♪";

                const text =
                    document.createElement("span");

                text.className =
                    "folder-song-text";

                const title =
                    document.createElement("strong");

                title.textContent =
                    name;

                const artist =
                    document.createElement("small");

                artist.textContent =
                    "karthikeya";

                text.append(
                    title,
                    artist
                );

                const badge =
                    document.createElement("span");

                badge.className =
                    "folder-song-saved";

                badge.textContent =
                    isExisting ? "IN FOLDER" : "";

                label.append(
                    check,
                    customCheck,
                    number,
                    icon,
                    text,
                    badge
                );

                label.classList.toggle(
                    "is-selected",
                    isExisting
                );

                check.addEventListener(
                    "change",
                    updateFolderSelectionUI
                );

                list.appendChild(
                    label
                );
            }
        );
    }

    const search =
        $(".folder-search-input", modal);

    search.addEventListener(
        "input",
        event =>
            filterFolderSongs(event.target.value)
    );

    $(".folder-select-all", modal)
        .addEventListener(
            "click",
            () => {
                $$(".folder-song-check:not(:disabled)", modal)
                    .forEach(
                        check =>
                            check.checked = true
                    );

                updateFolderSelectionUI();
            }
        );

    $(".folder-clear-all", modal)
        .addEventListener(
            "click",
            () => {
                $$(".folder-song-check:not(:disabled)", modal)
                    .forEach(
                        check =>
                            check.checked = false
                    );

                updateFolderSelectionUI();
            }
        );

    $(".folder-delete", modal)
        ?.addEventListener(
            "click",
            () => deleteFolder(folder)
        );

    $(".folder-cancel", modal)
        .addEventListener(
            "click",
            () => {
                if (savedSongs.length) {
                    renderFolderSavedView(folder);
                } else {
                    closeFolderModal();
                }
            }
        );

    $(".folder-add-save", modal)
        .addEventListener(
            "click",
            () => saveFolderAdditions(folder)
        );

    updateFolderSelectionUI();
}

function renderFolderSavedView(folder) {
    const modal =
        createFolderModal();

    const songs =
        getFolderSongs(folder.id);

    const toolbar =
        $(".folder-modal-toolbar", modal);

    const list =
        $(".folder-song-list", modal);

    const footer =
        $(".folder-modal-footer", modal);

    setFolderHeader(
        folder,
        songs.length,
        "saved"
    );

    toolbar.innerHTML = `
        <div class="folder-saved-summary">
            <span class="folder-saved-eyebrow">YOUR SAVED SONGS</span>
            <strong>${songs.length} ${songs.length === 1 ? "song" : "songs"}</strong>
        </div>

        <div class="folder-saved-actions">
            <button type="button" class="folder-add-more">
                <span>＋</span> Add songs
            </button>
        </div>
    `;

    list.innerHTML = "";

    if (!songs.length) {
        const empty =
            document.createElement("div");

        empty.className =
            "folder-empty folder-empty-saved";

        empty.innerHTML =
            `<strong>No songs in this folder yet</strong><span>Add music from your library to build this collection.</span><button type="button" class="folder-empty-add">＋ Add songs</button>`;

        list.appendChild(
            empty
        );

        $(".folder-empty-add", list)
            .addEventListener(
                "click",
                () => renderFolderPickerView(folder)
            );
    } else {
        songs.forEach(
            (song, index) => {
                const name =
                    getSongName(song);

                const row =
                    document.createElement("div");

                row.className =
                    "folder-saved-song";

                row.dataset.song =
                    song;

                const number =
                    document.createElement("span");

                number.className =
                    "folder-song-number";

                number.textContent =
                    String(index + 1).padStart(2, "0");

                const icon =
                    document.createElement("span");

                icon.className =
                    "folder-song-icon";

                icon.textContent =
                    "♪";

                const text =
                    document.createElement("span");

                text.className =
                    "folder-song-text";

                const title =
                    document.createElement("strong");

                title.textContent =
                    name;

                const artist =
                    document.createElement("small");

                artist.textContent =
                    "karthikeya";

                text.append(
                    title,
                    artist
                );

                const playHint =
                    document.createElement("span");

                playHint.className =
                    "folder-song-play-hint";

                playHint.textContent =
                    "PLAY";

                const remove =
                    document.createElement("button");

                remove.type =
                    "button";

                remove.className =
                    "folder-remove";

                remove.setAttribute(
                    "aria-label",
                    `Remove ${name} from ${folder.title}`
                );

                remove.innerHTML =
                    `<span></span><span></span>`;

                row.append(
                    number,
                    icon,
                    text,
                    playHint,
                    remove
                );

                row.addEventListener(
                    "click",
                    event => {
                        if (
                            event.target.closest(".folder-remove")
                        ) {
                            return;
                        }

                        startFolderPlayback(
                            folder.id,
                            songs,
                            index
                        );
                    }
                );

                remove.addEventListener(
                    "click",
                    event => {
                        event.preventDefault();
                        event.stopPropagation();

                        removeSongFromFolder(
                            folder,
                            song
                        );
                    }
                );

                list.appendChild(
                    row
                );
            }
        );
    }

    footer.innerHTML = `
        <div class="folder-secondary-actions">
            <button type="button" class="folder-delete">
                Delete folder
            </button>
            <button type="button" class="folder-cancel">
                Close
            </button>
        </div>

        <div class="folder-primary-actions">
            <button
                type="button"
                class="folder-play-folder"
                ${songs.length ? "" : "disabled"}
            >
                Play folder
                <span>▶</span>
            </button>
        </div>
    `;

    $(".folder-add-more", modal)
        .addEventListener(
            "click",
            () => renderFolderPickerView(folder)
        );

    $(".folder-delete", modal)
        ?.addEventListener(
            "click",
            () => deleteFolder(folder)
        );

    $(".folder-cancel", modal)
        .addEventListener(
            "click",
            closeFolderModal
        );

    $(".folder-play-folder", modal)
        .addEventListener(
            "click",
            () => {
                if (songs.length) {
                    startFolderPlayback(
                        folder.id,
                        songs,
                        0
                    );
                }
            }
        );
}

function saveFolderAdditions(folder) {
    if (!folderModal || !activeFolderId) {
        return;
    }

    const newSongs =
        collectFolderSelection();

    if (!newSongs.length) {
        const list =
            $(".folder-song-list", folderModal);

        list.classList.remove(
            "selection-error"
        );

        void list.offsetWidth;

        list.classList.add(
            "selection-error"
        );

        return;
    }

    const currentSongs =
        getFolderSongs(folder.id);

    const combined = [];
    const seen = new Set();

    [...currentSongs, ...newSongs]
        .forEach(song => {
            const resolved =
                resolveFolderSong(song) || song;

            const identity =
                getFolderSongIdentity(resolved);

            if (
                identity &&
                !seen.has(identity)
            ) {
                seen.add(identity);
                combined.push(resolved);
            }
        });

    folders[folder.id] = {
        ...(folders[folder.id] || {}),
        songs: combined
    };

    saveFolders();
    updateFolderCardCounts();

    renderFolderSavedView(folder);
}

function removeSongFromFolder(folder, song) {
    const record =
        ensureFolderRecord(folder);

    const identity =
        getFolderSongIdentity(song);

    record.songs =
        record.songs.filter(savedSong =>
            getFolderSongIdentity(savedSong) !== identity
        );

    saveFolders();
    updateFolderCardCounts();

    const currentFolderSong =
        folderQueue.includes(song);

    if (currentFolderSong) {
        folderQueue =
            getFolderSongs(folder.id);

        if (!folderQueue.length) {
            folderQueueIndex = -1;
            activeFolderId = null;
            currentSong.pause();
        } else {
            folderQueueIndex =
                Math.min(
                    folderQueueIndex,
                    folderQueue.length - 1
                );
        }
    }

    renderFolderSavedView(folder);
}

function startFolderPlayback(
    folderId,
    queue = getFolderSongs(folderId),
    startIndex = 0
) {
    const resolvedQueue =
        queue
            .map(song =>
                resolveFolderSong(song) || song
            )
            .filter(song =>
                allSongs.includes(song)
            );

    if (!resolvedQueue.length) {
        setPlayerStatus(
            "Folder is empty"
        );

        return;
    }

    activeFolderId =
        folderId;

    folderQueue =
        [...resolvedQueue];

    folderQueueIndex =
        Math.max(
            0,
            Math.min(
                startIndex,
                folderQueue.length - 1
            )
        );

    const song =
        folderQueue[folderQueueIndex];

    playMusic(
        song,
        getSongName(song),
        true,
        "folder"
    );
}

function openFolderModal(folder) {
    const modal =
        createFolderModal();

    activeFolderId =
        folder.id;

    ensureFolderRecord(folder);

    if (getFolderSongs(folder.id).length) {
        renderFolderSavedView(folder);
    } else {
        renderFolderPickerView(folder);
    }

    modal.classList.add(
        "open"
    );

    modal.setAttribute(
        "aria-hidden",
        "false"
    );

    document.body.classList.add(
        "folder-modal-open"
    );

    requestAnimationFrame(
        () => {
            $(".folder-modal-close", modal)
                ?.focus();
        }
    );
}

const DEFAULT_FOLDER_ART =
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
            <defs>
                <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stop-color="#4bda6d"/>
                    <stop offset="1" stop-color="#101712"/>
                </linearGradient>
                <radialGradient id="r" cx="75%" cy="18%" r="70%">
                    <stop offset="0" stop-color="#b7ffd0" stop-opacity=".45"/>
                    <stop offset="1" stop-color="#b7ffd0" stop-opacity="0"/>
                </radialGradient>
            </defs>
            <rect width="800" height="800" rx="70" fill="url(#g)"/>
            <circle cx="610" cy="160" r="250" fill="url(#r)"/>
            <circle cx="180" cy="650" r="280" fill="#061009" fill-opacity=".40"/>
            <path d="M320 275h160c34 0 61 27 61 61v128c0 34-27 61-61 61H320c-34 0-61-27-61-61V336c0-34 27-61 61-61z" fill="#061009" fill-opacity=".72"/>
            <path d="M360 335l120 65-120 65z" fill="#fff"/>
        </svg>
    `);

let newFolderModal = null;
let createFolderImageData = "";
let createFolderImageName = "";

function getCustomFolders() {
    return Object.entries(customFolders)
        .filter(([id, folder]) =>
            !isFolderDeleted(id) &&
            folder &&
            typeof folder === "object" &&
            folder.deleted !== true
        )
        .sort(([, a], [, b]) =>
            Number(b.createdAt || 0) - Number(a.createdAt || 0)
        );
}

function createFolderCard(folder) {
    const card = document.createElement("article");

    card.className =
        "card folder-card custom-folder-card";

    card.dataset.folderId =
        folder.id;

    card.dataset.folderName =
        folder.title;

    card.dataset.folderDescription =
        folder.description;

    card.dataset.customFolder =
        "true";

    card.innerHTML = `
        <span class="folder-count">0 tracks</span>
        <div class="play" role="button" tabindex="0" aria-label="Play ${escapeHtmlText(folder.title)}">
            <svg width="50" height="40" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <circle cx="25" cy="25" r="24" fill="#16e05b" />
                <path d="M21 16l14 9-14 9z" />
            </svg>
        </div>
        <img src="${folder.image || DEFAULT_FOLDER_ART}" alt="${escapeHtmlText(folder.title)} artwork" loading="lazy">
        <h3></h3>
        <p></p>
    `;

    $("h3", card).textContent =
        folder.title;

    $("p", card).textContent =
        folder.description;

    return card;
}

function escapeHtmlText(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function bindFolderCard(card) {
    if (!card || card.dataset.folderBound === "true") {
        return;
    }

    if (!card.dataset.folderId) {
        card.dataset.folderId =
            `folder-${$$(".card").indexOf(card) + 1}`;
    }

    const data =
        getFolderCardData(card);

    card.classList.add(
        "folder-card"
    );

    card.tabIndex =
        0;

    card.setAttribute(
        "role",
        "button"
    );

    card.setAttribute(
        "aria-label",
        `Open ${data.title}`
    );

    $(".folder-type", card)?.remove();

    let countBadge =
        $(".folder-count", card);

    if (!countBadge) {
        countBadge =
            document.createElement("span");

        countBadge.className =
            "folder-count";

        countBadge.textContent =
            "0 tracks";

        card.appendChild(
            countBadge
        );
    }

    const playButton =
        $(".play", card);

    const open = event => {
        event.preventDefault();

        openFolderModal(
            data
        );
    };

    playButton?.addEventListener(
        "click",
        open
    );

    playButton?.addEventListener(
        "keydown",
        event => {
            if (
                !["Enter", " "]
                    .includes(event.key)
            ) {
                return;
            }

            open(event);
        }
    );

    card.addEventListener(
        "click",
        event => {
            if (
                event.target.closest(".play")
            ) {
                return;
            }

            openFolderModal(
                data
            );
        }
    );

    card.addEventListener(
        "keydown",
        event => {
            if (
                !["Enter", " "]
                    .includes(event.key)
            ) {
                return;
            }

            if (
                event.target.closest(".play")
            ) {
                return;
            }

            event.preventDefault();

            openFolderModal(
                data
            );
        }
    );

    card.dataset.folderBound =
        "true";
}

function renderCustomFolders() {
    const container =
        $(".cardcontainer");

    if (!container) {
        return;
    }

    $$(".custom-folder-card", container)
        .forEach(card => card.remove());

    getCustomFolders()
        .forEach(([id, folder]) => {
            const card =
                createFolderCard({
                    id,
                    ...folder
                });

            container.prepend(card);
        });
}

function updateCreateFolderPreview() {
    if (!newFolderModal) {
        return;
    }

    const nameInput =
        $(".create-folder-name", newFolderModal);

    const descriptionInput =
        $(".create-folder-description", newFolderModal);

    const title =
        $(".create-folder-preview-title", newFolderModal);

    const description =
        $(".create-folder-preview-description", newFolderModal);

    const image =
        $(".create-folder-preview-image", newFolderModal);

    const imageFallback =
        $(".create-folder-preview-fallback", newFolderModal);

    const name =
        nameInput?.value.trim() ||
        "New folder";

    const descriptionText =
        descriptionInput?.value.trim() ||
        "Your personal collection.";

    if (title) {
        title.textContent =
            name;
    }

    if (description) {
        description.textContent =
            descriptionText;
    }

    if (image) {
        image.src =
            createFolderImageData ||
            DEFAULT_FOLDER_ART;

        image.alt =
            `${name} preview`;
    }

    if (imageFallback) {
        imageFallback.hidden =
            Boolean(createFolderImageData);
    }
}

function updateCreateFolderImageState() {
    if (!newFolderModal) {
        return;
    }

    const uploadTitle =
        $(".create-folder-upload-title", newFolderModal);

    const uploadHint =
        $(".create-folder-upload-hint", newFolderModal);

    const uploadName =
        $(".create-folder-upload-name", newFolderModal);

    if (uploadTitle) {
        uploadTitle.textContent =
            createFolderImageData
                ? "Artwork selected"
                : "Choose folder artwork";
    }

    if (uploadHint) {
        uploadHint.textContent =
            createFolderImageData
                ? "Click to replace the image"
                : "PNG, JPG, WEBP • up to 8 MB";
    }

    if (uploadName) {
        uploadName.textContent =
            createFolderImageName || "";
    }

    updateCreateFolderPreview();
}

function showCreateFolderError(message = "") {
    if (!newFolderModal) {
        return;
    }

    const error =
        $(".create-folder-error", newFolderModal);

    if (!error) {
        return;
    }

    error.textContent =
        message;

    error.classList.toggle(
        "is-visible",
        Boolean(message)
    );
}

function createCreateFolderModal() {
    if (newFolderModal) {
        return newFolderModal;
    }

    newFolderModal =
        document.createElement("div");

    newFolderModal.className =
        "create-folder-modal-backdrop";

    newFolderModal.setAttribute(
        "aria-hidden",
        "true"
    );

    newFolderModal.innerHTML = `
        <section
            class="create-folder-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="createFolderTitle"
        >
            <div class="create-folder-modal-orb"></div>

            <header class="create-folder-modal-header">
                <div>
                    <span class="create-folder-eyebrow">BUILD YOUR COLLECTION</span>
                    <h2 id="createFolderTitle">Create a new folder</h2>
                    <p>Give your music a name, a mood, and an identity.</p>
                </div>

                <button
                    type="button"
                    class="create-folder-close"
                    aria-label="Close create folder"
                >
                    <span></span>
                    <span></span>
                </button>
            </header>

            <form class="create-folder-form">
                <div class="create-folder-grid">
                    <div class="create-folder-preview-column">
                        <div class="create-folder-preview-card">
                            <div class="create-folder-preview-art">
                                <img class="create-folder-preview-image" src="${DEFAULT_FOLDER_ART}" alt="New folder preview">
                                <span class="create-folder-preview-fallback">♪</span>
                                <span class="create-folder-preview-glow"></span>
                            </div>
                            <div class="create-folder-preview-copy">
                                <span>LIVE PREVIEW</span>
                                <strong class="create-folder-preview-title">New folder</strong>
                                <p class="create-folder-preview-description">Your personal collection.</p>
                            </div>
                        </div>

                        <label class="create-folder-upload">
                            <input
                                type="file"
                                class="create-folder-image-input"
                                accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
                            >
                            <span class="create-folder-upload-icon">
                                <span></span>
                                <span></span>
                            </span>
                            <strong class="create-folder-upload-title">Choose folder artwork</strong>
                            <span class="create-folder-upload-hint">PNG, JPG, WEBP • up to 8 MB</span>
                            <span class="create-folder-upload-name"></span>
                        </label>
                    </div>

                    <div class="create-folder-fields">
                        <label class="create-folder-field">
                            <span>Name</span>
                            <input
                                type="text"
                                class="create-folder-name"
                                maxlength="40"
                                placeholder="e.g. Late Night Drive"
                                autocomplete="off"
                                required
                            >
                            <small><span class="create-folder-name-count">0</span>/40</small>
                        </label>

                        <label class="create-folder-field">
                            <span>Description</span>
                            <textarea
                                class="create-folder-description"
                                maxlength="120"
                                rows="5"
                                placeholder="What kind of music belongs here?"
                            ></textarea>
                            <small><span class="create-folder-description-count">0</span>/120</small>
                        </label>

                        <div class="create-folder-tip">
                            <span>✦</span>
                            <div>
                                <strong>Saved in your browser</strong>
                                <p>Your folder details and selected artwork stay on this device using local storage.</p>
                            </div>
                        </div>

                        <p class="create-folder-error" role="alert"></p>
                    </div>
                </div>

                <footer class="create-folder-footer">
                    <button type="button" class="create-folder-cancel">Cancel</button>
                    <button type="submit" class="create-folder-submit">
                        <span>Create folder</span>
                        <span class="create-folder-submit-icon">＋</span>
                    </button>
                </footer>
            </form>
        </section>
    `;

    document.body.appendChild(
        newFolderModal
    );

    const form =
        $(".create-folder-form", newFolderModal);

    const nameInput =
        $(".create-folder-name", newFolderModal);

    const descriptionInput =
        $(".create-folder-description", newFolderModal);

    const imageInput =
        $(".create-folder-image-input", newFolderModal);

    const upload =
        $(".create-folder-upload", newFolderModal);

    nameInput.addEventListener(
        "input",
        () => {
            const count =
                $(".create-folder-name-count", newFolderModal);

            if (count) {
                count.textContent =
                    String(nameInput.value.length);
            }

            showCreateFolderError("");
            updateCreateFolderPreview();
        }
    );

    descriptionInput.addEventListener(
        "input",
        () => {
            const count =
                $(".create-folder-description-count", newFolderModal);

            if (count) {
                count.textContent =
                    String(descriptionInput.value.length);
            }

            showCreateFolderError("");
            updateCreateFolderPreview();
        }
    );

    imageInput.addEventListener(
        "change",
        async event => {
            const file =
                event.target.files?.[0];

            if (file) {
                await handleCreateFolderImage(file);
            }
        }
    );

    ["dragenter", "dragover"].forEach(
        type => {
            upload.addEventListener(
                type,
                event => {
                    event.preventDefault();
                    upload.classList.add("is-dragging");
                }
            );
        }
    );

    ["dragleave", "drop"].forEach(
        type => {
            upload.addEventListener(
                type,
                event => {
                    event.preventDefault();
                    upload.classList.remove("is-dragging");
                }
            );
        }
    );

    upload.addEventListener(
        "drop",
        async event => {
            const file =
                event.dataTransfer?.files?.[0];

            if (file) {
                await handleCreateFolderImage(file);
            }
        }
    );

    $(".create-folder-close", newFolderModal)
        .addEventListener(
            "click",
            closeCreateFolderModal
        );

    $(".create-folder-cancel", newFolderModal)
        .addEventListener(
            "click",
            closeCreateFolderModal
        );

    newFolderModal.addEventListener(
        "click",
        event => {
            if (
                event.target ===
                newFolderModal
            ) {
                closeCreateFolderModal();
            }
        }
    );

    form.addEventListener(
        "submit",
        event => {
            event.preventDefault();
            createNewFolder();
        }
    );

    document.addEventListener(
        "keydown",
        event => {
            if (
                event.key === "Escape" &&
                newFolderModal?.classList.contains("open")
            ) {
                closeCreateFolderModal();
            }
        }
    );

    return newFolderModal;
}

function openCreateFolderModal() {
    const modal =
        createCreateFolderModal();

    const form =
        $(".create-folder-form", modal);

    form.reset();

    createFolderImageData =
        "";

    createFolderImageName =
        "";

    const nameCount =
        $(".create-folder-name-count", modal);

    const descriptionCount =
        $(".create-folder-description-count", modal);

    if (nameCount) {
        nameCount.textContent =
            "0";
    }

    if (descriptionCount) {
        descriptionCount.textContent =
            "0";
    }

    const imageInput =
        $(".create-folder-image-input", modal);

    if (imageInput) {
        imageInput.value =
            "";
    }

    showCreateFolderError("");
    updateCreateFolderImageState();

    modal.classList.add(
        "open"
    );

    modal.setAttribute(
        "aria-hidden",
        "false"
    );

    document.body.classList.add(
        "create-folder-modal-open"
    );

    requestAnimationFrame(
        () => {
            $(".create-folder-name", modal)
                ?.focus();
        }
    );
}

function closeCreateFolderModal() {
    if (!newFolderModal) {
        return;
    }

    newFolderModal.classList.remove(
        "open"
    );

    newFolderModal.setAttribute(
        "aria-hidden",
        "true"
    );

    document.body.classList.remove(
        "create-folder-modal-open"
    );
}

function compressFolderImage(file) {
    return new Promise(
        (resolve, reject) => {
            if (
                !file ||
                !file.type.startsWith("image/")
            ) {
                reject(
                    new Error(
                        "Choose a valid image file."
                    )
                );
                return;
            }

            if (
                file.size >
                8 * 1024 * 1024
            ) {
                reject(
                    new Error(
                        "That image is larger than 8 MB."
                    )
                );
                return;
            }

            const objectURL =
                URL.createObjectURL(file);

            const image =
                new Image();

            image.onload = () => {
                try {
                    const maxSize =
                        720;

                    const scale =
                        Math.min(
                            1,
                            maxSize /
                                Math.max(
                                    image.naturalWidth,
                                    image.naturalHeight
                                )
                        );

                    const width =
                        Math.max(
                            1,
                            Math.round(
                                image.naturalWidth *
                                    scale
                            )
                        );

                    const height =
                        Math.max(
                            1,
                            Math.round(
                                image.naturalHeight *
                                    scale
                            )
                        );

                    const canvas =
                        document.createElement("canvas");

                    canvas.width =
                        width;

                    canvas.height =
                        height;

                    const context =
                        canvas.getContext("2d");

                    if (!context) {
                        throw new Error(
                            "Image processing is unavailable."
                        );
                    }

                    context.drawImage(
                        image,
                        0,
                        0,
                        width,
                        height
                    );

                    const output =
                        canvas.toDataURL(
                            "image/webp",
                            .82
                        );

                    const data =
                        output &&
                        output !== "data:," &&
                        output.length > 20
                            ? output
                            : canvas.toDataURL(
                                "image/jpeg",
                                .84
                            );

                    URL.revokeObjectURL(
                        objectURL
                    );

                    resolve(
                        data
                    );
                } catch (error) {
                    URL.revokeObjectURL(
                        objectURL
                    );

                    reject(error);
                }
            };

            image.onerror = () => {
                URL.revokeObjectURL(
                    objectURL
                );

                reject(
                    new Error(
                        "That image could not be read."
                    )
                );
            };

            image.src =
                objectURL;
        }
    );
}

async function handleCreateFolderImage(file) {
    showCreateFolderError("");

    try {
        createFolderImageData =
            await compressFolderImage(file);

        createFolderImageName =
            file.name;

        updateCreateFolderImageState();
    } catch (error) {
        createFolderImageData =
            "";

        createFolderImageName =
            "";

        updateCreateFolderImageState();

        showCreateFolderError(
            error?.message ||
            "Could not use that image."
        );
    }
}

function createNewFolderId() {
    const base =
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2,10)}`;

    return `custom-${base}`;
}

function deleteFolder(folder) {
    if (
        !folder?.id ||
        INVALID_FOLDER_IDS.includes(String(folder.id))
    ) {
        return;
    }

    const confirmed =
        window.confirm(
            `Delete "${folder.title}"? This will remove the folder and all songs saved inside it.`
        );

    if (!confirmed) {
        return;
    }

    const id = String(folder.id);
    const card =
        $$(".folder-card")
            .find(item => item.dataset.folderId === id);

    delete folders[id];
    delete customFolders[id];

    try {
        localStorage.removeItem(CUSTOM_FOLDER_STORAGE_KEY);
    } catch {
    }

    try {
        localStorage.setItem(
            CUSTOM_FOLDER_STORAGE_KEY,
            JSON.stringify(customFolders)
        );
    } catch {
    }

    try {
        localStorage.removeItem(FOLDER_STORAGE_KEY);
        localStorage.setItem(
            FOLDER_STORAGE_KEY,
            JSON.stringify(folders)
        );
    } catch {
    }

    try {
        markFolderDeleted(id);
    } catch {
        try {
            localStorage.setItem(
                `${DELETED_FOLDER_PREFIX}${id}`,
                "1"
            );
        } catch {
        }

        try {
            deletedFolderIds.push(id);
        } catch {
        }
    }

    if (activeFolderId === id) {
        activeFolderId = null;
        folderQueue = [];
        folderQueueIndex = -1;
        currentSong.pause();
    }

    closeFolderModal();

    if (card) {
        card.classList.add("custom-folder-deleting");
        window.setTimeout(() => card.remove(), 420);
    }

    updateFolderCardCounts();
}

function createNewFolder() {
    if (!newFolderModal) {
        return;
    }

    const nameInput =
        $(".create-folder-name", newFolderModal);

    const descriptionInput =
        $(".create-folder-description", newFolderModal);

    const name =
        nameInput?.value.trim() ||
        "";

    const description =
        descriptionInput?.value.trim() ||
        "Your personal collection of songs.";

    if (!name) {
        showCreateFolderError(
            "Give your folder a name first."
        );

        nameInput?.focus();

        return;
    }

    if (name.length > 40) {
        showCreateFolderError(
            "Folder names can be up to 40 characters."
        );

        return;
    }

    const id =
        createNewFolderId();

    const folder = {
        custom: true,
        title: name,
        description,
        image:
            createFolderImageData ||
            DEFAULT_FOLDER_ART,
        songs: [],
        createdAt: Date.now()
    };

    folders[id] = {
        songs: [],
        custom: true
    };

    customFolders[id] = {
        custom: true,
        title: folder.title,
        description: folder.description,
        image: folder.image,
        createdAt: folder.createdAt
    };

    try {
        unmarkFolderDeleted(id);
    } catch {
    }

    try {
        saveFolders();
        saveCustomFolders();
    } catch {
        delete folders[id];
        delete customFolders[id];

        showCreateFolderError(
            "The folder could not be saved in this browser. Try a smaller image."
        );

        return;
    }

    const container =
        $(".cardcontainer");

    if (container) {
        const card =
            createFolderCard({
                id,
                ...folder
            });

        container.prepend(card);
        bindFolderCard(card);
        updateFolderCardCounts();

        card.classList.add(
            "custom-folder-created"
        );

        window.setTimeout(
            () =>
                card.classList.remove(
                    "custom-folder-created"
                ),
            1100
        );
    }

    closeCreateFolderModal();
}

function setupFolderFeature() {
    migrateFolderPersistence();

    $$(".card[data-folder-id]").forEach(card => {
        if (isFolderDeleted(card.dataset.folderId)) {
            card.remove();
        }
    });

    renderCustomFolders();

    $$(".card").forEach(
        card =>
            bindFolderCard(card)
    );

    updateFolderCardCounts();
}

function setupCreateFolderFeature() {
    const button =
        $(".create-folder-button");

    if (!button) {
        return;
    }

    button.addEventListener(
        "click",
        () => openCreateFolderModal()
    );
}


function setupVolumeControl() {
    if ($(".volume-control")) {
        return;
    }

    currentSong.volume =
        Number(
            localStorage.getItem(
                "playerVolume"
            ) ?? 1
        );

    currentSong.muted =
        localStorage.getItem(
            "playerMuted"
        ) === "true";

    const volumeControl =
        document.createElement(
            "div"
        );

    const volumeButton =
        document.createElement(
            "button"
        );

    const volumeIcon =
        document.createElement(
            "span"
        );

    const volumePanel =
        document.createElement(
            "div"
        );

    const volumeTop =
        document.createElement(
            "div"
        );

    const volumeTitle =
        document.createElement(
            "span"
        );

    const volumeValue =
        document.createElement(
            "span"
        );

    const volumeSliderWrap =
        document.createElement(
            "div"
        );

    const volumeSlider =
        document.createElement(
            "input"
        );

    const volumeMute =
        document.createElement(
            "button"
        );

    volumeControl.className =
        "volume-control";

    volumeButton.className =
        "volume-button";

    volumeButton.type =
        "button";

    volumeIcon.className =
        "volume-icon";

    volumePanel.className =
        "volume-panel";

    volumeTop.className =
        "volume-top";

    volumeValue.className =
        "volume-value";

    volumeSliderWrap.className =
        "volume-slider-wrap";

    volumeSlider.className =
        "volume-slider";

    volumeSlider.type =
        "range";

    volumeSlider.min =
        "0";

    volumeSlider.max =
        "100";

    volumeSlider.step =
        "1";

    volumeSlider.setAttribute(
        "aria-label",
        "Volume level"
    );

    volumeMute.className =
        "volume-mute";

    volumeMute.type =
        "button";

    volumeTitle.textContent =
        "Volume";

    volumeTop.append(
        volumeTitle,
        volumeValue
    );

    volumeSliderWrap.appendChild(
        volumeSlider
    );

    volumePanel.append(
        volumeTop,
        volumeSliderWrap,
        volumeMute
    );

    volumeButton.appendChild(
        volumeIcon
    );

    volumeControl.append(
        volumeButton,
        volumePanel
    );

    songTime.insertAdjacentElement(
        "afterend",
        volumeControl
    );

    let lastVolume =
        currentSong.volume > 0
            ? currentSong.volume
            : 1;

    function getVolumeIcon() {
        if (
            currentSong.muted ||
            currentSong.volume === 0
        ) {
            return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z"></path><path d="m17 9 4 6"></path><path d="m21 9-4 6"></path></svg>`;
        }

        if (
            currentSong.volume <
            0.5
        ) {
            return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z"></path><path d="M16 9.5c1.5 1.4 1.5 3.6 0 5"></path></svg>`;
        }

        return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z"></path><path d="M16 8c2.7 2.2 2.7 5.8 0 8"></path><path d="M19 5.5c4.2 3.7 4.2 9.3 0 13"></path></svg>`;
    }

    function updateVolumeUI() {
        const percentage =
            Math.round(
                currentSong.volume *
                    100
            );

        const muted =
            currentSong.muted ||
            percentage === 0;

        volumeSlider.value =
            String(percentage);

        volumeValue.textContent =
            `${percentage}%`;

        volumeIcon.innerHTML =
            getVolumeIcon();

        volumeButton.classList.toggle(
            "muted",
            muted
        );

        volumeMute.classList.toggle(
            "muted",
            muted
        );

        volumeMute.textContent =
            muted
                ? "Unmute"
                : "Mute";

        volumeButton.setAttribute(
            "aria-label",
            muted
                ? "Unmute"
                : "Volume"
        );

        volumeSlider.style.setProperty(
            "--volume-progress",
            `${percentage}%`
        );
    }

    function saveVolume() {
        localStorage.setItem(
            "playerVolume",
            String(
                currentSong.volume
            )
        );

        localStorage.setItem(
            "playerMuted",
            String(
                currentSong.muted
            )
        );
    }

    function setVolume(value) {
        const newVolume =
            Math.max(
                0,
                Math.min(
                    1,
                    Number(value)
                )
            );

        currentSong.volume =
            newVolume;

        if (newVolume > 0) {
            lastVolume =
                newVolume;

            currentSong.muted =
                false;
        } else {
            currentSong.muted =
                true;
        }

        updateVolumeUI();
        saveVolume();
    }

    volumeButton.addEventListener(
        "click",
        event => {
            event.stopPropagation();

            const open =
                volumeControl.classList.toggle(
                    "open"
                );

            volumeButton.setAttribute(
                "aria-expanded",
                String(open)
            );

            if (open) {
                volumeSlider.focus();
            }
        }
    );

    volumePanel.addEventListener(
        "click",
        event =>
            event.stopPropagation()
    );

    volumeSlider.addEventListener(
        "input",
        () =>
            setVolume(
                Number(
                    volumeSlider.value
                ) / 100
            )
    );

    volumeMute.addEventListener(
        "click",
        () => {
            if (
                currentSong.muted ||
                currentSong.volume === 0
            ) {
                currentSong.volume =
                    lastVolume > 0
                        ? lastVolume
                        : 1;

                currentSong.muted =
                    false;
            } else {
                lastVolume =
                    currentSong.volume;

                currentSong.muted =
                    true;
            }

            updateVolumeUI();
            saveVolume();
        }
    );

    document.addEventListener(
        "click",
        event => {
            if (
                !volumeControl.contains(
                    event.target
                )
            ) {
                volumeControl.classList.remove(
                    "open"
                );

                volumeButton.setAttribute(
                    "aria-expanded",
                    "false"
                );
            }
        }
    );

    document.addEventListener(
        "keydown",
        event => {
            const typing =
                [
                    "INPUT",
                    "TEXTAREA",
                    "SELECT"
                ].includes(
                    event.target?.tagName
                ) ||
                event.target?.isContentEditable;

            if (
                event.key ===
                "Escape"
            ) {
                volumeControl.classList.remove(
                    "open"
                );

                volumeButton.setAttribute(
                    "aria-expanded",
                    "false"
                );
            }

            if (
                event.target ===
                volumeSlider
            ) {
                if (
                    event.key ===
                        "ArrowUp" ||
                    event.key ===
                        "ArrowRight"
                ) {
                    event.preventDefault();

                    setVolume(
                        currentSong.volume +
                            0.05
                    );
                }

                if (
                    event.key ===
                        "ArrowDown" ||
                    event.key ===
                        "ArrowLeft"
                ) {
                    event.preventDefault();

                    setVolume(
                        currentSong.volume -
                            0.05
                    );
                }
            }

            if (
                !typing &&
                event.target !==
                    volumeSlider &&
                (
                    event.key ===
                        "m" ||
                    event.key ===
                        "M"
                )
            ) {
                if (
                    currentSong.muted ||
                    currentSong.volume ===
                        0
                ) {
                    currentSong.volume =
                        lastVolume > 0
                            ? lastVolume
                            : 1;

                    currentSong.muted =
                        false;
                } else {
                    lastVolume =
                        currentSong.volume;

                    currentSong.muted =
                        true;
                }

                updateVolumeUI();
                saveVolume();
            }
        }
    );

    volumeControl.addEventListener(
        "wheel",
        event => {
            event.preventDefault();

            setVolume(
                currentSong.volume +
                    (
                        event.deltaY < 0
                            ? 0.05
                            : -0.05
                    )
            );
        },
        {
            passive: false
        }
    );

    currentSong.addEventListener(
        "volumechange",
        updateVolumeUI
    );

    updateVolumeUI();
}

async function main() {
    setupCursor();
    setupClickEffects();
    setupSongControls();
    setupSeekbar();
    setupAudio();
    setupKeyboard();
    setupNavigation();
    setupVolumeControl();
    setupCreateFolderFeature();
    setupFolderFeature();

    updateProgress(0);
    updateSongTime();
    updatePlayerVisuals();

    try {
        allSongs =
            await getsongs();

        renderSongs(
            allSongs
        );

        updateFolderCardCounts();

        const lastPlayedSong =
            localStorage.getItem(
                "lastPlayedSong"
            );

        if (
            lastPlayedSong &&
            allSongs.includes(
                lastPlayedSong
            )
        ) {
            currentIndex =
                allSongs.indexOf(
                    lastPlayedSong
                );

            playMusic(
                lastPlayedSong,
                getSongName(
                    lastPlayedSong
                ),
                false,
                "library"
            );
        }
    } catch (error) {
        console.error(
            error
        );

        songList.innerHTML =
            "";

        showNoResults(
            "Music library unavailable",
            "Make sure your local song server is running."
        );

        if (libraryCount) {
            libraryCount.textContent =
                "Offline";
        }

        setPlayerStatus(
            "Library unavailable"
        );
    }
}

main().catch(
    console.error
);


/* ============================================================================
 * NEBULA FIELD — living particle + nebula background, confined to `.right`
 * ----------------------------------------------------------------------------
 * Self-contained module. It builds its own layer, its own stylesheet, its own
 * input handling and its own animation loop. It does not read, wrap, rename or
 * modify anything above this comment.
 *
 * Motion model (deliberately not a stock particle configuration):
 *
 *   ambient   divergence-free curl noise (2 octaves) baked into a coarse grid,
 *             one grid per depth layer -> fluid, eddying turbulence instead of
 *             per-particle straight-line velocities
 *   clusters  a second scalar potential is added as a *gradient* with a slowly
 *             oscillating sign, so the field breathes between convergent and
 *             divergent -> clusters gather, hold, then dissolve on their own
 *   drag      velocity relaxes toward the local medium velocity (Stokes-like),
 *             so any disturbed particle always eases back to its natural drift
 *   pointer   composite field: distance-ramped attraction + core repulsion +
 *             tangential vortex + wake advection from pointer velocity, so
 *             particles stream and swirl around the cursor instead of
 *             collapsing into it
 *
 * Exposes window.NebulaField = { pause, resume, destroy, stats }
 * ========================================================================== */
(function () {
    "use strict";

    if (typeof window === "undefined" || typeof document === "undefined") {
        return;
    }

    /* ------------------------------------------------------------------ *
     * constants
     * ------------------------------------------------------------------ */

    const HOST_SELECTOR = ".right";
    const HOST_CLASS = "nebula-host";
    const STYLE_ID = "nebula-field-styles";

    const TAU = Math.PI * 2;

    const PAD = 78;              // off-canvas margin where particles wrap
    const FADE_BAND = 104;       // fade ramp width (mostly outside the canvas)
    const SPRITE_SIZE = 28;      // glow sprite resolution
    const CLOUD_DIVISOR = 7;     // nebula canvas renders at 1/7 scale
    const FIELD_REBUILD = 5;     // frames between flow-field rebuilds
    const CLOUD_REBUILD = 3;     // frames between nebula redraws
    const RECT_REFRESH = 12;     // frames between host rect reads

    const POINTER_RADIUS_MIN = 130;
    const POINTER_RADIUS_MAX = 330;
    const POINTER_CORE = 27;     // repulsion core radius, keeps the eye open

    const F_ATTRACT = 540;       // px/s^2
    const F_REPEL = 880;         // px/s^2 at the core
    const F_SWIRL = 690;         // px/s^2 tangential
    const F_WAKE = 0.52;         // fraction of pointer velocity handed over

    /* ------------------------------------------------------------------ *
     * palette — grouped so hue drift stays inside one colour family
     * ------------------------------------------------------------------ */

    const RAMP = [
        "#1f8f52", "#25a85f", "#2bc06a", "#33d074", "#3ee07f",
        "#4cf08d", "#63ffa0", "#8effc0", "#b6ffd8",
        "#1fbf9a", "#22cfae", "#2ee0c4", "#3ad8e8",
        "#46dcff", "#5cc8ff", "#6fb0ff", "#8aa0ff",
        "#a583ff",
        "#fff2dc", "#ffe4bf"
    ];

    const GROUPS = [
        { start: 0, end: 8, weight: 0.57 },    // emerald -> neon -> mint
        { start: 9, end: 12, weight: 0.18 },   // teal -> turquoise
        { start: 13, end: 16, weight: 0.15 },  // cyan -> soft blue
        { start: 17, end: 17, weight: 0.04 },  // faint violet
        { start: 18, end: 19, weight: 0.06 }   // warm white
    ];

    const SOFTNESS = [
        { core: 0.12, mid: 0.28, reach: 1.05, gain: 0.78 },
        { core: 0.08, mid: 0.24, reach: 1.28, gain: 0.62 },
        { core: 0.04, mid: 0.20, reach: 1.55, gain: 0.48 }
    ];

    /* ------------------------------------------------------------------ *
     * depth layers
     * ------------------------------------------------------------------ */

    const LAYER_SPEC = [
        {
            share: 0.56, softness: 2, cell: 94,
            sizeMin: 0.12, sizeMax: 0.30,
            alphaMin: 0.13, alphaMax: 0.25,
            flowScale: 0.0016, flowSpeed: 0.55, flowAmp: 10,
            relax: 0.075, agility: 0.34, maxSpeed: 70
        },
        {
            share: 0.32, softness: 1, cell: 72,
            sizeMin: 0.22, sizeMax: 0.44,
            alphaMin: 0.14, alphaMax: 0.29,
            flowScale: 0.0026, flowSpeed: 0.85, flowAmp: 18,
            relax: 0.035, agility: 0.78, maxSpeed: 220
        },
        {
            share: 0.12, softness: 0, cell: 58,
            sizeMin: 0.32, sizeMax: 0.62,
            alphaMin: 0.16, alphaMax: 0.34,
            flowScale: 0.0038, flowSpeed: 1.15, flowAmp: 30,
            relax: 0.020, agility: 1.30, maxSpeed: 280
        }
    ];

    const CSS_TEXT = [
        "." + HOST_CLASS + " {",
        "    position: relative;",
        "    isolation: isolate;",
        "}",
        "",
        ".nebula-layer {",
        "    position: absolute;",
        "    inset: 0;",
        "    z-index: 0;",
        "    overflow: hidden;",
        "    pointer-events: none;",
        "    border-radius: inherit;",
        "    background: transparent;",
        "}",
        "",
        "." + HOST_CLASS + " > :not(.nebula-layer) {",
        "    position: relative;",
        "    z-index: 1;",
        "}",
        "",
        ".nebula-layer canvas {",
        "    position: absolute;",
        "    inset: 0;",
        "    display: block;",
        "    width: 100%;",
        "    height: 100%;",
        "    pointer-events: none;",
        "}",
        "",
        ".nebula-layer .nebula-clouds {",
        "    image-rendering: auto;",
        "}",
        "",
        "@media (prefers-reduced-motion: reduce) {",
        "    .nebula-layer {",
        "        opacity: 0.6;",
        "    }",
        "}"
    ].join("\n");

    /* ------------------------------------------------------------------ *
     * small utilities
     * ------------------------------------------------------------------ */

    function clamp(value, low, high) {
        return value < low ? low : value > high ? high : value;
    }

    function rand(low, high) {
        return low + Math.random() * (high - low);
    }

    function hash2(ix, iy, seed) {
        let h = Math.imul(ix, 374761393) ^
                Math.imul(iy, 668265263) ^
                Math.imul(seed, 1442695041);

        h = Math.imul(h ^ (h >>> 13), 1274126177);

        return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    }

    function noise2(x, y, seed) {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const fx = x - x0;
        const fy = y - y0;

        const ux = fx * fx * (3 - 2 * fx);
        const uy = fy * fy * (3 - 2 * fy);

        const a = hash2(x0, y0, seed);
        const b = hash2(x0 + 1, y0, seed);
        const c = hash2(x0, y0 + 1, seed);
        const d = hash2(x0 + 1, y0 + 1, seed);

        const top = a + (b - a) * ux;
        const bottom = c + (d - c) * ux;

        return top + (bottom - top) * uy;
    }

    // two-octave scalar potential
    function potential(x, y, s1, ox1, oy1, s2, ox2, oy2, seed) {
        return noise2(x * s1 + ox1, y * s1 + oy1, seed) +
               noise2(x * s2 + ox2, y * s2 + oy2, seed + 7) * 0.45;
    }

    function pickGroup() {
        let roll = Math.random();

        for (let i = 0; i < GROUPS.length; i++) {
            roll -= GROUPS[i].weight;

            if (roll <= 0) {
                return GROUPS[i];
            }
        }

        return GROUPS[0];
    }

    /* ------------------------------------------------------------------ *
     * module state
     * ------------------------------------------------------------------ */

    const state = {
        host: null,
        layerEl: null,
        styleEl: null,
        dotCanvas: null,
        dotCtx: null,
        cloudCanvas: null,
        cloudCtx: null,

        width: 0,
        height: 0,
        renderScale: 1,

        sprites: null,

        particles: [],
        targetCount: 0,
        layers: [],
        clouds: [],

        time: 0,
        frame: 0,
        lastStamp: 0,
        raf: 0,
        running: false,
        visible: true,
        onScreen: true,
        destroyed: false,

        rectDirty: true,
        rect: { left: 0, top: 0 },

        pointer: {
            clientX: 0,
            clientY: 0,
            x: 0,
            y: 0,
            smoothX: 0,
            smoothY: 0,
            vx: 0,
            vy: 0,
            inside: false,
            touching: false,
            strength: 0,
            radius: POINTER_RADIUS_MIN,
            primed: false
        },

        audio: {
            context: null,
            source: null,
            analyser: null,
            frequencyData: null,
            timeData: null,
            ready: false,
            failed: false,
            bass: 0,
            mid: 0,
            high: 0,
            overall: 0,
            previousBass: 0,
            previousMid: 0,
            previousHigh: 0,
            pulseBeat: 0,
            spatialPulse: 0,
            bassRise: 0,
            midRise: 0,
            highRise: 0,
            pulse: 0,
            waveDistance: Infinity,
            pulseCooldown: 0,
            lastSource: ""
        },

        reduced: false,
        coarse: false,
        motion: 1,
        flashTimer: 1.2,

        frameEma: 16,
        slowFrames: 0,
        fastFrames: 0,
        degrade: 0,

        observers: [],
        listeners: [],
        media: []
    };

    /* ------------------------------------------------------------------ *
     * music-reactive audio analysis
     * ------------------------------------------------------------------ */

    function resetAudioMetrics() {
        const audio = state.audio;

        audio.bass = 0;
        audio.mid = 0;
        audio.high = 0;
        audio.overall = 0;
        audio.previousBass = 0;
        audio.previousMid = 0;
        audio.previousHigh = 0;
        audio.bassRise = 0;
        audio.midRise = 0;
        audio.highRise = 0;
        audio.pulse = 0;
        audio.waveDistance = Infinity;
        audio.pulseCooldown = 0;
        audio.pulseBeat = 0;
        audio.spatialPulse = 0;
    }

    function ensureAudioAnalyser() {
        const audio = state.audio;

        if (audio.failed) {
            return false;
        }

        if (audio.analyser && audio.frequencyData) {
            if (audio.context && audio.context.state === "suspended") {
                audio.context.resume().catch(function () {});
            }

            return true;
        }

        const AudioContextClass =
            window.AudioContext || window.webkitAudioContext;

        if (!AudioContextClass) {
            audio.failed = true;
            return false;
        }

        try {
            const context = new AudioContextClass();
            const source = context.createMediaElementSource(currentSong);
            const analyser = context.createAnalyser();

            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.76;
            analyser.minDecibels = -100;
            analyser.maxDecibels = -8;

            source.connect(analyser);
            analyser.connect(context.destination);

            audio.context = context;
            audio.source = source;
            audio.analyser = analyser;
            audio.frequencyData = new Uint8Array(analyser.frequencyBinCount);
            audio.timeData = new Uint8Array(analyser.fftSize);
            audio.ready = true;
            audio.failed = false;

            if (context.state === "suspended") {
                context.resume().catch(function () {});
            }

            return true;
        } catch (error) {
            audio.failed = true;
            audio.ready = false;
            audio.analyser = null;
            audio.frequencyData = null;
            audio.timeData = null;
            return false;
        }
    }

    function averageFrequency(minHz, maxHz) {
        const audio = state.audio;
        const analyser = audio.analyser;
        const data = audio.frequencyData;

        if (!analyser || !data) {
            return 0;
        }

        const sampleRate = analyser.context.sampleRate;
        const nyquist = sampleRate / 2;
        const binCount = data.length;

        let start = Math.floor(minHz / nyquist * binCount);
        let end = Math.ceil(maxHz / nyquist * binCount);

        start = clamp(start, 0, binCount - 1);
        end = clamp(end, start + 1, binCount);

        let sum = 0;
        let peak = 0;

        for (let i = start; i < end; i++) {
            const value = data[i] / 255;
            sum += value;
            if (value > peak) {
                peak = value;
            }
        }

        const average = sum / (end - start);
        return clamp(average * 0.72 + peak * 0.28, 0, 1);
    }

    function getAudioRms() {
        const audio = state.audio;

        if (!audio.analyser || !audio.timeData) {
            return 0;
        }

        audio.analyser.getByteTimeDomainData(audio.timeData);

        let sum = 0;

        for (let i = 0; i < audio.timeData.length; i++) {
            const value = (audio.timeData[i] - 128) / 128;
            sum += value * value;
        }

        return clamp(Math.sqrt(sum / audio.timeData.length) * 2.35, 0, 1);
    }

    function smoothAudioValue(current, target, dt, attackRate, releaseRate) {
        const rate = target > current ? attackRate : releaseRate;
        const blend = 1 - Math.exp(-rate * dt);
        return current + (target - current) * blend;
    }

    function updateAudioAnalysis(dt) {
        const audio = state.audio;

        audio.bassRise = 0;
        audio.midRise = 0;
        audio.highRise = 0;
        audio.bass = smoothAudioValue(audio.bass, 0, dt, 3.5, 3.5);
        audio.mid = smoothAudioValue(audio.mid, 0, dt, 3.5, 3.5);
        audio.high = smoothAudioValue(audio.high, 0, dt, 3.5, 3.5);
        audio.overall = smoothAudioValue(audio.overall, 0, dt, 3.5, 3.5);
        audio.pulse = 0;
        audio.pulseBeat = 0;
        audio.spatialPulse = 0;
        audio.waveDistance = Infinity;
    }

    function bindAudioReactive() {}

    /* ------------------------------------------------------------------ *
     * sprite atlas — one pre-rendered glow per colour x softness
     * ------------------------------------------------------------------ */

    function hexToRgb(hex) {
        const n = parseInt(hex.slice(1), 16);

        return [
            (n >> 16) & 255,
            (n >> 8) & 255,
            n & 255
        ];
    }

    function buildSprites() {
        const sprites = [];

        for (let ci = 0; ci < RAMP.length; ci++) {
            const rgb = hexToRgb(RAMP[ci]);
            const head = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",";

            for (let si = 0; si < SOFTNESS.length; si++) {
                const shape = SOFTNESS[si];
                const canvas = document.createElement("canvas");

                canvas.width = SPRITE_SIZE;
                canvas.height = SPRITE_SIZE;

                const ctx = canvas.getContext("2d");
                const half = SPRITE_SIZE / 2;

                const gradient = ctx.createRadialGradient(
                    half, half, 0,
                    half, half, half
                );

                gradient.addColorStop(0, head + (1 * shape.gain) + ")");
                gradient.addColorStop(shape.core, head + (0.78 * shape.gain) + ")");
                gradient.addColorStop(shape.mid, head + (0.20 * shape.gain) + ")");
                gradient.addColorStop(0.72, head + (0.05 * shape.gain) + ")");
                gradient.addColorStop(1, head + "0)");

                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

                sprites.push(canvas);
            }
        }

        return sprites;
    }

    function spriteIndex(colourIndex, softness) {
        return colourIndex * SOFTNESS.length + softness;
    }

    /* ------------------------------------------------------------------ *
     * sizing
     * ------------------------------------------------------------------ */

    function pixelBudget() {
        return state.coarse ? 1100000 : 2600000;
    }

    function desiredCount(width, height) {
        const area = width * Math.min(height, 3000);

        let count;

        if (!state.coarse && width >= 1400) {
            count = Math.min(area / 180, 12000);
        } else if (width >= 900) {
            count = Math.min(area / 240, 8500);
        } else {
            count = Math.min(area / 120, 4200);
        }

        const cores = navigator.hardwareConcurrency || 8;

        if (cores <= 4) {
            count *= 0.88;
        }

        if (state.reduced) {
            count *= 0.30;
        }

        count *= Math.pow(0.90, state.degrade);

        return Math.max(220, Math.round(count));
    }

    function measure() {
        const host = state.host;
        const width = Math.max(1, Math.round(host.clientWidth));
        const height = Math.max(1, Math.round(host.clientHeight));

        state.width = width;
        state.height = height;

        const dpr = clamp(window.devicePixelRatio || 1, 1, 1.5);
        const budgetScale = Math.sqrt(pixelBudget() / (width * height));

        state.renderScale = clamp(Math.min(dpr, budgetScale), 0.6, 1.5);

        const dots = state.dotCanvas;

        dots.width = Math.max(1, Math.round(width * state.renderScale));
        dots.height = Math.max(1, Math.round(height * state.renderScale));

        state.dotCtx.setTransform(
            state.renderScale, 0, 0, state.renderScale, 0, 0
        );

        state.dotCtx.globalCompositeOperation = "lighter";

        const clouds = state.cloudCanvas;

        clouds.width = Math.max(24, Math.round(width / CLOUD_DIVISOR));
        clouds.height = Math.max(24, Math.round(height / CLOUD_DIVISOR));

        state.pointer.radius = clamp(
            Math.min(width, height) * 0.30,
            POINTER_RADIUS_MIN,
            POINTER_RADIUS_MAX
        );

        buildLayers();

        state.targetCount = desiredCount(width, height);

        syncParticles();

        state.rectDirty = true;
    }

    /* ------------------------------------------------------------------ *
     * flow field: one grid per depth layer
     * ------------------------------------------------------------------ */

    function buildLayers() {
        const spanW = state.width + PAD * 2;
        const spanH = state.height + PAD * 2;

        state.layers = LAYER_SPEC.map(function (spec, index) {
            const cols = clamp(Math.ceil(spanW / spec.cell), 3, 34);
            const rows = clamp(Math.ceil(spanH / spec.cell), 3, 34);

            return {
                spec: spec,
                cols: cols,
                rows: rows,
                cellW: spanW / cols,
                cellH: spanH / rows,
                invCellW: cols / spanW,
                invCellH: rows / spanH,
                data: new Float32Array((cols + 1) * (rows + 1) * 2),
                seed: 1013 + index * 977,
                seed2: 5701 + index * 613,
                clusterPhase: index * 2.1,
                eps: spec.cell * 0.55,
                relaxK: spec.relax
            };
        });
    }

    function rebuildFields(time) {
        const motion = state.motion;

        for (let li = 0; li < state.layers.length; li++) {
            const layer = state.layers[li];
            const spec = layer.spec;

            const tt = time * spec.flowSpeed * motion;

            const s1 = spec.flowScale;
            const s2 = s1 * 2.7;

            const o1x = Math.sin(tt * 0.061) * 2.3 + tt * 0.030;
            const o1y = Math.cos(tt * 0.048) * 2.1 - tt * 0.022;
            const o2x = Math.cos(tt * 0.095) * 3.4 - tt * 0.052;
            const o2y = Math.sin(tt * 0.083) * 3.0 + tt * 0.041;

            const g1x = Math.sin(tt * 0.037) * 1.7 - tt * 0.019;
            const g1y = Math.cos(tt * 0.043) * 1.9 + tt * 0.025;

            const amp = spec.flowAmp * motion;
            const norm = amp / (s1 * 1.6);
            const limit = amp * 2.3;

            // breathing compressible term: sinks gather clusters, sources
            // release them again
            const cluster = 0.55 * Math.sin(
                time * 0.055 * motion + layer.clusterPhase
            );

            const eps = layer.eps;
            const inv2eps = 1 / (2 * eps);

            const cols = layer.cols;
            const rows = layer.rows;
            const data = layer.data;

            let write = 0;

            for (let gy = 0; gy <= rows; gy++) {
                const wy = -PAD + gy * layer.cellH;

                for (let gx = 0; gx <= cols; gx++) {
                    const wx = -PAD + gx * layer.cellW;

                    const pxp = potential(wx + eps, wy, s1, o1x, o1y, s2, o2x, o2y, layer.seed);
                    const pxm = potential(wx - eps, wy, s1, o1x, o1y, s2, o2x, o2y, layer.seed);
                    const pyp = potential(wx, wy + eps, s1, o1x, o1y, s2, o2x, o2y, layer.seed);
                    const pym = potential(wx, wy - eps, s1, o1x, o1y, s2, o2x, o2y, layer.seed);

                    const dpdx = (pxp - pxm) * inv2eps;
                    const dpdy = (pyp - pym) * inv2eps;

                    // curl of the stream function -> divergence free drift
                    let vx = dpdy;
                    let vy = -dpdx;

                    if (cluster !== 0) {
                        const qxp = noise2((wx + eps) * s1 + g1x, wy * s1 + g1y, layer.seed2);
                        const qxm = noise2((wx - eps) * s1 + g1x, wy * s1 + g1y, layer.seed2);
                        const qyp = noise2(wx * s1 + g1x, (wy + eps) * s1 + g1y, layer.seed2);
                        const qym = noise2(wx * s1 + g1x, (wy - eps) * s1 + g1y, layer.seed2);

                        vx += cluster * (qxp - qxm) * inv2eps;
                        vy += cluster * (qyp - qym) * inv2eps;
                    }

                    vx *= norm;
                    vy *= norm;

                    const speed = Math.sqrt(vx * vx + vy * vy);

                    if (speed > limit) {
                        const scale = limit / speed;
                        vx *= scale;
                        vy *= scale;
                    }

                    data[write++] = vx;
                    data[write++] = vy;
                }
            }
        }
    }

    /* ------------------------------------------------------------------ *
     * particles
     * ------------------------------------------------------------------ */

    function pickLayerIndex() {
        let roll = Math.random();

        for (let i = 0; i < LAYER_SPEC.length; i++) {
            roll -= LAYER_SPEC[i].share;

            if (roll <= 0) {
                return i;
            }
        }

        return 0;
    }

    function makeParticle(layerIndex) {
        const spec = LAYER_SPEC[layerIndex];
        const group = pickGroup();

        const span = group.end - group.start;
        const base = group.start + Math.random() * span;

        const particle = {
            layer: layerIndex,
            x: rand(-PAD, state.width + PAD),
            y: rand(-PAD, state.height + PAD),
            vx: 0,
            vy: 0,

            size: rand(spec.sizeMin, spec.sizeMax),
            alpha: rand(spec.alphaMin, spec.alphaMax),
            reach: SOFTNESS[spec.softness].reach,

            colourBase: base,
            colourLow: group.start,
            colourHigh: group.end,
            colourSpan: Math.min(2.2, span * 0.55),
            softness: spec.softness,
            sprite: 0,

            agility: spec.agility * rand(0.55, 1.35),
            spin: Math.random() < 0.72 ? 1 : -1,

            pulse: Math.random() * TAU,
            pulseRate: rand(0.12, 0.46),
            pulseDepth: rand(0.12, 0.42),

            orbiter: Math.random() < 0.18,
            wob: Math.random() * TAU,
            wobRate: rand(0.18, 0.72),
            wobAmpX: rand(-2.6, 2.6),
            wobAmpY: rand(-2.6, 2.6),
            audioPhase: Math.random() * TAU,
            audioOrbit: Math.random() * TAU,
            audioDrift: rand(0.55, 1.8),
            audioSeed: Math.random() * 1000,
            depthPulse: rand(0.65, 1.35),
            twinklePhase: Math.random() * TAU,
            twinkleSpeed: rand(0.55, 1.75),
            twinkleDepth: rand(0.55, 1.0),
            twinkleSharpness: rand(1.6, 3.4),

            flash: 0
        };

        particle.sprite = spriteIndex(
            Math.round(particle.colourBase),
            spec.softness
        );

        return particle;
    }

    function syncParticles() {
        const particles = state.particles;
        const target = state.targetCount;

        while (particles.length > target) {
            particles.pop();
        }

        while (particles.length < target) {
            particles.push(makeParticle(pickLayerIndex()));
        }

        // keep everything inside the (possibly resized) domain
        for (let i = 0; i < particles.length; i++) {
            const particle = particles[i];

            if (particle.x < -PAD || particle.x > state.width + PAD) {
                particle.x = rand(-PAD, state.width + PAD);
            }

            if (particle.y < -PAD || particle.y > state.height + PAD) {
                particle.y = rand(-PAD, state.height + PAD);
            }
        }
    }

    /* ------------------------------------------------------------------ *
     * nebula clouds
     * ------------------------------------------------------------------ */

    function buildClouds() {
        const tints = [
            ["rgba(28,150,88,0.16)", "rgba(24,120,74,0.07)"],
            ["rgba(34,196,132,0.13)", "rgba(26,140,96,0.06)"],
            ["rgba(28,180,168,0.12)", "rgba(20,120,120,0.05)"],
            ["rgba(40,160,210,0.10)", "rgba(28,104,150,0.045)"],
            ["rgba(96,126,220,0.07)", "rgba(58,74,150,0.03)"],
            ["rgba(140,110,220,0.055)", "rgba(88,70,150,0.025)"],
            ["rgba(180,255,214,0.05)", "rgba(120,200,164,0.022)"]
        ];

        const count = state.coarse ? 7 : 11;
        const clouds = [];

        for (let i = 0; i < count; i++) {
            const tint = tints[i % tints.length];
            const band = i % 3 === 2;


            clouds.push({
                c0: tint[0],
                c1: tint[1],
                band: band,
                speed: rand(0.5, 1.25),
                fx: rand(0.06, 0.17),
                fy: rand(0.05, 0.15),
                px: Math.random() * TAU,
                py: Math.random() * TAU,
                pr: Math.random() * TAU,
                ax: rand(0.14, 0.38),
                ay: rand(0.12, 0.34),
                r: rand(0.42, 0.86),
                rv: rand(0.04, 0.13),
                rot: Math.random() * TAU,
                spin: rand(-0.05, 0.05),
                squash: band ? rand(0.16, 0.30) : rand(0.55, 0.95)
            });
        }

        state.clouds = clouds;
    }

    function drawClouds(time) {
        const ctx = state.cloudCtx;
        const width = state.cloudCanvas.width;
        const height = state.cloudCanvas.height;
        const reference = Math.min(width, height);

        ctx.clearRect(0, 0, width, height);
        ctx.globalCompositeOperation = "lighter";

        const clouds = state.clouds;
        const breath = 1 + Math.sin(time * 0.95) * 0.035;

        for (let i = 0; i < clouds.length; i++) {
            const cloud = clouds[i];
            const tt = time * cloud.speed * state.motion;
            const drift = Math.sin(tt * 0.42 + cloud.pr) * 0.025;
            const cx = (0.5 + Math.sin(tt * cloud.fx + cloud.px) * cloud.ax + drift) * width;
            const cy = (0.5 + Math.cos(tt * cloud.fy + cloud.py) * cloud.ay) * height;
            const radius = Math.max(4, (cloud.r + Math.sin(tt * 0.34 + cloud.pr) * cloud.rv) * reference * breath);

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(cloud.rot + tt * cloud.spin);

            const layers = cloud.band ? 4 : 3;

            for (let j = 0; j < layers; j++) {
                const offset = j - (layers - 1) * 0.5;
                const localRadius = radius * (0.48 + j * 0.22);
                const localX = offset * radius * 0.16;
                const localY = Math.sin(tt * 0.7 + j + cloud.py) * radius * 0.055;
                const squash = cloud.squash * (j === layers - 1 ? 0.82 : 1);
                const gradient = ctx.createRadialGradient(localX, localY, 0, localX, localY, localRadius);

                gradient.addColorStop(0, cloud.c0);
                gradient.addColorStop(0.34, cloud.c1);
                gradient.addColorStop(0.68, "rgba(80,190,180,0.021)");
                gradient.addColorStop(1, "rgba(0,0,0,0)");

                ctx.save();
                ctx.scale(1, squash);
                ctx.fillStyle = gradient;
                ctx.globalAlpha = clamp(0.96 / layers, 0, 0.56);
                ctx.beginPath();
                ctx.arc(localX, localY, localRadius, 0, TAU);
                ctx.fill();
                ctx.restore();
            }

            ctx.restore();
        }

        const coreX = (0.50 + Math.sin(time * 0.31) * 0.12) * width;
        const coreY = (0.52 + Math.cos(time * 0.27) * 0.10) * height;
        const coreRadius = reference * 0.16;
        const coreGradient = ctx.createRadialGradient(coreX, coreY, 0, coreX, coreY, coreRadius);

        coreGradient.addColorStop(0, "rgba(84,255,178,0.045)");
        coreGradient.addColorStop(0.36, "rgba(40,180,210,0.025)");
        coreGradient.addColorStop(0.72, "rgba(96,100,220,0.012)");
        coreGradient.addColorStop(1, "rgba(0,0,0,0)");

        ctx.globalAlpha = 1;
        ctx.fillStyle = coreGradient;
        ctx.beginPath();
        ctx.arc(coreX, coreY, coreRadius, 0, TAU);
        ctx.fill();

        ctx.lineCap = "round";
        for (let i = 0; i < 6; i++) {
            const angle = time * (0.13 + i * 0.025) + i * 1.37;
            const orbit = reference * (0.18 + i * 0.07);
            const sx = width * 0.5 + Math.cos(angle) * orbit;
            const sy = height * 0.5 + Math.sin(angle * 0.83) * orbit * 0.58;
            const sweep = reference * 0.42;
            const cpx = sx + Math.cos(angle + 1.25) * sweep;
            const cpy = sy + Math.sin(angle + 1.25) * sweep * 0.42;
            const ex = sx + Math.cos(angle + 2.45) * sweep * 0.86;
            const ey = sy + Math.sin(angle + 2.45) * sweep * 0.48;
            const grad = ctx.createLinearGradient(sx, sy, ex, ey);

            grad.addColorStop(0, "rgba(64,230,175,0.022)");
            grad.addColorStop(0.5, "rgba(55,195,225,0.014)");
            grad.addColorStop(1, "rgba(0,0,0,0)");

            ctx.strokeStyle = grad;
            ctx.globalAlpha = 0.54;
            ctx.lineWidth = Math.max(1.1, reference * 0.0065);
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.quadraticCurveTo(cpx, cpy, ex, ey);
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
    }

    function musicHighBoost(value) {
        return clamp(value, 0, 1);
    }

    /* ------------------------------------------------------------------ *
     * pointer field
     * ------------------------------------------------------------------ */

    function refreshRect() {
        const rect = state.host.getBoundingClientRect();

        state.rect.left = rect.left;
        state.rect.top = rect.top;
        state.rectDirty = false;
    }

    function updatePointer(dt) {
        const pointer = state.pointer;

        if (state.rectDirty || state.frame % RECT_REFRESH === 0) {
            refreshRect();
        }

        pointer.x = pointer.clientX - state.rect.left;
        pointer.y = pointer.clientY - state.rect.top;

        const active = !state.reduced &&
            pointer.primed &&
            (state.coarse ? pointer.touching : pointer.inside);

        const target = active ? 1 : 0;

        pointer.strength += (target - pointer.strength) *
            (1 - Math.exp(-(active ? 4.5 : 2.2) * dt));

        if (!pointer.primed) {
            return;
        }

        const blend = 1 - Math.exp(-11 * dt);

        const nextX = pointer.smoothX + (pointer.x - pointer.smoothX) * blend;
        const nextY = pointer.smoothY + (pointer.y - pointer.smoothY) * blend;

        if (dt > 0.0005) {
            const decay = Math.exp(-5.4 * dt);

            pointer.vx = pointer.vx * decay + ((nextX - pointer.smoothX) / dt) * (1 - decay);
            pointer.vy = pointer.vy * decay + ((nextY - pointer.smoothY) / dt) * (1 - decay);

            pointer.vx = clamp(pointer.vx, -2400, 2400);
            pointer.vy = clamp(pointer.vy, -2400, 2400);
        }

        pointer.smoothX = nextX;
        pointer.smoothY = nextY;
    }

    /* ------------------------------------------------------------------ *
     * simulate + render particles
     * ------------------------------------------------------------------ */

    function stepParticles(dt) {
        const ctx = state.dotCtx;
        const sprites = state.sprites;
        const particles = state.particles;
        const layers = state.layers;

        const width = state.width;
        const height = state.height;
        const spanW = width + PAD * 2;
        const spanH = height + PAD * 2;

        const pointer = state.pointer;
        const field = pointer.strength;

        const centerX = width * 0.5;
        const centerY = height * 0.5;
        const useField = field > 0.004;

        const radius = pointer.radius;
        const invRadius = 1 / radius;
        const radiusSq = radius * radius;
        const coreSq = POINTER_CORE * POINTER_CORE;

        const attract = F_ATTRACT * field;
        const repel = F_REPEL * field;
        const swirl = F_SWIRL * field;
        const wakeX = pointer.vx * F_WAKE * field;
        const wakeY = pointer.vy * F_WAKE * field;

        const px = pointer.smoothX;
        const py = pointer.smoothY;

        const flashDecay = Math.exp(-3.1 * dt);
        const fadeScale = 1 / FADE_BAND;

        for (let li = 0; li < layers.length; li++) {
            const layer = layers[li];

            layer.relaxK = 1 - Math.exp(-layer.spec.relax * 60 * dt);
        }

        ctx.clearRect(0, 0, width, height);

        for (let i = 0; i < particles.length; i++) {
            const particle = particles[i];
            const layer = layers[particle.layer];
            const spec = layer.spec;

            /* --- ambient medium velocity, bilinear from the layer grid --- */

            let gx = (particle.x + PAD) * layer.invCellW;
            let gy = (particle.y + PAD) * layer.invCellH;

            gx = gx < 0 ? 0 : gx > layer.cols ? layer.cols : gx;
            gy = gy < 0 ? 0 : gy > layer.rows ? layer.rows : gy;

            const cx = gx | 0;
            const cy = gy | 0;
            const tx = gx - cx;
            const ty = gy - cy;

            const stride = layer.cols + 1;
            const i00 = (cy * stride + cx) * 2;
            const i10 = i00 + 2;
            const i01 = i00 + stride * 2;
            const i11 = i01 + 2;

            const data = layer.data;

            const fx0 = data[i00] + (data[i10] - data[i00]) * tx;
            const fx1 = data[i01] + (data[i11] - data[i01]) * tx;
            const fy0 = data[i00 + 1] + (data[i10 + 1] - data[i00 + 1]) * tx;
            const fy1 = data[i01 + 1] + (data[i11 + 1] - data[i01 + 1]) * tx;

            let flowX = fx0 + (fx1 - fx0) * ty;
            let flowY = fy0 + (fy1 - fy0) * ty;

            /* --- per-particle character on top of the shared field --- */

            particle.pulse += particle.pulseRate * dt;
            particle.twinklePhase += particle.twinkleSpeed * dt;

            const wave = Math.sin(particle.pulse);
            const twinkleWave = 0.5 + 0.5 * Math.sin(particle.twinklePhase + Math.sin(particle.twinklePhase * 0.43) * 0.7);
            const twinkle = 0.34 + 0.66 * Math.pow(twinkleWave, particle.twinkleSharpness);

            if (particle.orbiter) {
                particle.wob += particle.wobRate * dt;

                flowX += Math.cos(particle.wob) * 5.5;
                flowY += Math.sin(particle.wob) * 5.5;
            } else {
                flowX += wave * particle.wobAmpX;
                flowY += wave * particle.wobAmpY;
            }

            /* --- viscous relaxation toward the medium --- */

            const relax = layer.relaxK;

            particle.vx += (flowX - particle.vx) * relax;
            particle.vy += (flowY - particle.vy) * relax;

            /* --- pointer field: attraction, core repulsion, vortex, wake --- */

            if (useField) {
                const dx = px - particle.x;
                const dy = py - particle.y;
                const distSq = dx * dx + dy * dy;

                if (distSq < radiusSq) {
                    const dist = Math.sqrt(distSq) + 0.0001;
                    const nx = dx / dist;
                    const ny = dy / dist;

                    const falloff = 1 - dist * invRadius;
                    const weight = falloff * falloff;

                    const pull = attract * weight * (dist / (dist + POINTER_CORE));
                    const push = repel * (coreSq / (distSq + coreSq));
                    const radial = pull - push;
                    const tangent = swirl * weight * particle.spin;

                    const agility = particle.agility * dt;

                    particle.vx += (nx * radial - ny * tangent) * agility;
                    particle.vy += (ny * radial + nx * tangent) * agility;

                    particle.vx += wakeX * weight * particle.agility * dt;
                    particle.vy += wakeY * weight * particle.agility * dt;
                }
            }

            /* --- integrate with a speed ceiling --- */

            const speedSq = particle.vx * particle.vx + particle.vy * particle.vy;
            const ceiling = spec.maxSpeed;

            if (speedSq > ceiling * ceiling) {
                const scale = ceiling / Math.sqrt(speedSq);

                particle.vx *= scale;
                particle.vy *= scale;
            }

            particle.x += particle.vx * dt;
            particle.y += particle.vy * dt;

            /* --- wrap through the padded margin (fade hides the seam) --- */

            if (particle.x < -PAD) {
                particle.x += spanW;
            } else if (particle.x > width + PAD) {
                particle.x -= spanW;
            }

            if (particle.y < -PAD) {
                particle.y += spanH;
            } else if (particle.y > height + PAD) {
                particle.y -= spanH;
            }

            /* --- brightness, colour drift, edge fade --- */

            if (particle.flash > 0.001) {
                particle.flash *= flashDecay;
            }

            let edge = (particle.x + PAD) * fadeScale;

            const edgeRight = (width + PAD - particle.x) * fadeScale;
            const edgeTop = (particle.y + PAD) * fadeScale;
            const edgeBottom = (height + PAD - particle.y) * fadeScale;

            if (edgeRight < edge) { edge = edgeRight; }
            if (edgeTop < edge) { edge = edgeTop; }
            if (edgeBottom < edge) { edge = edgeBottom; }

            if (edge <= 0) {
                continue;
            }

            if (edge > 1) {
                edge = 1;
            }

            const blink = 0.42 + twinkle * 0.58;
            let alpha = particle.alpha * (0.76 + twinkle * 0.50 + wave * particle.pulseDepth * 0.10) * blink * edge + particle.flash * 0.16;

            if (alpha <= 0.003) {
                continue;
            }

            if (alpha > 0.66) {
                alpha = 0.66;
            }

            let colour = Math.round(
                particle.colourBase + wave * particle.colourSpan
            );

            if (colour < particle.colourLow) { colour = particle.colourLow; }
            if (colour > particle.colourHigh) { colour = particle.colourHigh; }

            const glow = particle.size * particle.reach * (1 + particle.flash * 0.35);

            ctx.globalAlpha = alpha;

            ctx.drawImage(
                sprites[spriteIndex(colour, particle.softness)],
                particle.x - glow,
                particle.y - glow,
                glow * 2,
                glow * 2
            );
        }

        ctx.globalAlpha = 1;
    }

    function scheduleFlashes(dt) {
        if (state.reduced || !state.particles.length) {
            return;
        }

        state.flashTimer -= dt;

        if (state.flashTimer > 0) {
            return;
        }

        state.flashTimer = rand(0.65, 1.9);

        const bursts = 2 + (Math.random() < 0.45 ? 2 : 0);

        for (let i = 0; i < bursts; i++) {
            const particle = state.particles[(Math.random() * state.particles.length) | 0];
            if (particle) {
                particle.flash = rand(0.35, 0.85);
            }
        }
    }

    /* ------------------------------------------------------------------ *
     * performance governor
     * ------------------------------------------------------------------ */

    function governPerformance(frameMs) {
        // a backgrounded tab or a blocking main-thread task is not a measure of
        // how expensive this effect is, so those samples are discarded
        if (!Number.isFinite(frameMs) || frameMs > 120) {
            return;
        }

        state.frameEma += (Math.min(frameMs, 60) - state.frameEma) * 0.05;

        if (state.frameEma > 21) {
            state.fastFrames = 0;
            state.slowFrames++;

            if (state.slowFrames > 90 && state.degrade < 3) {
                state.degrade++;
                state.slowFrames = 0;
                state.frameEma = 16;

                state.targetCount = desiredCount(state.width, state.height);
                syncParticles();
            }
        } else if (state.frameEma < 13.5) {
            state.slowFrames = 0;
            state.fastFrames++;

            if (state.fastFrames > 900 && state.degrade > 0) {
                state.degrade--;
                state.fastFrames = 0;

                state.targetCount = desiredCount(state.width, state.height);
                syncParticles();
            }
        }
    }

    /* ------------------------------------------------------------------ *
     * loop
     * ------------------------------------------------------------------ */

    function tick(stamp) {
        if (!state.running) {
            return;
        }

        state.raf = window.requestAnimationFrame(tick);

        const previous = state.lastStamp || stamp;
        const rawDt = (stamp - previous) / 1000;

        state.lastStamp = stamp;

        const dt = clamp(rawDt, 0.0005, 0.05);

        state.time += dt;
        state.frame++;

        const fieldEvery = FIELD_REBUILD + state.degrade;
        const cloudEvery = CLOUD_REBUILD + state.degrade;

        if (state.frame % fieldEvery === 1 || state.frame === 1) {
            rebuildFields(state.time);
        }

        if (state.frame % cloudEvery === 0 || state.frame === 1) {
            drawClouds(state.time);
        }

        updatePointer(dt);
        scheduleFlashes(dt);
        stepParticles(dt);

        governPerformance(rawDt * 1000);
    }

    function start() {
        if (state.running || state.destroyed) {
            return;
        }

        if (!state.visible || !state.onScreen) {
            return;
        }

        state.running = true;
        state.lastStamp = 0;
        state.raf = window.requestAnimationFrame(tick);
    }

    function stop() {
        state.running = false;

        if (state.raf) {
            window.cancelAnimationFrame(state.raf);
            state.raf = 0;
        }
    }

    /* ------------------------------------------------------------------ *
     * wiring
     * ------------------------------------------------------------------ */

    function on(target, type, handler, options) {
        target.addEventListener(type, handler, options);

        state.listeners.push([target, type, handler, options]);
    }

    function bindPointer() {
        const host = state.host;
        const pointer = state.pointer;

        on(host, "pointerenter", function (event) {
            if (event.pointerType === "touch") {
                return;
            }

            pointer.inside = true;

            pointer.clientX = event.clientX;
            pointer.clientY = event.clientY;

            if (!pointer.primed) {
                refreshRect();

                pointer.smoothX = event.clientX - state.rect.left;
                pointer.smoothY = event.clientY - state.rect.top;
                pointer.vx = 0;
                pointer.vy = 0;
                pointer.primed = true;
            }
        }, { passive: true });

        on(host, "pointerleave", function () {
            pointer.inside = false;
            pointer.touching = false;
        }, { passive: true });

        on(host, "pointermove", function (event) {
            if (event.pointerType === "touch" && !pointer.touching) {
                return;
            }

            pointer.clientX = event.clientX;
            pointer.clientY = event.clientY;

            if (event.pointerType !== "touch") {
                pointer.inside = true;
            }

            if (!pointer.primed) {
                refreshRect();

                pointer.smoothX = event.clientX - state.rect.left;
                pointer.smoothY = event.clientY - state.rect.top;
                pointer.primed = true;
            }
        }, { passive: true });

        on(host, "pointerdown", function (event) {
            if (event.pointerType !== "touch") {
                return;
            }

            refreshRect();

            pointer.touching = true;
            pointer.clientX = event.clientX;
            pointer.clientY = event.clientY;
            pointer.smoothX = event.clientX - state.rect.left;
            pointer.smoothY = event.clientY - state.rect.top;
            pointer.vx = 0;
            pointer.vy = 0;
            pointer.primed = true;
        }, { passive: true });

        const release = function (event) {
            if (event && event.pointerType && event.pointerType !== "touch") {
                return;
            }

            pointer.touching = false;
        };

        on(host, "pointerup", release, { passive: true });
        on(host, "pointercancel", release, { passive: true });

        on(window, "blur", function () {
            pointer.inside = false;
            pointer.touching = false;
        }, { passive: true });

        on(window, "scroll", function () {
            state.rectDirty = true;
        }, { passive: true, capture: true });
    }

    function bindMedia() {
        const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        const coarseQuery = window.matchMedia("(pointer: coarse)");

        state.reduced = reduceQuery.matches;
        state.coarse = coarseQuery.matches;
        state.motion = state.reduced ? 0.28 : 1;

        const onReduce = function (event) {
            state.reduced = event.matches;
            state.motion = state.reduced ? 0.28 : 1;

            state.targetCount = desiredCount(state.width, state.height);
            syncParticles();
        };

        const onCoarse = function (event) {
            state.coarse = event.matches;

            measure();
            buildClouds();
        };

        if (typeof reduceQuery.addEventListener === "function") {
            reduceQuery.addEventListener("change", onReduce);
            coarseQuery.addEventListener("change", onCoarse);

            state.media.push([reduceQuery, onReduce], [coarseQuery, onCoarse]);
        }
    }

    function bindObservers() {
        if (typeof ResizeObserver === "function") {
            let pending = 0;

            const observer = new ResizeObserver(function () {
                if (pending) {
                    return;
                }

                pending = window.requestAnimationFrame(function () {
                    pending = 0;

                    if (!state.destroyed) {
                        measure();
                    }
                });
            });

            observer.observe(state.host);
            state.observers.push(observer);
        } else {
            on(window, "resize", function () {
                measure();
            }, { passive: true });
        }

        if (typeof IntersectionObserver === "function") {
            const observer = new IntersectionObserver(function (entries) {
                state.onScreen = entries.some(function (entry) {
                    return entry.isIntersecting;
                });

                if (state.onScreen) {
                    start();
                } else {
                    stop();
                }
            }, { rootMargin: "120px" });

            observer.observe(state.host);
            state.observers.push(observer);
        }

        on(document, "visibilitychange", function () {
            state.visible = !document.hidden;

            if (state.visible) {
                start();
            } else {
                stop();
            }
        }, { passive: true });
    }

    /* ------------------------------------------------------------------ *
     * lifecycle
     * ------------------------------------------------------------------ */

    function destroy() {
        stop();

        state.destroyed = true;

        state.listeners.forEach(function (entry) {
            entry[0].removeEventListener(entry[1], entry[2], entry[3]);
        });

        state.listeners.length = 0;

        state.observers.forEach(function (observer) {
            observer.disconnect();
        });

        state.observers.length = 0;

        state.media.forEach(function (entry) {
            entry[0].removeEventListener("change", entry[1]);
        });

        state.media.length = 0;

        if (state.layerEl && state.layerEl.parentNode) {
            state.layerEl.parentNode.removeChild(state.layerEl);
        }

        if (state.styleEl && state.styleEl.parentNode) {
            state.styleEl.parentNode.removeChild(state.styleEl);
        }

        if (state.host) {
            state.host.classList.remove(HOST_CLASS);
        }

        state.particles.length = 0;
        state.sprites = null;
    }

    function init() {
        const host = document.querySelector(HOST_SELECTOR);

        if (!host || host.querySelector(".nebula-layer")) {
            return;
        }

        const probe = document.createElement("canvas");

        if (!probe.getContext || !probe.getContext("2d")) {
            return;
        }

        state.host = host;

        if (!document.getElementById(STYLE_ID)) {
            const style = document.createElement("style");

            style.id = STYLE_ID;
            style.textContent = CSS_TEXT;

            document.head.appendChild(style);
            state.styleEl = style;
        }

        host.classList.add(HOST_CLASS);

        const layerEl = document.createElement("div");

        layerEl.className = "nebula-layer";
        layerEl.setAttribute("aria-hidden", "true");

        const cloudCanvas = document.createElement("canvas");

        cloudCanvas.className = "nebula-clouds";

        const dotCanvas = document.createElement("canvas");

        dotCanvas.className = "nebula-dots";

        layerEl.appendChild(cloudCanvas);
        layerEl.appendChild(dotCanvas);

        host.insertBefore(layerEl, host.firstChild);

        state.layerEl = layerEl;
        state.cloudCanvas = cloudCanvas;
        state.cloudCtx = cloudCanvas.getContext("2d");
        state.dotCanvas = dotCanvas;
        state.dotCtx = dotCanvas.getContext("2d");

        state.sprites = buildSprites();

        bindMedia();
        bindAudioReactive();
        buildClouds();
        measure();
        bindPointer();
        bindObservers();

        start();
    }

    if (window.NebulaField && typeof window.NebulaField.destroy === "function") {
        window.NebulaField.destroy();
    }

    window.NebulaField = {
        pause: stop,
        resume: start,
        destroy: destroy,
        stats: function () {
            return {
                particles: state.particles.length,
                target: state.targetCount,
                frameMs: Math.round(state.frameEma * 100) / 100,
                degrade: state.degrade,
                reducedMotion: state.reduced,
                renderScale: state.renderScale,
                size: [state.width, state.height],
                audio: {
                    ready: state.audio.ready,
                    bass: Math.round(state.audio.bass * 1000) / 1000,
                    mid: Math.round(state.audio.mid * 1000) / 1000,
                    high: Math.round(state.audio.high * 1000) / 1000,
                    overall: Math.round(state.audio.overall * 1000) / 1000,
                    pulse: Math.round(state.audio.pulse * 1000) / 1000,
                    pulseBeat: Math.round(state.audio.pulseBeat * 1000) / 1000
                }
            };
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();