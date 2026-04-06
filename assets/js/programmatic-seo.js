(function () {
  function getSlugFromURL() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (parts[0] === "collections" && parts[1]) {
      return decodeURIComponent(parts[1]);
    }
    return null;
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function computeScore(product) {
    return (
      safeNumber(product.reviews) * 0.4 +
      safeNumber(product.rating) * 100 * 0.3 +
      safeNumber(product.discount) * 10 * 0.2 +
      safeNumber(product.priority) * 4
    );
  }

  function capitalize(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
  }

  async function loadProgrammaticPage() {
    const slug = getSlugFromURL();
    if (!slug) return;

    const page = (window.PROGRAMMATIC_PAGES || []).find(
      (p) => p.slug === slug
    );

    if (!page) return;

    const titleEl = document.getElementById("collection-title");
    const descEl = document.getElementById("collection-description");
    const countEl = document.getElementById("collection-count");
    const gridEl = document.getElementById("collection-grid");
    const seoTextEl = document.getElementById("collection-seo-text");
    const relatedEl = document.getElementById("collection-related-links");
    const emptyEl = document.getElementById("collection-empty-state");

    if (titleEl) titleEl.textContent = page.title;
    if (descEl) descEl.textContent = page.description;
    if (seoTextEl) seoTextEl.textContent = page.seoText;

    document.title = `${page.title} | TrendPulse`;

    const canonical = document.getElementById("canonical-url");
    if (canonical) {
      canonical.setAttribute(
        "href",
        `https://www.trend-pulse.shop/collections/${page.slug}`
      );
    }

    if (!window.TrendPulseData || !window.TrendPulseUI) {
      console.error("Missing data or UI");
      return;
    }

    try {
      let products = await window.TrendPulseData.fetchCollectionProducts(
        page,
        60
      );

      products = products
        .map((p) => ({
          ...p,
          score: computeScore(p)
        }))
        .sort((a, b) => b.score - a.score);

      if (!products.length) {
        if (emptyEl) emptyEl.classList.remove("hidden");
        return;
      }

      if (window.TrendPulseUI) {
        window.TrendPulseUI.renderProducts(products, gridEl);
      }

      if (countEl) {
        countEl.textContent = `${products.length} products`;
      }

      if (relatedEl && window.PROGRAMMATIC_PAGES) {
        const related = window.PROGRAMMATIC_PAGES
          .filter((p) => p.category === page.category && p.slug !== page.slug)
          .slice(0, 6);

        relatedEl.innerHTML = related
          .map(
            (p) => `
              <a href="/collections/${p.slug}" class="rounded-full border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white">
                ${capitalize(p.title)}
              </a>
            `
          )
          .join("");
      }
    } catch (err) {
      console.error("Programmatic page error:", err);
    }
  }

  document.addEventListener("DOMContentLoaded", loadProgrammaticPage);
})();
