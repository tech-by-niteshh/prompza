(function () {
    function setStatus(elementId, message, state) {
        const element = document.getElementById(elementId);

        if (!element) {
            return;
        }

        element.textContent = message;
        element.setAttribute("data-state", state || "");
    }

    async function submitJson(url, payload) {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Request failed.");
        }

        return data;
    }

    function initPromptRequestForm() {
        const form = document.getElementById("prompt-request-contact-form");

        if (!form) {
            return;
        }

        form.addEventListener("submit", async (event) => {
            event.preventDefault();

            const payload = {
                name: document.getElementById("request-name")?.value.trim() || "",
                email: document.getElementById("request-email")?.value.trim() || "",
                requestType: document.getElementById("request-type")?.value || "",
                message: document.getElementById("request-message")?.value.trim() || "",
                source: "contact_page_prompt_request",
            };

            try {
                setStatus("request-form-status", "Sending prompt request...", "loading");
                await submitJson("/submit-request", payload);
                form.reset();
                setStatus("request-form-status", "Prompt request sent successfully to the request bot.", "success");
            } catch (error) {
                setStatus("request-form-status", error.message, "error");
            }
        });
    }

    function initMessageForm() {
        const form = document.getElementById("contact-message-form");

        if (!form) {
            return;
        }

        form.addEventListener("submit", async (event) => {
            event.preventDefault();

            const payload = {
                activityType: document.getElementById("contact-topic")?.value || "user_message",
                name: document.getElementById("contact-name")?.value.trim() || "",
                email: document.getElementById("contact-email")?.value.trim() || "",
                message: document.getElementById("contact-message")?.value.trim() || "",
                source: "contact_page_user_message",
                metadata: {
                    page: "contact",
                },
            };

            try {
                setStatus("message-form-status", "Sending your message...", "loading");
                await submitJson("/send-message", payload);
                form.reset();
                setStatus("message-form-status", "Your message was sent successfully.", "success");
            } catch (error) {
                setStatus("message-form-status", error.message, "error");
            }
        });
    }

    function initContactPage() {
        initPromptRequestForm();
        initMessageForm();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initContactPage);
    } else {
        initContactPage();
    }
})();
