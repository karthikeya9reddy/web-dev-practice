console.log("lets write javascript");

async function getsongs() {
    let a = await fetch("http://127.0.0.1:3000/songs/")
    let response = await a.text();
    let div = document.createElement("div")
    div.innerHTML = response;
    let as = div.getElementsByTagName("a")
    let songs = []
    for (let index = 0; index < as.length; index++) {
        const element = as[index];
        // Get the actual filename from the link
        let filename = element.textContent.trim();

        if (filename.toLowerCase().endsWith(".mp3")) {
            let songURL =
                "http://127.0.0.1:3000/songs/" + encodeURIComponent(filename);
                 songs.push(songURL);
        }
    }
    return songs;
}

async function main() {
    //get list 0f all the songs 
    let songs = await getsongs()
    console.log(songs)
   let songUL = document.querySelector(".songlist").getElementsByTagName("ul")[0]
   for (const song of songs) {
    let filename = decodeURIComponent(
        song.split("/songs/")[1]
    );

    // Create a clean name for displaying
    let displayName = filename
    .replace(/\.mp3$/i, "")              // remove .mp3
    .replace(/\(mp3\.pm\)/gi, "")        // remove (mp3.pm)
    .replace(/senSongsmp3\.co/gi, "")    // remove SenSongsmp3.Co
    .replace(/_+/g, " ")                 // underscores → spaces
    .replace(/\s+/g, " ")                // multiple spaces → one
    .trim();

    songUL.innerHTML += `
        <li>
            <img class="invert" src="svg files/music.svg" alt="">

            <div class="info">
                <div>${displayName}</div>
                <div>karthikeya</div>
            </div>

            <div class="playnow">
                <span>Play Now</span>
                <img width="35px" src="svg files/playnow.svg" alt="">
            </div>
        </li>
    `;
}

    //play the first song
    var audio = new Audio(songs[1]);
    // audio.play();
}
main()
