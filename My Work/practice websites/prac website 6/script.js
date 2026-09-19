console.log("lets write javascript");

function secondsToMinutesSeconds(seconds) {
    if (isNaN(seconds) || seconds < 0) {
        return "...";
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    const formattedMinutes = String(minutes).padStart(2, "0");
    const formattedSeconds = String(remainingSeconds).padStart(2, "0");

    return `${formattedMinutes}:${formattedSeconds}`;
}

async function getsongs() {
    let a = await fetch("http://127.0.0.1:3000/songs/");
    let response = await a.text();

    let div = document.createElement("div");
    div.innerHTML = response;

    let as = div.getElementsByTagName("a");
    let songs = [];

    for (let index = 0; index < as.length; index++) {
        let element = as[index];
        let filename = element.textContent.trim();

        if (filename.toLowerCase().endsWith(".mp3")) {
            let songURL =
                "http://127.0.0.1:3000/songs/" +
                encodeURIComponent(filename);

            songs.push(songURL);
        }
    }

    return songs;
}

let currentSong = new Audio();
let currentIndex = 0;

const play = document.querySelector("#play");
const searchInput = document.querySelector("#searchInput");
const songList = document.querySelector(".songlist ul");
const seekbar = document.querySelector(".seekbar");
const circle = document.querySelector(".circle");

function getSongName(songURL) {
    let filename = decodeURIComponent(
        songURL.split("/songs/")[1] || ""
    );

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

    if (!query) {
        return 1;
    }

    if (!name) {
        return 0;
    }

    if (name === query) {
        return 10000;
    }

    if (name.startsWith(query)) {
        return 9000 - name.length;
    }

    const words = name.split(" ");

    for (const word of words) {
        if (word.startsWith(query)) {
            return 8000 - word.length;
        }
    }

    if (name.includes(query)) {
        return 7000 - name.indexOf(query);
    }

    const queryWords = query.split(" ");

    let matchedWords = 0;

    for (const word of queryWords) {
        if (!word) {
            continue;
        }

        if (name.includes(word)) {
            matchedWords++;
        }
    }

    if (matchedWords === queryWords.length) {
        return 6000 - name.length;
    }

    let queryIndex = 0;
    let matchedCharacters = 0;

    for (let i = 0; i < name.length && queryIndex < query.length; i++) {
        if (name[i] === query[queryIndex]) {
            matchedCharacters++;
            queryIndex++;
        }
    }

    if (matchedCharacters === query.length) {
        return 5000 - (name.length - query.length);
    }

    return 0;
}

function highlightSong(songURL) {
    let songItems = document.querySelectorAll(".songlist li");
    let activeItem = null;

    songItems.forEach((item) => {
        item.classList.remove("active-song");

        let equalizer = item.querySelector(".song-equalizer");

        if (equalizer) {
            equalizer.remove();
        }

        if (item.getAttribute("data-song") === songURL) {
            activeItem = item;
        }
    });

    if (activeItem) {
        activeItem.classList.add("active-song");

        let equalizer = document.createElement("div");
        equalizer.className = "song-equalizer";

        equalizer.innerHTML =
            "<span></span><span></span><span></span>";

        activeItem.appendChild(equalizer);

        if (activeItem.style.display !== "none") {
            activeItem.scrollIntoView({
                behavior: "smooth",
                block: "nearest"
            });
        }
    }

    updateEqualizer();
}

function updateEqualizer() {
    let equalizer = document.querySelector(
        ".active-song .song-equalizer"
    );

    if (!equalizer) {
        return;
    }

    if (currentSong.paused) {
        equalizer.classList.add("paused");
    } else {
        equalizer.classList.remove("paused");
    }
}

function playMusic(songURL, songName, shouldPlay = true) {
    currentSong.src = songURL;
    currentSong.currentTime = 0;

    document.querySelector(".songinfo").textContent = songName;
    document.querySelector(".songtime").textContent = "00:00 / 00:00";
    circle.style.left = "0%";

    localStorage.setItem("lastPlayedSong", songURL);

    highlightSong(songURL);

    if (shouldPlay) {
        let playPromise = currentSong.play();

        if (playPromise) {
            playPromise.catch(() => {});
        }

        play.src = "svg files/pause.svg";
    } else {
        play.src = "svg files/play.svg";
    }

    updateEqualizer();
}

function createSongItem(song, index) {
    let displayName = getSongName(song);

    let li = document.createElement("li");

    li.setAttribute("data-song", song);
    li.setAttribute("data-name", displayName);
    li.setAttribute("data-index", index);

    li.innerHTML = `
        <img
            class="invert"
            src="svg files/music.svg"
            alt=""
        >

        <div class="info">
            <div>${displayName}</div>
            <div>karthikeya</div>
        </div>

        <div class="playnow">
            <span>Play Now</span>

            <img
                width="35px"
                src="svg files/playnow.svg"
                alt=""
            >
        </div>
    `;

    return li;
}

function renderSongs(songs) {
    songList.innerHTML = "";

    songs.forEach((song, index) => {
        songList.appendChild(
            createSongItem(song, index)
        );
    });
}

function searchSongs(value) {
    let query = normalizeText(value);
    let items = Array.from(
        songList.querySelectorAll("li[data-song]")
    );

    if (!query) {
        items.sort(
            (a, b) =>
                Number(a.dataset.index) -
                Number(b.dataset.index)
        );

        items.forEach((item) => {
            item.style.display = "";
            songList.appendChild(item);
        });

        return;
    }

    let matches = [];

    items.forEach((item) => {
        let songName =
            item.getAttribute("data-name") || "";

        let score =
            fuzzyScore(songName, query);

        if (score > 0) {
            item.style.display = "";
            matches.push({
                item: item,
                score: score
            });
        } else {
            item.style.display = "none";
        }
    });

    matches.sort(
        (a, b) => b.score - a.score
    );

    matches.forEach((match) => {
        songList.appendChild(match.item);
    });
}

async function main() {
    let songs = await getsongs();

    renderSongs(songs);

    songList.addEventListener("click", (e) => {
        let item = e.target.closest(
            "li[data-song]"
        );

        if (!item) {
            return;
        }

        let songURL =
            item.getAttribute("data-song");

        let songName =
            item.getAttribute("data-name") ||
            getSongName(songURL);

        currentIndex =
            songs.indexOf(songURL);

        playMusic(
            songURL,
            songName
        );
    });

    searchInput.addEventListener("input", () => {
        searchSongs(searchInput.value);
    });

    searchInput.addEventListener("compositionend", () => {
        searchSongs(searchInput.value);
    });

    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            searchInput.value = "";
            searchSongs("");
        }
    });

    play.addEventListener("click", () => {
        if (!currentSong.src) {
            return;
        }

        if (currentSong.paused) {
            let playPromise =
                currentSong.play();

            if (playPromise) {
                playPromise.catch(() => {});
            }

            play.src =
                "svg files/pause.svg";
        } else {
            currentSong.pause();

            play.src =
                "svg files/play.svg";
        }

        updateEqualizer();
    });

    document
        .querySelector("#next")
        .addEventListener("click", () => {
            if (songs.length === 0) {
                return;
            }

            currentIndex++;

            if (currentIndex >= songs.length) {
                currentIndex = 0;
            }

            let songURL =
                songs[currentIndex];

            playMusic(
                songURL,
                getSongName(songURL)
            );
        });

    document
        .querySelector("#previous")
        .addEventListener("click", () => {
            if (songs.length === 0) {
                return;
            }

            currentIndex--;

            if (currentIndex < 0) {
                currentIndex =
                    songs.length - 1;
            }

            let songURL =
                songs[currentIndex];

            playMusic(
                songURL,
                getSongName(songURL)
            );
        });

    currentSong.addEventListener(
        "ended",
        () => {
            if (songs.length === 0) {
                return;
            }

            currentIndex++;

            if (currentIndex >= songs.length) {
                currentIndex = 0;
            }

            let songURL =
                songs[currentIndex];

            playMusic(
                songURL,
                getSongName(songURL)
            );
        }
    );

    currentSong.addEventListener(
        "play",
        updateEqualizer
    );

    currentSong.addEventListener(
        "pause",
        updateEqualizer
    );

    let isDragging = false;

    currentSong.addEventListener(
        "timeupdate",
        () => {
            document.querySelector(
                ".songtime"
            ).textContent =
                `${secondsToMinutesSeconds(
                    currentSong.currentTime
                )} / ${secondsToMinutesSeconds(
                    currentSong.duration
                )}`;

            if (
                !isDragging &&
                !isNaN(currentSong.duration) &&
                currentSong.duration > 0
            ) {
                let percent =
                    (
                        currentSong.currentTime /
                        currentSong.duration
                    ) * 100;

                circle.style.left =
                    percent + "%";
            }
        }
    );

    seekbar.addEventListener(
        "click",
        (e) => {
            if (
                isDragging ||
                !currentSong.src ||
                isNaN(currentSong.duration)
            ) {
                return;
            }

            let rect =
                seekbar.getBoundingClientRect();

            let percent =
                (
                    (e.clientX - rect.left) /
                    rect.width
                ) * 100;

            percent =
                Math.max(
                    0,
                    Math.min(100, percent)
                );

            circle.style.left =
                percent + "%";

            currentSong.currentTime =
                (
                    percent / 100
                ) * currentSong.duration;
        }
    );

    seekbar.addEventListener(
        "mousedown",
        () => {
            isDragging = true;
        }
    );

    document.addEventListener(
        "mousemove",
        (e) => {
            if (
                !isDragging ||
                !currentSong.src ||
                isNaN(currentSong.duration)
            ) {
                return;
            }

            let rect =
                seekbar.getBoundingClientRect();

            let percent =
                (
                    (e.clientX - rect.left) /
                    rect.width
                ) * 100;

            percent =
                Math.max(
                    0,
                    Math.min(100, percent)
                );

            circle.style.left =
                percent + "%";

            currentSong.currentTime =
                (
                    percent / 100
                ) * currentSong.duration;
        }
    );

    document.addEventListener(
        "mouseup",
        () => {
            isDragging = false;
        }
    );

    let lastPlayedSong =
        localStorage.getItem(
            "lastPlayedSong"
        );

    if (
        lastPlayedSong &&
        songs.includes(lastPlayedSong)
    ) {
        currentIndex =
            songs.indexOf(
                lastPlayedSong
            );

        playMusic(
            lastPlayedSong,
            getSongName(lastPlayedSong),
            false
        );
    }
}

main().catch((error) => {
    console.error(error);
});

const cursorLight =
    document.querySelector(".cursor-light");

if (cursorLight) {
    document.addEventListener(
        "mousemove",
        (e) => {
            cursorLight.style.left =
                `${e.clientX}px`;

            cursorLight.style.top =
                `${e.clientY}px`;

            cursorLight.style.opacity =
                "1";
        }
    );

    document.addEventListener(
        "mouseleave",
        () => {
            cursorLight.style.opacity =
                "0";
        }
    );
}

document.addEventListener(
    "click",
    (e) => {
        const effect =
            document.createElement("div");

        effect.className =
            "click-effect";

        effect.style.left =
            e.clientX + "px";

        effect.style.top =
            e.clientY + "px";

        document.body.appendChild(
            effect
        );

        setTimeout(
            () => {
                effect.remove();
            },
            1100
        );
    }
);