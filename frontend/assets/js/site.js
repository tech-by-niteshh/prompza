(function () {
    const initializedCards = new WeakSet();
    let promptCardTemplate = null;
    const likedPromptsStorageKey = "prompza-liked-prompts";

    function getLikedPromptIds() {
        try {
            const value = JSON.parse(window.localStorage.getItem(likedPromptsStorageKey) || "[]");
            return Array.isArray(value) ? value : [];
        } catch (_error) {
            return [];
        }
    }

    function hasLikedPrompt(promptId) {
        return Boolean(promptId) && getLikedPromptIds().includes(String(promptId));
    }

    function markPromptAsLiked(promptId) {
        if (!promptId) {
            return;
        }

        const ids = new Set(getLikedPromptIds());
        ids.add(String(promptId));
        window.localStorage.setItem(likedPromptsStorageKey, JSON.stringify(Array.from(ids)));
    }

    async function loadHtml(url) {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to load ${url}`);
        }

        return response.text();
    }

    async function getPromptCardTemplate() {
        if (!promptCardTemplate) {
            promptCardTemplate = await loadHtml("/frontend/components/prompt-card.html");
        }

        return promptCardTemplate;
    }

    function initPromptCard(card) {
        if (!card || initializedCards.has(card)) {
            return;
        }

        const copyButton = card.querySelector(".js-prompt-card-copy");
        const promptText = card.querySelector(".js-prompt-card-text");
        const status = card.querySelector(".js-prompt-card-status");
        const likeButton = card.querySelector(".js-prompt-card-like");
        const likeCount = card.querySelector(".js-prompt-card-like-count");
        const promptId = card.getAttribute("data-prompt-id");

        if (!copyButton || !promptText || !status) {
            return;
        }

        let statusTimer;
        let likeInFlight = false;

        const setStatus = (message) => {
            status.textContent = message;
            status.classList.add("visible");

            window.clearTimeout(statusTimer);
            statusTimer = window.setTimeout(() => {
                status.classList.remove("visible");
            }, 1400);
        };

        copyButton.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(promptText.value);
            } catch (_error) {
                promptText.removeAttribute("readonly");
                promptText.select();
                document.execCommand("copy");
                promptText.setAttribute("readonly", "readonly");
            }

            setStatus("Copied");
        });

        if (likeButton && likeCount) {
            const syncLikedState = () => {
                if (!promptId) {
                    likeButton.disabled = true;
                    likeButton.classList.remove("is-liked");
                    likeButton.setAttribute("aria-pressed", "false");
                    likeButton.setAttribute("aria-label", "Likes unavailable");
                    return;
                }

                const liked = hasLikedPrompt(promptId);
                likeButton.classList.toggle("is-liked", liked);
                likeButton.disabled = liked;
                likeButton.setAttribute("aria-pressed", liked ? "true" : "false");
                likeButton.setAttribute("aria-label", liked ? "Prompt liked" : "Like prompt");
            };

            syncLikedState();

            likeButton.addEventListener("click", async () => {
                if (!promptId || likeInFlight || hasLikedPrompt(promptId)) {
                    syncLikedState();
                    return;
                }

                likeInFlight = true;

                try {
                    const response = await fetch(`/api/prompts/${encodeURIComponent(promptId)}/like`, {
                        method: "POST",
                    });
                    const data = await response.json();

                    if (!response.ok) {
                        throw new Error(data.error || "Failed to like prompt.");
                    }

                    const likes = Number(data.prompt && data.prompt.likes ? data.prompt.likes : 0);
                    likeCount.textContent = String(likes);
                    card.setAttribute("data-likes", String(likes));
                    markPromptAsLiked(promptId);
                    syncLikedState();
                    setStatus("Liked");
                    window.dispatchEvent(new CustomEvent("prompza:prompt-liked", {
                        detail: {
                            promptId,
                            likes,
                        },
                    }));
                } catch (_error) {
                    setStatus("Retry");
                } finally {
                    likeInFlight = false;
                }
            });
        }

        initializedCards.add(card);
    }

    async function createPromptCard(options = {}) {
        const template = await getPromptCardTemplate();
        const wrapper = document.createElement("div");
        wrapper.innerHTML = template.trim();

        const card = wrapper.firstElementChild;

        if (!card) {
            throw new Error("Prompt card template is empty.");
        }

        const eyebrow = card.querySelector(".prompt-card__eyebrow");
        const title = card.querySelector(".prompt-card__title");
        const body = card.querySelector(".prompt-card__body");
        const promptText = card.querySelector(".js-prompt-card-text");
        const likeCount = card.querySelector(".js-prompt-card-like-count");

        if (options.id) {
            card.setAttribute("data-prompt-id", options.id);
        }

        card.setAttribute("data-likes", String(Number(options.likes || 0)));

        if (eyebrow) {
            eyebrow.textContent = options.category || "General";
        }

        if (title && options.title) {
            title.textContent = options.title;
        }

        if (body && options.body) {
            body.textContent = options.body;
        }

        if (promptText) {
            promptText.value = options.prompt || "";
        }

        if (likeCount) {
            likeCount.textContent = String(Number(options.likes || 0));
        }

        initPromptCard(card);
        return card;
    }

    async function hydrateDynamicComponents() {
        const slots = Array.from(document.querySelectorAll("[data-component='prompt-card']"));

        await Promise.all(slots.map(async (slot) => {
            try {
                const card = await createPromptCard({
                    id: slot.getAttribute("data-id") || undefined,
                    likes: slot.getAttribute("data-likes") || 0,
                    category: slot.getAttribute("data-category") || undefined,
                    title: slot.getAttribute("data-title") || undefined,
                    body: slot.getAttribute("data-body") || undefined,
                    prompt: slot.getAttribute("data-prompt") || undefined,
                });
                slot.innerHTML = "";
                slot.appendChild(card);
            } catch (_error) {
                slot.innerHTML = `
                    <div class="prompt-fallback">
                        <strong>Prompt Card</strong>
                        <p style="margin-top: 10px; color: rgba(0, 0, 38, 0.7); line-height: 1.8;">
                            The prompt card component is available in the project, but it could not be loaded automatically.
                        </p>
                    </div>
                `;
            }
        }));

        document.querySelectorAll(".prompt-card").forEach(initPromptCard);
    }

    window.prompzaSite = {
        hydrateDynamicComponents,
        initPromptCard,
        createPromptCard,
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", hydrateDynamicComponents);
    } else {
        hydrateDynamicComponents();
    }
})();
