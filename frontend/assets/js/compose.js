(function () {
    async function submitPrompt(payload) {
        const response = await fetch("/api/prompts", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Failed to save prompt.");
        }

        return data;
    }

    async function submitImagePrompt(payload) {
        const response = await fetch("/api/image-prompts", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Failed to save image prompt.");
        }

        return data;
    }

    function setStatus(message, type) {
        const status = document.getElementById("compose-status");

        if (!status) {
            return;
        }

        status.textContent = message;
        status.style.color = type === "error" ? "#b42318" : "#0f52ba";
    }

    function setImageStatus(message, type) {
        const status = document.getElementById("image-prompt-status");

        if (!status) {
            return;
        }

        status.textContent = message;
        status.style.color = type === "error" ? "#b42318" : "#0f52ba";
    }

    function readImageFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("Could not read image file."));
            reader.readAsDataURL(file);
        });
    }

    function loadImageElement(source) {
        return new Promise((resolve, reject) => {
            const image = new Image();

            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("Could not prepare image for upload."));
            image.src = source;
        });
    }

    async function prepareImageForUpload(file) {
        const source = await readImageFile(file);
        const image = await loadImageElement(source);
        const maxSize = 1400;
        const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
            return source;
        }

        canvas.width = width;
        canvas.height = height;
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        return canvas.toDataURL("image/jpeg", 0.86);
    }

    function updateImagePreview(imageUrl) {
        const preview = document.getElementById("image-upload-preview");

        if (!preview) {
            return;
        }

        preview.innerHTML = "";

        if (!imageUrl) {
            const placeholder = document.createElement("span");
            placeholder.className = "text-muted";
            placeholder.textContent = "Selected image preview appears here.";
            preview.appendChild(placeholder);
            return;
        }

        const image = document.createElement("img");
        image.src = imageUrl;
        image.alt = "Selected image prompt preview";
        preview.appendChild(image);
    }

    function initComposeForm() {
        const form = document.getElementById("compose-form");

        if (!form) {
            return;
        }

        form.addEventListener("submit", async (event) => {
            event.preventDefault();

            const payload = {
                title: document.getElementById("compose-title")?.value || "",
                category: document.getElementById("compose-category")?.value || "",
                goal: document.getElementById("compose-goal")?.value || "",
                tone: document.getElementById("compose-tone")?.value || "",
                keywords: document.getElementById("compose-keywords")?.value || "",
                contentType: "text",
            };

            try {
                setStatus("Saving prompt...", "info");
                await submitPrompt(payload);
                form.reset();
                setStatus("Prompt saved successfully to the server.", "success");
            } catch (error) {
                setStatus(error.message, "error");
            }
        });
    }

    function initImagePromptForm() {
        const form = document.getElementById("image-prompt-form");
        const fileInput = document.getElementById("image-prompt-file");
        let selectedImageUrl = "";

        if (!form || !fileInput) {
            return;
        }

        fileInput.addEventListener("change", async () => {
            const file = fileInput.files && fileInput.files[0];

            if (!file) {
                selectedImageUrl = "";
                updateImagePreview("");
                return;
            }

            if (!file.type.startsWith("image/")) {
                fileInput.value = "";
                selectedImageUrl = "";
                updateImagePreview("");
                setImageStatus("Please choose an image file.", "error");
                return;
            }

            try {
                setImageStatus("Preparing image...", "info");
                selectedImageUrl = await prepareImageForUpload(file);
                updateImagePreview(selectedImageUrl);
                setImageStatus("", "info");
            } catch (error) {
                selectedImageUrl = "";
                updateImagePreview("");
                setImageStatus(error.message, "error");
            }
        });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();

            const payload = {
                title: document.getElementById("image-prompt-title")?.value || "",
                category: document.getElementById("image-prompt-category")?.value || "Image Generation",
                imagePrompt: document.getElementById("image-prompt-text")?.value || "",
                keywords: document.getElementById("image-prompt-keywords")?.value || "",
                imageData: selectedImageUrl,
            };

            try {
                setImageStatus("Uploading image prompt...", "info");
                await submitImagePrompt(payload);
                form.reset();
                selectedImageUrl = "";
                updateImagePreview("");
                setImageStatus("Image prompt uploaded successfully.", "success");
            } catch (error) {
                setImageStatus(error.message, "error");
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            initComposeForm();
            initImagePromptForm();
        });
    } else {
        initComposeForm();
        initImagePromptForm();
    }
})();
