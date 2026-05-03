async function loadComponent(targetId, filePath) {
    const target = document.getElementById(targetId);

    if (!target) {
        return false;
    }

    const response = await fetch(filePath);

    if (!response.ok) {
        throw new Error(`Failed to load component: ${filePath}`);
    }

    target.innerHTML = await response.text();

    target.querySelectorAll("script").forEach((original) => {
        const executable = document.createElement("script");

        Array.from(original.attributes).forEach((attr) => {
            executable.setAttribute(attr.name, attr.value);
        });

        executable.textContent = original.textContent;
        original.replaceWith(executable);
    });

    return true;
}

async function loadFirstAvailableComponent(targetIds, filePath) {
    for (const targetId of targetIds) {
        const loaded = await loadComponent(targetId, filePath);

        if (loaded) {
            return true;
        }
    }

    return false;
}

function ensureComponentTarget(targetIds, preferredId) {
    const existingTarget = targetIds
        .map((targetId) => document.getElementById(targetId))
        .find(Boolean);

    if (existingTarget) {
        return existingTarget;
    }

    const target = document.createElement("div");
    target.id = preferredId;
    document.body.appendChild(target);
    return target;
}

function initNavbar() {
    const navbar = document.getElementById("site-navbar");
    const hamburgerBtn = document.getElementById("hamburgerBtn");
    const mobileMenu = document.getElementById("mobileMenu");
    const allLinks = document.querySelectorAll(".navbar__link, .navbar__mobile-link");

    if (!navbar || !hamburgerBtn || !mobileMenu) {
        return;
    }

    const getCurrentPage = () => {
        const filename = window.location.pathname.split("/").pop() || "index.html";
        return filename.replace(".html", "") || "index";
    };

    const configureSearchForms = (pageName) => {
        const isImagePage = pageName === "image";

        document.querySelectorAll(".navbar__search-form").forEach((form) => {
            form.setAttribute("action", isImagePage ? "/image" : "/post");
        });

        document.querySelectorAll(".navbar__search-input").forEach((input) => {
            input.setAttribute("placeholder", isImagePage ? "Search image prompts" : "Search prompts");
            input.setAttribute("aria-label", isImagePage ? "Search image prompts" : "Search prompts");
        });
    };

    const setActivePage = (pageName) => {
        allLinks.forEach((link) => {
            const isActive = link.getAttribute("data-page") === pageName;
            link.classList.toggle("active", isActive);
        });
    };

    const openMenu = () => {
        mobileMenu.classList.add("open");
        mobileMenu.setAttribute("aria-hidden", "false");
        hamburgerBtn.setAttribute("aria-expanded", "true");
    };

    const closeMenu = () => {
        mobileMenu.classList.remove("open");
        mobileMenu.setAttribute("aria-hidden", "true");
        hamburgerBtn.setAttribute("aria-expanded", "false");
    };

    const currentPage = getCurrentPage();

    setActivePage(currentPage);
    configureSearchForms(currentPage);
    closeMenu();

    hamburgerBtn.addEventListener("click", () => {
        if (mobileMenu.classList.contains("open")) {
            closeMenu();
            return;
        }

        openMenu();
    });

    document.querySelectorAll(".navbar__mobile-link").forEach((link) => {
        link.addEventListener("click", closeMenu);
    });

    window.addEventListener("scroll", () => {
        navbar.classList.toggle("scrolled", window.scrollY > 20);
    });
}

function initFooter() {
    document.querySelectorAll("[data-footer-year]").forEach((yearElement) => {
        yearElement.textContent = new Date().getFullYear().toString();
    });
}

const loaderSessionKey = "prompza-loader-shown";

function shouldShowLoader() {
    try {
        return !sessionStorage.getItem(loaderSessionKey);
    } catch (_error) {
        return false;
    }
}

function markLoaderShown() {
    try {
        sessionStorage.setItem(loaderSessionKey, "1");
    } catch (_error) {
        // sessionStorage unavailable, loader will show again on next page
    }
}

function injectLoaderPlaceholder() {
    if (document.getElementById("loader-placeholder")) {
        return;
    }

    const placeholder = document.createElement("div");
    placeholder.id = "loader-placeholder";
    document.body.prepend(placeholder);
}

async function loadSharedComponents() {
    try {
        const showLoader = shouldShowLoader();

        if (showLoader) {
            injectLoaderPlaceholder();
        }

        ensureComponentTarget(["footer-placeholder", "footer"], "footer-placeholder");

        const componentLoads = [
            loadFirstAvailableComponent(["navbar-placeholder", "navbar"], "/frontend/components/navbar.html"),
            loadFirstAvailableComponent(["footer-placeholder", "footer"], "/frontend/components/footer.html"),
        ];

        if (showLoader) {
            componentLoads.push(
                loadComponent("loader-placeholder", "/frontend/components/loader.html").then(() => {
                    window.addEventListener("prompza:loader-complete", markLoaderShown, { once: true });
                })
            );
        }

        await Promise.all(componentLoads);

        initNavbar();
        initFooter();
    } catch (error) {
        console.error("Component loading failed:", error);
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadSharedComponents);
} else {
    loadSharedComponents();
}
