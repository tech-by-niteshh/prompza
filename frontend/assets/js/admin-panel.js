(function () {
    async function loadAdminSummary() {
        const response = await fetch("/api/admin/summary");
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Failed to load admin summary.");
        }

        return data.summary;
    }

    async function loadCategoryTotals() {
        const response = await fetch("/api/admin/categories");
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Failed to load category totals.");
        }

        return data.categories || [];
    }

    async function changeAdminPassword(payload) {
        const response = await fetch("/api/admin/change-password", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Failed to change password.");
        }

        return data;
    }

    async function deletePromptRequest(promptId) {
        const response = await fetch(`/api/admin/prompts/${promptId}`, {
            method: "DELETE",
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Failed to delete prompt.");
        }

        return data;
    }

    function renderMetric(id, value) {
        const element = document.getElementById(id);

        if (element) {
            element.textContent = String(value);
        }
    }

    function renderPromptRows(prompts) {
        const tableBody = document.getElementById("admin-prompts-body");

        if (!tableBody) {
            return;
        }

        if (!prompts.length) {
            tableBody.innerHTML = `
                <tr>
                    <td>No prompts yet</td>
                    <td>-</td>
                    <td>-</td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = prompts.map((prompt) => `
            <tr>
                <td>${prompt.title}</td>
                <td>${prompt.category}</td>
                <td>${new Date(prompt.createdAt).toLocaleString()}</td>
            </tr>
        `).join("");
    }

    function setStatus(id, message, state) {
        const element = document.getElementById(id);

        if (!element) {
            return;
        }

        element.textContent = message;
        element.setAttribute("data-state", state || "");
    }

    function renderCategoryRows(categories) {
        const tableBody = document.getElementById("category-totals-body");

        if (!tableBody) {
            return;
        }

        if (!categories.length) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="2">No category data found.</td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = categories.map((category) => `
            <tr>
                <td>${category.category}</td>
                <td>${category.totalPrompts}</td>
            </tr>
        `).join("");
    }

    function initCategoryTotalsButton() {
        const button = document.getElementById("load-category-totals");

        if (!button) {
            return;
        }

        button.addEventListener("click", async () => {
            try {
                setStatus("category-status", "Loading category totals...", "loading");
                const categories = await loadCategoryTotals();
                renderCategoryRows(categories);
                setStatus("category-status", "Category totals loaded successfully.", "success");
            } catch (error) {
                setStatus("category-status", error.message, "error");
            }
        });
    }

    function initChangePasswordForm() {
        const form = document.getElementById("change-password-form");

        if (!form) {
            return;
        }

        form.addEventListener("submit", async (event) => {
            event.preventDefault();

            const oldPassword = document.getElementById("old-password")?.value || "";
            const newPassword = document.getElementById("new-password")?.value || "";
            const confirmPassword = document.getElementById("confirm-password")?.value || "";

            if (newPassword !== confirmPassword) {
                setStatus("password-status", "New password and confirm password must match.", "error");
                return;
            }

            try {
                setStatus("password-status", "Changing admin password...", "loading");
                await changeAdminPassword({
                    oldPassword,
                    newPassword,
                });
                form.reset();
                setStatus("password-status", "Admin password changed successfully.", "success");
            } catch (error) {
                setStatus("password-status", error.message, "error");
            }
        });
    }

    function initDeletePromptForm() {
        const form = document.getElementById("delete-prompt-form");
        const button = document.getElementById("delete-prompt-btn");

        if (!form || !button) {
            return;
        }

        form.addEventListener("submit", async (event) => {
            event.preventDefault();

            const promptId = (document.getElementById("delete-prompt-id")?.value || "").trim();

            if (!promptId) {
                setStatus("delete-prompt-status", "Please enter a prompt ID.", "error");
                return;
            }

            // MongoDB ObjectId is 24 hex characters
            if (!/^[a-f0-9]{24}$/i.test(promptId)) {
                setStatus("delete-prompt-status", "Invalid ID format. Must be a 24-character hex string.", "error");
                return;
            }

            const confirmed = confirm(`Are you sure you want to permanently delete prompt?\n\nID: ${promptId}\n\nThis action cannot be undone.`);

            if (!confirmed) {
                setStatus("delete-prompt-status", "Deletion cancelled.", "");
                return;
            }

            try {
                button.disabled = true;
                setStatus("delete-prompt-status", "Deleting prompt...", "loading");

                const result = await deletePromptRequest(promptId);

                form.reset();
                setStatus("delete-prompt-status", result.message || "Prompt deleted successfully.", "success");

                // Refresh dashboard data after deletion
                try {
                    const summary = await loadAdminSummary();
                    renderMetric("metric-total-prompts", summary.totalPrompts);
                    renderPromptRows(summary.latestPrompts);
                } catch (_refreshError) {
                    // Silently ignore refresh errors
                }
            } catch (error) {
                setStatus("delete-prompt-status", error.message, "error");
            } finally {
                button.disabled = false;
            }
        });
    }

    async function initAdminPanel() {
        const root = document.getElementById("admin-panel");

        if (!root) {
            return;
        }

        initCategoryTotalsButton();
        initChangePasswordForm();
        initDeletePromptForm();

        try {
            const summary = await loadAdminSummary();
            renderMetric("metric-total-prompts", summary.totalPrompts);
            renderMetric("metric-pending-requests", summary.totalRequests || 0);
            renderMetric("metric-active-users", summary.totalMessages || 0);
            renderMetric("metric-reviewed-today", summary.totalUsers || 0);
            renderPromptRows(summary.latestPrompts);
        } catch (error) {
            const tableBody = document.getElementById("admin-prompts-body");

            if (tableBody) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="3">${error.message}</td>
                    </tr>
                `;
            }
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initAdminPanel);
    } else {
        initAdminPanel();
    }
})();

