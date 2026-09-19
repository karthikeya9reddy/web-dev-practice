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

function getSongName(songURL) {
    let filename = decodeURIComponent(
        songURL.split("/songs/")[1]
    );

    return filename
        .replace(/\.mp3$/i, "")
        .replace(/\(.*?\.mp3\)/gi, "")
        .replace(/senSongsmp3\.co/gi, "")
        .replace(/_+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function highlightSong(songURL) {
    let songItems = document.querySelectorAll(".songlist li");

    songItems.forEach((item) => {
        item.classList.remove("active-song");

        let equalizer = item.querySelector(".song-equalizer");

        if (equalizer) {
            equalizer.remove();
        }
    });

    songItems.forEach((item) => {
        if (item.getAttribute("data-song") === songURL) {
            item.classList.add("active-song");

            let equalizer = document.createElement("div");
            equalizer.className = "song-equalizer";

            equalizer.innerHTML =
                "<span></span><span></span><span></span>";

            item.appendChild(equalizer);
        }
    });

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

    document.querySelector(".songinfo").innerHTML = songName;
    document.querySelector(".songtime").innerHTML = "00:00 / 00:00";
    document.querySelector(".circle").style.left = "0%";

    localStorage.setItem("lastPlayedSong", songURL);

    highlightSong(songURL);

    if (shouldPlay) {
        currentSong.play();
        play.src = "svg files/pause.svg";
    } else {
        play.src = "svg files/play.svg";
    }

    updateEqualizer();
}

async function main() {
    let songs = await getsongs();

    let songUL = document
        .querySelector(".songlist")
        .getElementsByTagName("ul")[0];

    for (const song of songs) {
        let displayName = getSongName(song);

        songUL.innerHTML += `
            <li data-song="${song}">
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
            </li>
        `;
    }

    let songItems = Array.from(
        document
            .querySelector(".songlist")
            .getElementsByTagName("li")
    );

    songItems.forEach((e, index) => {
        e.addEventListener("click", () => {
            currentIndex = index;

            let songURL = e.getAttribute("data-song");

            let songName = e
                .querySelector(".info")
                .firstElementChild
                .innerHTML;

            playMusic(songURL, songName);
        });
    });

    play.addEventListener("click", () => {
        if (!currentSong.src) {
            return;
        }

        if (currentSong.paused) {
            currentSong.play();
            play.src = "svg files/pause.svg";
        } else {
            currentSong.pause();
            play.src = "svg files/play.svg";
        }

        updateEqualizer();
    });

    document.querySelector("#next").addEventListener("click", () => {
        if (songs.length === 0) {
            return;
        }

        currentIndex++;

        if (currentIndex >= songs.length) {
            currentIndex = 0;
        }

        let songURL = songs[currentIndex];
        let songName = getSongName(songURL);

        playMusic(songURL, songName);
    });

    document.querySelector("#previous").addEventListener("click", () => {
        if (songs.length === 0) {
            return;
        }

        currentIndex--;

        if (currentIndex < 0) {
            currentIndex = songs.length - 1;
        }

        let songURL = songs[currentIndex];
        let songName = getSongName(songURL);

        playMusic(songURL, songName);
    });

    currentSong.addEventListener("ended", () => {
        if (songs.length === 0) {
            return;
        }

        currentIndex++;

        if (currentIndex >= songs.length) {
            currentIndex = 0;
        }

        let songURL = songs[currentIndex];
        let songName = getSongName(songURL);

        playMusic(songURL, songName);
    });

    currentSong.addEventListener("play", () => {
        updateEqualizer();
    });

    currentSong.addEventListener("pause", () => {
        updateEqualizer();
    });

    let seekbar = document.querySelector(".seekbar");
    let circle = document.querySelector(".circle");

    let isDragging = false;

    currentSong.addEventListener("timeupdate", () => {
        document.querySelector(".songtime").innerHTML =
            `${secondsToMinutesSeconds(currentSong.currentTime)} / ${secondsToMinutesSeconds(currentSong.duration)}`;

        if (!isDragging && !isNaN(currentSong.duration)) {
            let percent =
                (currentSong.currentTime / currentSong.duration) * 100;

            circle.style.left = percent + "%";
        }
    });

    seekbar.addEventListener("click", (e) => {
        if (isDragging || !currentSong.src) {
            return;
        }

        let rect = seekbar.getBoundingClientRect();

        let percent =
            ((e.clientX - rect.left) / rect.width) * 100;

        percent = Math.max(0, Math.min(100, percent));

        circle.style.left = percent + "%";

        if (!isNaN(currentSong.duration)) {
            currentSong.currentTime =
                (percent / 100) * currentSong.duration;
        }
    });

    seekbar.addEventListener("mousedown", () => {
        isDragging = true;
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDragging || !currentSong.src) {
            return;
        }

        let rect = seekbar.getBoundingClientRect();

        let percent =
            ((e.clientX - rect.left) / rect.width) * 100;

        percent = Math.max(0, Math.min(100, percent));

        circle.style.left = percent + "%";

        if (!isNaN(currentSong.duration)) {
            currentSong.currentTime =
                (percent / 100) * currentSong.duration;
        }
    });

    document.addEventListener("mouseup", () => {
        isDragging = false;
    });

    let lastPlayedSong = localStorage.getItem("lastPlayedSong");

    if (lastPlayedSong && songs.includes(lastPlayedSong)) {
        currentIndex = songs.indexOf(lastPlayedSong);

        let songName = getSongName(lastPlayedSong);

        playMusic(lastPlayedSong, songName, false);
    }
}

main();












const cursorLight = document.querySelector(".cursor-light");

document.addEventListener("mousemove", (e) => {
    cursorLight.style.left = `${e.clientX}px`;
    cursorLight.style.top = `${e.clientY}px`;
    cursorLight.style.opacity = "1";
});

document.addEventListener("mouseleave", () => {
    cursorLight.style.opacity = "0";
});



document.addEventListener("click", (e) => {

    const effect = document.createElement("div");

    effect.className = "click-effect";

    effect.style.left = e.clientX + "px";
    effect.style.top = e.clientY + "px";

    document.body.appendChild(effect);

    setTimeout(() => {
        effect.remove();
    }, 1100);
});

