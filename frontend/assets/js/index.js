document.addEventListener("DOMContentLoaded", () => {
    if (window.prompzaSite && typeof window.prompzaSite.hydrateDynamicComponents === "function") {
        window.prompzaSite.hydrateDynamicComponents();
    }
});
