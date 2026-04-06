(function () {
  async function loadProgrammaticPages() {
    try {
      const res = await fetch("/programmatic-pages.json");

      if (!res.ok) {
        console.error("Failed to load programmatic pages");
        return;
      }

      const data = await res.json();

      if (!Array.isArray(data)) {
        console.error("Invalid programmatic pages format");
        return;
      }

      window.PROGRAMMATIC_PAGES = data;
    } catch (err) {
      console.error("Programmatic pages load error:", err);
    }
  }

  loadProgrammaticPages();
})();
