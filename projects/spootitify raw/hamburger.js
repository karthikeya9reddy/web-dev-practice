document.addEventListener("DOMContentLoaded", () => {
    const container = document.querySelector(".container");
    const left = document.querySelector(".left");

    if (!container || !left) return;

    const button = document.createElement("button");
    button.className = "hamburger-button";
    button.type = "button";
    button.setAttribute("aria-label", "Open menu");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", "sidebar");
    button.innerHTML = "<span></span><span></span><span></span>";

    const overlay = document.createElement("div");
    overlay.className = "menu-overlay";
    overlay.setAttribute("aria-hidden", "true");

    container.appendChild(overlay);
    container.appendChild(button);

    function isMobile() {
        return window.innerWidth <= 850;
    }

    function closeMenu() {
        left.classList.remove("menu-open");
        button.classList.remove("open");
        overlay.classList.remove("open");
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-label", "Open menu");
        overlay.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
    }

    function openMenu() {
        if (!isMobile()) return;

        left.classList.add("menu-open");
        button.classList.add("open");
        overlay.classList.add("open");
        button.setAttribute("aria-expanded", "true");
        button.setAttribute("aria-label", "Close menu");
        overlay.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
    }

    button.addEventListener("click", () => {
        if (left.classList.contains("menu-open")) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    overlay.addEventListener("click", closeMenu);

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeMenu();
        }
    });

    left.addEventListener("click", event => {
        if (!isMobile()) return;

        if (event.target.closest(".songlist li[data-song]")) {
            closeMenu();
            return;
        }

        if (event.target.closest(".home-link")) {
            closeMenu();
        }
    });

    window.addEventListener("resize", () => {
        if (!isMobile()) {
            closeMenu();
        }
    });
});

