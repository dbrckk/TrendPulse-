(function () {
  const config = window.TRENDPULSE_CONFIG || {
    affiliateTag: "Drackk-20"
  };

  let productsCache = null;
  let productsPromise = null;

  // 🔥 DEBUG BOX (VISIBLE SUR MOBILE)
  const debugBox = document.createElement("div");
  debugBox.style.position = "fixed";
  debugBox.style.bottom = "0";
  debugBox.style.left = "0";
  debugBox.style.right = "0";
  debugBox.style.maxHeight = "200px";
  debugBox.style.overflow = "auto";
  debugBox.style.background = "black";
  debugBox.style.color = "lime";
  debugBox.style.fontSize = "10px";
  debugBox.style.zIndex = "9999";
  debugBox.style.padding = "5px";
  document.body.appendChild(debugBox);

  function debugLog(msg) {
    console.log(msg);
    debugBox.innerText += "\n" + JSON.stringify(msg);
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function formatPrice(value) {
    return `$${safeNumber(value).toFixed(2)}`;
  }

  function proxyImage(url) {
    if (!url) return "";
    return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=600`;
  }

  function normalizeProduct(row) {
    return {
      ...row,
      name: row.name || "Product",
      price: safeNumber(row.price, 0),
      affiliate_link: row.affiliate_link || row.amazon_url || "#"
    };
  }

  // 🔥 FETCH PRODUITS
  async function fetchProducts() {
    if (productsCache) return productsCache;
    if (productsPromise) return productsPromise;

    if (!window.supabaseClient) {
      debugLog("❌ Supabase client missing");
      return [];
    }

    productsPromise = window.supabaseClient
      .from("products")
      .select("*")
      .limit(50)
      .then(({ data, error }) => {
        debugLog("🔥 RAW SUPABASE:");
        debugLog(data);
        debugLog("❌ ERROR:");
        debugLog(error);

        if (error) return [];

        const normalized = (data || []).map(normalizeProduct);

        debugLog("✅ NORMALIZED:");
        debugLog(normalized);

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
          <h3 class="text-sm font-bold">${p.name}</h3>
          <p class="text-green-400 font-bold">${formatPrice(p.price)}</p>
        </div>
      </div>
    `;
  }

  async function renderDealsPage() {
    const grid = document.getElementById("deals-grid");
    if (!grid) {
      debugLog("❌ deals-grid not found");
      return;
    }

    const products = await fetchProducts();

    debugLog("📦 PRODUCTS USED:");
    debugLog(products);

    grid.innerHTML = products.map(productCard).join("");
  }

  // 🔥 DEBUG MANUEL (optionnel)
  window.debugDeals = async function () {
    const { data, error } = await window.supabaseClient
      .from("products")
      .select("*")
      .limit(5);

    debugLog("MANUAL DEBUG DATA:");
    debugLog(data);
    debugLog("MANUAL ERROR:");
    debugLog(error);
  };

  document.addEventListener("DOMContentLoaded", () => {
    renderDealsPage();
  });
})();
