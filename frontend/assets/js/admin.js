(function () {
    function normalizeAdminLinks() {
        document.querySelectorAll("[data-admin-access]").forEach((link) => {
            link.setAttribute("href", "/dashboard");
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", normalizeAdminLinks);
    } else {
        normalizeAdminLinks();
    }
})();
