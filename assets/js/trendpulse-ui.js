(function () {
  const config = window.TRENDPULSE_CONFIG || {
    affiliateTag: "Drackk-20"
  };

  let productsCache = null;
  let productsPromise = null;

  function escapeHtml(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalize(value = "") {
    return String(value).trim().toLowerCase();
  }

  function capitalize(value = "") {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
  }

  function formatPrice(value) {
    return `$${safeNumber(value).toFixed(2)}`;
  }

  function ensureAffiliateTag(url) {
    const raw = String(url || "").trim();
    if (!raw) return "#";

    try {
      const parsed = new URL(raw);
      if (parsed.hostname.includes("amazon")) {
        parsed.searchParams.set("tag", config.affiliateTag);
      }
      return parsed.toString();
    } catch {
      return raw;
    }
  }

  function proxyImage(url) {
    if (!url) return "";
    return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=600`;
  }

  function normalizeProduct(row) {
    return {
      ...row,
      name: row.name || "Product",
      category: normalize(row.category || "general"),
      price: safeNumber(row.price, 0),
      amazon_rating: safeNumber(row.amazon_rating, 0),
      amazon_review_count: safeNumber(row.amazon_review_count, 0),
      affiliate_link: ensureAffiliateTag(row.affiliate_link || row.amazon_url || "#")
    };
  }

  // 🔥 FETCH PRODUITS (DEBUG ACTIVÉ)
  async function fetchProducts() {
    if (productsCache) return productsCache;
    if (productsPromise) return productsPromise;

    if (!window.supabaseClient) {
      console.error("Supabase client missing");
      return [];
    }

    productsPromise = window.supabaseClient
      .from("products")
      .select("*")
      .limit(200)
      .then(({ data, error }) => {
        console.log("🔥 RAW SUPABASE:", data);
        console.log("❌ ERROR:", error);

        if (error) return [];

        const normalized = (data || []).map(normalizeProduct);

        console.log("✅ NORMALIZED:", normalized);

        productsCache = normalized;
        return normalized;
      });

    return productsPromise;
  }

  function productCard(p) {
    return `
      <div class="border border-zinc-800 rounded-2xl overflow-hidden bg-zinc-900">
        <img src="${proxyImage(p.image_url)}" class="w-full h-40 object-contain bg-white"/>
        <div class="p-3">
          <h3 class="text-sm font-bold">${escapeHtml(p.name)}</h3>
          <p class="text-green-400 font-bold">${formatPrice(p.price)}</p>
        </div>
      </div>
    `;
  }

  async function renderDealsPage() {
    const grid = document.getElementById("deals-grid");
    if (!grid) return;

    const products = await fetchProducts();

    console.log("📦 PRODUCTS USED:", products);

    // 🔥 TEMP: PAS DE FILTRE POUR DEBUG
    let items = products;

    console.log("🎯 FINAL ITEMS:", items);

    grid.innerHTML = items.map(productCard).join("");
  }

  // 🔥 DEBUG GLOBAL (utilisable depuis navigateur)
  window.debugDeals = async function () {
    const { data, error } = await window.supabaseClient
      .from("products")
      .select("*")
      .limit(5);

    console.log("DEBUG DATA:", data);
    console.log("DEBUG ERROR:", error);

    return { data, error };
  };

  document.addEventListener("DOMContentLoaded", () => {
    renderDealsPage();
  });
})();
