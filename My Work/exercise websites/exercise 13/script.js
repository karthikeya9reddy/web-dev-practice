function updatecard() {
    const titlecard = document.querySelector(".title")
    if (titlecard) {
        titlecard.textContent = "Installing VS Code & How Websites Work | Sigma Web Development Course - Tutorial #1";
    }

    const thumbnailcard = document.querySelector(".thumbnail")
    if (thumbnailcard) {
        thumbnailcard.style.backgroundImage = "url('https://i.ytimg.com/vi/tVzUXW6siu0/hqdefault.jpg?s…jgBQAG4AvcY&rs=AOn4CLCk5RBs9qwF5prJkSLc_LkIdMlUcg')";
        thumbnailcard.style.backgroundSize = "cover"
        thumbnailcard.style.backgroundPosition = "center"
    }

    const durationcard = document.querySelector(".duration")
    if (durationcard) {
        durationcard.textContent = "30:28"
    }

    const chnamecard = document.querySelector(".chname")
    if (chnamecard) {
        chnamecard.textContent = "codewithharry"
    }

    const viewscard = document.querySelector(".views");

    if (viewscard) {
        let viewsCount = 1000;

        if (viewsCount >= 1000) {
            viewscard.textContent = (viewsCount / 1000) + "k views";
        } 
        else {
            viewscard.textContent = viewsCount + " views";
        }
    }


    const agecard = document.querySelector(".age")
    if (agecard) {
        agecard.textContent = "3 months ago"
    }

}
updatecard();